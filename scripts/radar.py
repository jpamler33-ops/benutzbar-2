"""COASTFINDER forum intelligence: opt-in, public RSS only, standard-library implementation.

This module does not scrape full forums, search engines or Reddit. It ingests short
feed excerpts, retains canonical links, and never treats mentions as catches.
"""
from __future__ import annotations

import argparse
import calendar
import datetime as dt
import email.utils
import hashlib
import html
from html.parser import HTMLParser
import json
import logging
import os
from pathlib import Path
import re
import sqlite3
import threading
import time
from urllib import error, parse, request, robotparser
import xml.etree.ElementTree as ET

BASE = Path(__file__).resolve().parent.parent
DEFAULT_DB = BASE / 'backend' / 'radar.sqlite3'
SOURCES_FILE = BASE / 'backend' / 'sources.json'
USER_AGENT = 'COASTFINDER-ResearchRadar/3.0 (+local RSS feed research; no full-text crawling)'
MAX_FEED_BYTES = 1_000_000
MAX_ITEMS_PER_FEED = 100
MAX_EXCERPT = 220
FETCH_TIMEOUT = 12
NS_ATOM = '{http://www.w3.org/2005/Atom}'
LOGGER = logging.getLogger('coastfinder.radar')

REGIONS = {
    'istria': ('HR', ['istria', 'istrien', 'istra', 'pula', 'rovinj', 'porec', 'poreč', 'medulin', 'umag', 'premantura']),
    'zadar': ('HR', ['zadar', 'pag', 'nin', 'privlaka', 'vir', 'biograd']),
    'split': ('HR', ['split', 'trogir', 'omis', 'omiš', 'makarska', 'solta', 'šolta', 'brac', 'brač', 'hvar', 'vis']),
    'dubrovnik': ('HR', ['dubrovnik', 'cavtat', 'cavtat', 'korcula', 'korčula', 'mljet']),
    'brittany': ('FR', ['bretagne', 'brittany', 'breizh', 'finistère', 'finistere', 'brest', 'quiberon', 'lorient', 'concarneau', 'saint-malo', 'saint malo']),
    'normandy': ('FR', ['normandie', 'normandy', 'cotentin', 'cherbourg', 'calvados', 'dieppe', 'le havre', 'granville']),
    'riviera': ('FR', ['côte d’azur', "côte d'azur", 'cote d azur', 'provence', 'nice', 'cannes', 'antibes', 'var', 'toulon', 'menton', 'saint-raphaël', 'saint raphael']),
}
COUNTRY_TERMS = {
    'HR': ['croatia', 'kroatien', 'hrvatska', 'kroatisch', 'jadran', 'adriatic', 'adriatique', 'adriaküste', 'adria'],
    'FR': ['france', 'frankreich', 'française', 'francais', 'französisch', 'atlantique', 'bretagne', 'normandie'],
}
FISH = {
    'Wolfsbarsch': ['wolfsbarsch', 'sea bass', 'seabass', 'bar commun', 'dicentrarchus labrax', 'lubina', 'brancin', 'loup de mer'],
    'Dorade': ['dorade', 'dorada', 'orada', 'orada', 'orada', 'komarča', 'komarca', 'gilt-head bream'],
    'Dentex': ['dentex', 'zubatac'],
    'Bonito': ['bonito', 'palamida', 'palamita'],
    'Makrele': ['makrele', 'mackerel', 'maquereau', 'skuša', 'skusa'],
    'Meeräsche': ['meeräsche', 'mullet', 'mulet', 'cipal'],
    'Sargo': ['sargo', 'sargue', 'šarag', 'sarag'],
    'Barrakuda': ['barrakuda', 'barracuda', 'barakuda'],
    'Tintenfisch': ['tintenfisch', 'calamar', 'calamari', 'lignje', 'lignja', 'squid'],
}
THEMES = {
    'Wind': ['wind', 'vent', 'bura', 'bora', 'jugo', 'maestral', 'mistral', 'tramontane'],
    'Strömung': ['strömung', 'current', 'courant', 'struja', 'morske struje'],
    'Wellen': ['wellen', 'waves', 'vague', 'houle', 'valovi', 'brandung', 'surf'],
    'Gezeiten': ['gezeiten', 'tide', 'marée', 'maree', 'plima', 'oseka'],
    'Uferangeln': ['shore', 'vom ufer', 'du bord', 's obale', 's obali', 'surfcasting', 'rockfishing', 'shore jigging', 'spinning', 'morski ribolov'],
    'Küstenstruktur': ['riff', 'reef', 'greben', 'mole', 'jetty', 'breakwater', 'felsen', 'rocky coast', 'klif', 'cap', 'pointe'],
}
COAST_TERMS = ['meer', 'marin', 'sea', 'shore', 'coast', 'küst', 'mer', 'obale', 'obali', 'morski', 'jadran', 'adriatic', 'adriatique', 'surfcasting', 'rockfishing', 'shore jigging', 'plage', 'strand', 'beach', 'digue', 'rivage']


