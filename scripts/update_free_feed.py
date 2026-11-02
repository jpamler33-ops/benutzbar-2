"""GitHub Actions: collect explicitly configured public RSS feeds into PUBLIC static JSON.
No personal catch records, no broad scraping, no forum fulltext pages.
"""
import datetime as dt
from urllib.parse import urlsplit
import json
from pathlib import Path
import tempfile
import radar

BASE=Path(__file__).resolve().parent.parent
OUT=BASE/'feed'/'radar.json'
SOURCES=BASE/'scripts'/'sources.json'


def revalidate_previous(rows, sources):
    """Recheck cached articles so old false positives cannot survive every refresh."""
    active = {s['id']:s for s in sources if s.get('enabled')}
    approved = {key:urlsplit(s['feed_url']).hostname.lower().removeprefix('www.')
                for key,s in active.items()}
    kept = []
    for item in rows:
        if not isinstance(item, dict) or not isinstance(item.get('id'), str):
            continue
        source_id = item.get('source_id')
        if source_id not in approved:
            continue
        try:
            url = urlsplit(item.get('url') or '')
        except (ValueError, TypeError):
            continue
        if url.scheme != 'https' or url.username or url.password or \
                (url.hostname or '').lower().removeprefix('www.') != approved[source_id]:
            continue
        title, excerpt = item.get('title'), item.get('excerpt')
        if not isinstance(title, str) or not isinstance(excerpt, str):
            continue
        tags = radar.classify(title, excerpt, item.get('published_at'))
        if not tags['relevant']:
            # A specialist editorial article was admitted only through its verified
            # RSS category on first ingest. Retain that classification across polls,
            # but never turn an unlocated item into a mapped regional catch.
            source = active[source_id]
            if (source.get('editorial_adriatic') and not radar.AD_HEADLINE.search(title)
                    and not radar.GEAR_HEADLINE.search(title)
                    and (not item.get('regions') or set(item['regions']) <= set(tags['regions']))):
                kept.append(item)
            continue
        kept.append({**item, **{k:v for k,v in tags.items() if k != 'relevant'}})
    return kept

def update():
    sources=radar.load_sources(SOURCES)
    old={}
    if OUT.exists():
        try: old=json.loads(OUT.read_text('utf-8'))
        except (ValueError,OSError): old={}
    prev=old.get('articles',[])
    if not isinstance(prev,list): prev=[]
    with tempfile.TemporaryDirectory() as tmp:
        db=radar.connect(Path(tmp)/'run.sqlite3')
        try:
            radar.sync_all(db,sources=sources)
            new=radar.query_articles(db,limit=1000)
            statuses=radar.get_status(db,sources=sources)['sources']
        finally: db.close()
    # Only keep validated, normalized source rows and public non-sensitive metadata.
    validated=revalidate_previous(prev,sources)
    merged={p['id']:p for p in validated}
    for p in new: merged[p['id']]=p
    # Bounded public dataset; do not publish private catches, tokens or per-user coordinates.
    ordered=sorted(merged.values(),key=lambda p:p.get('published_at') or p.get('first_seen') or '',reverse=True)[:400]
    public_fields={'id','source_id','url','title','excerpt','published_at','first_seen','last_seen','regions','countries','fish','themes','publication_season','relevance','evidence'}
    articles=[{k:v for k,v in p.items() if k in public_fields} for p in ordered]
    result={'discarded_old_entries':len(prev)-len(validated), 'updated_at':dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00','Z'),
            'sources':statuses,'articles':articles,
            'scope':'Nur konfigurierte und robots.txt-zugelassene RSS-Feeds; keine flächendeckende Forensuche.',
            'data_type':'Unbestätigte Quellenhinweise, keine tatsächlichen Fänge'}
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'sources':[(s['id'],s['last_check']['status'] if s['last_check'] else 'unchecked') for s in statuses], 'articles':len(articles)},ensure_ascii=False))
    return result
if __name__=='__main__': update()