class StripTags(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.ignore = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.ignore += 1
    def handle_endtag(self, tag):
        if tag in ('script', 'style') and self.ignore:
            self.ignore -= 1
    def handle_data(self, data):
        if not self.ignore:
            self.parts.append(data)


def clean_text(value: str, limit: int = 300) -> str:
    parser = StripTags()
    parser.feed(value or '')
    s = ' '.join(html.unescape(' '.join(parser.parts)).split())
    return s[:limit].rstrip()


def normalize_url(raw: str, feed_url: str) -> str | None:
    """Accept only secure URLs on same registered source hostname; strip tracking."""
    try:
        value = parse.urljoin(feed_url, raw.strip())
        u, f = parse.urlsplit(value), parse.urlsplit(feed_url)
        if u.scheme != 'https' or u.username or u.password:
            return None
        host = (u.hostname or '').lower().removeprefix('www.')
        base = (f.hostname or '').lower().removeprefix('www.')
        if host != base or u.port not in (None, 443):
            return None
        params = [(k, v) for k, v in parse.parse_qsl(u.query, keep_blank_values=False) if not (k.lower().startswith('utm_') or k.lower() in ('fbclid','gclid','ref','source'))]
        query = parse.urlencode(sorted(params), doseq=True)
        path = u.path.rstrip('/') or '/'
        return parse.urlunsplit(('https', host, path, query, ''))
    except (ValueError, TypeError):
        return None


def matches(text: str, word: str) -> bool:
    return bool(re.search(r'(?<!\w)' + re.escape(word) + r'(?!\w)', text, flags=re.I))


# Geographic names which are also ordinary words need unambiguous evidence.
# French "cannes" means fishing rods, not necessarily the city Cannes.
AMBIGUOUS_PLACES = {
    'riviera': {'cannes', 'nice', 'var'},
    'split': {'vis'},
    'zadar': {'vir'},
}
GEOGRAPHIC_CONTEXT = {
    'cannes': r"(?:\b(?:à|de|près de|au large de|port de|baie de|plage de)\s+cannes\b|\bcannes\s*\(06\))",
    'nice': r"(?:\b(?:à|de|près de|au large de|port de|baie de|plage de)\s+nice\b|\bnice\s*\(06\))",
    'var': r"(?:\b(?:département du|côtes? du)\s+var\b|\bcôte varoise\b|\bvar\s*\(83\))",
    'vis': r"(?:\b(?:otok|island of|île de|insel|na otoku)\s+vis\b|\bvis\s*\(croati[ae]\))",
    'vir': r"(?:\b(?:otok|island of|île de|insel|na otoku)\s+vir\b|\bvir\s*\(croati[ae]\))",
}
# Narrow Croatian inflections with explicit geographic context.
# A nearby place name is evidence only for a broad *region*, never a pin.
INFLECTED_REGION_CONTEXT = {
    'split': (r'\bmakarsk(?:oj|e|a|u|om)\s+rivijer(?:i|e|a|u|om)\b',),
}
# Context indicates discussion, not a verified catch or a fish population.
FISHING_CONTEXT = (
    'angel', 'angeln', 'angler', 'fishing', 'pêche', 'peche', 'pêcher', 'pecher',
    'ribolov', 'ribolova', 'pecanje', 'pecati', 'caught', 'catch', 'gefangen',
    'fangen', 'fangbericht', 'ulov', 'ulovljen', 'ulovljena', 'prise', 'pris',
    'surfcasting', 'rockfishing', 'shore jigging', 'spinnfischen', 'spinning', 'eging',
    'poisson', 'poissons', 'fische', 'fisch',
)
CATCH_CONTEXT = ('caught', 'gefangen', 'fangbericht', 'ulov', 'ulovljen', 'ulovljena', 'pris', 'prise')
AD_HEADLINE = re.compile(
    r"\b(?:vendues?|vends|vendre|vente|à vendre|a vendre|occasion|"
    r"verkaufe|verkauf|verkaufen|prodaja|prodajem|prodam|kupujem|akcija|popust|for sale|selling|wanted|suche zu kaufen|"
    r"wtb|wts|sold|à céder|a ceder)\b", re.I
)
GEAR_HEADLINE = re.compile(
    r"\b(?:cannes?|moulinets?|blanks?|rouleaux|rods?|reels?|"
    r"tackle|fishing gear|angelrute[n]?|rollen|štapovi|štapova|stapovi|stapova|ribolovni pribor|test de matériel|"
    r"réparation|reparation|restaurer)\b", re.I
)


def _regions(text: str) -> list[str]:
    result = []
    for region, (_, terms) in REGIONS.items():
        ambiguous = AMBIGUOUS_PLACES.get(region, set())
        # A written negation is not evidence that a story takes place there.
        # Stay conservative if a keyword appears only in an exclusion.
        def positive_place(term):
            if not matches(text, term):
                return False
            if term == 'makarska' and re.search(
                r'\b(?:keine|nicht\s+in|nicht\s+bei|not\s+in|ohne)\s+makarska\b',
                text, flags=re.I
            ):
                return False
            return True
        if any(positive_place(term) for term in terms if term not in ambiguous):
            result.append(region)
        elif any(re.search(GEOGRAPHIC_CONTEXT[name], text, flags=re.I) for name in ambiguous):
            result.append(region)
        elif any(re.search(pattern, text, flags=re.I)
                 for pattern in INFLECTED_REGION_CONTEXT.get(region, ())):
            result.append(region)
    return result


def classify(title: str, excerpt: str, published: str | None):
    # Word boundaries prevent "mer" matching fragments of unrelated words.
    content = f'{title} {excerpt}'.lower()
    regions = _regions(content)
    countries = sorted({REGIONS[r][0] for r in regions} |
                       {country for country, words in COUNTRY_TERMS.items()
                        if any(matches(content, word) for word in words)})
    fish = [name for name, terms in FISH.items()
            if any(matches(content, term) for term in terms)]
    themes = [name for name, terms in THEMES.items()
              if any(matches(content, term) for term in terms)]
    coastal_context = any(matches(content, word) for word in COAST_TERMS)
    fishing_context = bool(fish) or any(matches(content, word) for word in FISHING_CONTEXT)
    catch_context = any(matches(content, word) for word in CATCH_CONTEXT)
    ad = bool(AD_HEADLINE.search(title))
    hardware = bool(GEAR_HEADLINE.search(title)) and not catch_context and \
               not re.search(GEOGRAPHIC_CONTEXT['cannes'], title, flags=re.I)
    # Prefer precision over recall. Region and maritime context are mandatory,
    # unless a geo-located catch names a recognizable fish species.
    relevant = bool(regions and fishing_context and
                    (coastal_context or (fish and catch_context)) and
                    not ad and not hardware)
    score = (30 if regions else 0) + (15 if countries else 0) + \
            (20 if coastal_context else 0) + (12 if fish else 0) + \
            (12 if themes else 0) + (11 if catch_context else 0)
    score = min(100, score) if relevant else 0
    month = int(published[5:7]) if isinstance(published, str) and re.match(r'^\d{4}-\d{2}', published) else None
    if month not in range(1, 13):
        month = None
    season = ('Winter' if month in (12, 1, 2) else
              'Frühling' if month in (3, 4, 5) else
              'Sommer' if month in (6, 7, 8) else 'Herbst') if month else None
    return {'regions': regions, 'countries': countries, 'fish': fish,
            'themes': themes, 'relevance': score, 'relevant': relevant,
            'publication_season': season}


def iso_date(value: str | None) -> str | None:
    if not value:
        return None
    try:
        obj = email.utils.parsedate_to_datetime(value)
        return obj.astimezone(dt.timezone.utc).isoformat().replace('+00:00','Z')
    except (TypeError, ValueError, OverflowError):
        try:
            obj = dt.datetime.fromisoformat(value.replace('Z','+00:00'))
            if obj.tzinfo is None:
                obj = obj.replace(tzinfo=dt.timezone.utc)
            return obj.astimezone(dt.timezone.utc).isoformat().replace('+00:00','Z')
        except ValueError:
            return None


def first_text(elem: ET.Element, names: tuple[str,...]) -> str:
    for name in names:
        obj = elem.find(name)
        if obj is not None and obj.text:
            return obj.text
    return ''


def parse_feed(blob: bytes, source: dict) -> list[dict]:
    if len(blob) > MAX_FEED_BYTES:
        raise ValueError('Feed too large')
    try:
        root = ET.fromstring(blob)
    except ET.ParseError as exc:
        raise ValueError('Feed ist kein gültiges XML') from exc
    items = root.findall('./channel/item') if root.tag.lower() in ('rss','rdf') or root.tag.endswith('RDF') else root.findall(f'{NS_ATOM}entry')
    if not items:
        items = root.findall('.//item')
    output = []
    seen: set[str] = set()
    for item in items[:MAX_ITEMS_PER_FEED]:
        is_atom = item.tag == f'{NS_ATOM}entry'
        title = clean_text(first_text(item, (f'{NS_ATOM}title','title')) if is_atom else first_text(item, ('title',)), 160)
        summary = clean_text(first_text(item, (f'{NS_ATOM}summary',f'{NS_ATOM}content')) if is_atom else first_text(item,('description','{http://purl.org/rss/1.0/modules/content/}encoded')), MAX_EXCERPT)
        if is_atom:
            links = [e.get('href') for e in item.findall(f'{NS_ATOM}link') if e.get('rel', 'alternate') == 'alternate']
            raw_url = next((u for u in links if u), '')
            pub = first_text(item, (f'{NS_ATOM}published', f'{NS_ATOM}updated'))
        else:
            raw_url = first_text(item, ('link',))
            pub = first_text(item, ('pubDate', '{http://purl.org/dc/elements/1.1/}date'))
        link = normalize_url(raw_url, source['feed_url'])
        if not link or not title or link in seen:
            continue
        seen.add(link)
        # Publisher-controlled category tags are not catch or location evidence.
        category_labels = [clean_text(el.text or '', 100) for el in item.findall('category')]
        if is_atom:
            category_labels += [clean_text(el.get('term') or '', 100) for el in item.findall(f'{NS_ATOM}category')]
        required = {str(x).casefold() for x in source.get('allowed_categories', [])}
        if required and not required.intersection(x.casefold() for x in category_labels):
            continue
        published = iso_date(pub)
        # Geography and relevance must come from the article heading/excerpt.
        # Publisher category tags can enrich fish/theme labels but cannot create
        # a fishing location or turn a generic item into a regional spot.
        text_tags = classify(title, summary, published)
        tags = classify(title, summary + ' ' + ' '.join(category_labels), published)
        for key in ('regions', 'countries', 'relevant', 'relevance'):
            tags[key] = text_tags[key]
        if not tags['relevant']:
            # Special-source coastal editorial report: useful reading without
            # verified coordinates or classification as a regional catch.
            if (not source.get('editorial_adriatic') or not required or
                    tags['regions'] or AD_HEADLINE.search(title) or GEAR_HEADLINE.search(title)):
                continue
            tags['countries'] = []  # Croatian publisher != verified Croatian catch
            tags['relevance'] = 0
        output.append({'id':hashlib.sha256(link.encode('utf-8')).hexdigest()[:24], 'source_id':source['id'], 'url':link, 'title':title, 'excerpt':summary, 'published_at':published, **tags})
    return output


def load_sources(file: Path = SOURCES_FILE) -> list[dict]:
    data = json.loads(file.read_text(encoding='utf-8'))
    if not isinstance(data, list):
        raise ValueError('sources.json must be list')
    ids = set()
    for s in data:
        if not {'id','name','feed_url','enabled'} <= s.keys():
            raise ValueError('Missing source field')
        u = parse.urlsplit(s['feed_url'])
        if not re.fullmatch(r'[a-z0-9_-]{2,64}',s['id']) or s['id'] in ids or u.scheme != 'https' or not u.hostname or u.username or u.password:
            raise ValueError('Invalid feed source')
        ids.add(s['id'])
    return data


def connect(db_path: Path = DEFAULT_DB) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True,exist_ok=True)
    db = sqlite3.connect(db_path, timeout=10, check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA busy_timeout=10000')
    db.execute('PRAGMA journal_mode=WAL')
    db.executescript('''
      CREATE TABLE IF NOT EXISTS articles(
        id TEXT PRIMARY KEY, source_id TEXT NOT NULL, url TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL, excerpt TEXT NOT NULL, published_at TEXT,
        first_seen TEXT NOT NULL, last_seen TEXT NOT NULL,
        countries TEXT NOT NULL, regions TEXT NOT NULL, fish TEXT NOT NULL,
        themes TEXT NOT NULL, publication_season TEXT, relevance INTEGER NOT NULL,
        evidence TEXT NOT NULL DEFAULT 'Erwähnung im Feed – nicht verifiziert'
      );
      CREATE INDEX IF NOT EXISTS idx_articles_seen ON articles(last_seen DESC);
      CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source_id);
      CREATE TABLE IF NOT EXISTS syncs(
        id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL,
        checked_at TEXT NOT NULL, status TEXT NOT NULL, fetched INTEGER NOT NULL,
        stored INTEGER NOT NULL, message TEXT NOT NULL DEFAULT ''
      );
    ''')
    db.commit()
    return db


def store_articles(db: sqlite3.Connection, articles: list[dict], clock=None):
    now = (clock or dt.datetime.now(dt.timezone.utc)).isoformat().replace('+00:00','Z')
    added = 0
    with db:
        for p in articles:
            exists = db.execute('SELECT id FROM articles WHERE id=?',(p['id'],)).fetchone()
            if not exists:
                db.execute('''INSERT INTO articles(id,source_id,url,title,excerpt,published_at,first_seen,last_seen,countries,regions,fish,themes,publication_season,relevance)
                     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)''', (p['id'],p['source_id'],p['url'],p['title'],p['excerpt'],p['published_at'],now,now,json.dumps(p['countries']),json.dumps(p['regions']),json.dumps(p['fish']),json.dumps(p['themes']),p['publication_season'],p['relevance']))
                added+=1
            else:
                db.execute('''UPDATE articles SET last_seen=?, title=?, excerpt=?, regions=?, fish=?, themes=?, relevance=?, countries=? WHERE id=?''',
                    (now,p['title'],p['excerpt'],json.dumps(p['regions']),json.dumps(p['fish']),json.dumps(p['themes']),p['relevance'],json.dumps(p['countries']),p['id']))
    return added


def _get_bytes(url: str, limit=MAX_FEED_BYTES) -> bytes:
    req = request.Request(url, headers={'User-Agent':USER_AGENT, 'Accept':'application/rss+xml, application/atom+xml, application/xml;q=0.9'})
    with request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
        real = parse.urlsplit(resp.url)
        if real.scheme != 'https' or real.hostname != parse.urlsplit(url).hostname:
            raise ValueError('Untrusted redirect – host changed')
        length = resp.headers.get('Content-Length')
        if length and int(length)>limit:
            raise ValueError('Response too large')
        blob = resp.read(limit+1)
        if len(blob)>limit:
            raise ValueError('Response too large')
        return blob


def _robots_allows(source: dict, fetcher=_get_bytes) -> bool:
    u=parse.urlsplit(source['feed_url'])
    robots=f'{u.scheme}://{u.netloc}/robots.txt'
    try:
        lines=fetcher(robots, 128_000).decode('utf-8',errors='replace').splitlines()
    except error.HTTPError as exc:
        if exc.code in (404,410):
            return True
        raise
    rp=robotparser.RobotFileParser()
    rp.parse(lines)
    return rp.can_fetch(USER_AGENT,source['feed_url'])


def sync_one(db: sqlite3.Connection, source: dict, fetcher=_get_bytes, robots_checker=None) -> dict:
    now=dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00','Z')
    retrieved_items = 0
    try:
        allowed = (robots_checker or (lambda s:_robots_allows(s,fetcher)))(source)
        if not allowed:
            raise PermissionError('robots.txt untersagt diesen Feed')
        blob=fetcher(source['feed_url'])
        root=ET.fromstring(blob)
        retrieved_items=len(root.findall('.//item'))+len(root.findall('.//{http://www.w3.org/2005/Atom}entry'))
        posts=parse_feed(blob,source)
        added=store_articles(db,posts)
        status,message='ok',''
    except Exception as exc:
        posts=[];added=0;status='error';message=f'{type(exc).__name__}: {str(exc)[:160]}'
    with db:
        db.execute('INSERT INTO syncs(source_id,checked_at,status,fetched,stored,message) VALUES(?,?,?,?,?,?)',
          (source['id'],now,status,retrieved_items,added,message))
        db.execute('DELETE FROM syncs WHERE id NOT IN (SELECT id FROM syncs ORDER BY id DESC LIMIT 1000)')
    return {'source':source['id'],'status':status,'matched':len(posts),'new':added,'error':message}


def sync_all(db:sqlite3.Connection, sources=None, fetcher=_get_bytes, robots_checker=None) -> list[dict]:
    srcs=sources if sources is not None else load_sources()
    return [sync_one(db,s,fetcher,robots_checker) for s in srcs if s.get('enabled')]


def query_articles(db:sqlite3.Connection, country='',region='',limit=30) -> list[dict]:
    if country not in ('','FR','HR') or region not in ('',*REGIONS):
        raise ValueError('Unknown filter')
    limit=max(1,min(1000,int(limit)))
    where=[];params=[]
    if country:
        where.append('countries LIKE ?');params.append('%\"'+country+'\"%')
    if region:
        where.append('regions LIKE ?');params.append('%\"'+region+'\"%')
    sql='SELECT * FROM articles'+(' WHERE '+' AND '.join(where) if where else '')+' ORDER BY COALESCE(published_at,first_seen) DESC LIMIT ?'
    rows=db.execute(sql,(*params,limit)).fetchall()
    output=[]
    for row in rows:
        p=dict(row)
        for k in ('countries','regions','fish','themes'):
            p[k]=json.loads(p[k])
        if country and country not in p['countries']:
            continue
        if region and region not in p['regions']:
            continue
        output.append(p)
        if len(output)>=limit:
            break
    return output


def article_summary(rows:list[dict]) -> dict:
    by_fish,by_theme,by_region,by_combination,by_publication_season={},{},{},{},{}
    for row in rows:
        for k,label in (('fish',by_fish),('themes',by_theme),('regions',by_region)):
            for x in row[k]:
                if x not in label:
                    label[x]={'mentions':0,'sources':set()}
                label[x]['mentions']+=1;label[x]['sources'].add(row['source_id'])
        for fish in row['fish']:
            for theme in row['themes']:
                key=(fish,theme)
                if key not in by_combination:by_combination[key]={'mentions':0,'sources':set()}
                by_combination[key]['mentions']+=1;by_combination[key]['sources'].add(row['source_id'])
        season=row.get('publication_season')
        if season:
            by_publication_season[season]=by_publication_season.get(season,0)+1
    def finish(items):
        return sorted(({'name':name,'mentions':v['mentions'],'source_count':len(v['sources'])} for name,v in items.items()),key=lambda x:(-x['source_count'],-x['mentions'],x['name']))
    pairs=sorted(({'fish':fish,'theme':theme,'mentions':v['mentions'],'source_count':len(v['sources'])} for (fish,theme),v in by_combination.items()),key=lambda x:(-x['source_count'],-x['mentions'],x['fish'],x['theme']))
    return {'total_articles':len(rows),'fish_mentions':finish(by_fish),'theme_mentions':finish(by_theme),'region_mentions':finish(by_region),
            'co_mentions':pairs[:25],'publication_seasons':by_publication_season,
            'note':'Nur gemeinsame Wörter in Quellen, keine belegte Ursache oder Fangchance. Jahreszeit stammt vom Veröffentlichungsdatum, nicht vom Fangdatum.'}


def get_status(db:sqlite3.Connection,sources=None):
    sources=sources if sources is not None else load_sources()
    result=[]
    for s in sources:
        row=db.execute('SELECT checked_at,status,fetched,stored,message FROM syncs WHERE source_id=? ORDER BY id DESC LIMIT 1',(s['id'],)).fetchone()
        result.append({'id':s['id'],'name':s['name'],'homepage':s.get('homepage'),'enabled':s.get('enabled',False),
            'kind':s.get('kind','forum'),'scope':s.get('scope',''),
            'last_check':dict(row) if row else None})
    return {'count':db.execute('SELECT COUNT(*) FROM articles').fetchone()[0], 'sources':result,'scope':'Nur konfigurierte, öffentliche RSS-Feeds. Nicht alle Foren; keine Reddit-Sammlung.','data_type':'Quellenhinweise, keine überprüften Fänge'}


def main():
    parser=argparse.ArgumentParser(description='COASTFINDER RSS Radar')
    parser.add_argument('command',choices=('sync','status'))
    parser.add_argument('--db',type=Path,default=DEFAULT_DB)
    args=parser.parse_args()
    db=connect(args.db)
    if args.command=='sync':
        data=sync_all(db)
    else:
        data=get_status(db)
    print(json.dumps(data,ensure_ascii=False,indent=2))
    return 0

if __name__=='__main__':
    raise SystemExit(main())
