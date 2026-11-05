"""Zero-dependency quality gate for COASTFINDER's public static release."""
from __future__ import annotations
import html.parser
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit
ROOT = Path(__file__).resolve().parent.parent
REQUIRED = ('index.html', 'app.js', 'angler-hub.js', 'intel-engine.js', 'intel-ui.js', 'catch-ui.js', 'free-store.js', 'styles.css', 'manifest.webmanifest', 'feed/radar.json')
PERSONAL_FIELDS = frozenset({'lat','lon','latitude','longitude','user_id','email','password','access_token','refresh_token','session_id','private_notes','private_catches','user_location'})

class LocalAssets(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = set()
    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        reference = values.get('src') if tag == 'script' else values.get('href') if tag == 'link' else None
        if not reference:
            return
        parts = urlsplit(reference)
        if parts.scheme or parts.netloc or reference.startswith('//'):
            return
        if reference.startswith('/'):
            raise AssertionError(f'Root-absolute asset path on GitHub Pages: {reference}')
        if parts.path and not (ROOT / parts.path).is_file():
            raise AssertionError(f'Missing linked local asset: {reference}')
        if parts.path:
            self.paths.add(parts.path)

def assert_valid_iso(raw, *, name):
    from datetime import datetime
    if raw is None:
        return
    if not isinstance(raw, str):
        raise AssertionError(f'{name} is not a string')
    try:
        stamp = datetime.fromisoformat(raw.replace('Z', '+00:00'))
    except ValueError as err:
        raise AssertionError(f'{name} is not ISO-8601: {raw[:40]}') from err
    if stamp.tzinfo is None:
        raise AssertionError(f'{name} lacks timezone')

def acceptable_article_labels(item, source, classified):
    """Only category-vetted editorials may be unlocated; no invented score."""
    if classified['relevant']:
        return classified['regions'] == item.get('regions')
    return bool(source and source.get('enabled') and
                source.get('editorial_adriatic') and source.get('allowed_categories') and
                item.get('regions') == [] and item.get('countries') == [] and
                item.get('relevance') == 0)

def check():
    for relative in REQUIRED:
        if not (ROOT / relative).is_file():
            raise AssertionError(f'Missing required file: {relative}')
    assets = LocalAssets()
    assets.feed((ROOT / 'index.html').read_text(encoding='utf-8'))
    manifest = json.loads((ROOT / 'manifest.webmanifest').read_text(encoding='utf-8'))
    if manifest.get('start_url') not in ('./','.'):
        raise AssertionError('PWA start_url must be relative on GitHub Pages')
    for icon in manifest.get('icons', []):
        path = icon.get('src', '')
        if not path or path.startswith('/') or not (ROOT / path).is_file():
            raise AssertionError(f'Missing or root-relative PWA icon: {path}')
    public = json.loads((ROOT / 'feed/radar.json').read_text(encoding='utf-8'))
    if not isinstance(public.get('sources'), list) or not isinstance(public.get('articles'), list):
        raise AssertionError('Public feed must contain sources and articles arrays')
    assert_valid_iso(public.get('updated_at'), name='feed.updated_at')
    allowed_sources = {s.get('id') for s in public['sources'] if isinstance(s, dict)}
    if None in allowed_sources:
        raise AssertionError('Source ID missing')
    sys.path.insert(0, str(ROOT / 'scripts'))
    import radar
    config = {s['id']:s for s in radar.load_sources(ROOT / 'scripts' / 'sources.json') if s.get('enabled')}
    unique = set()
    for item in public['articles']:
        if not isinstance(item, dict):
            raise AssertionError('Invalid article entry')
        forbidden = PERSONAL_FIELDS.intersection(item)
        if forbidden:
            raise AssertionError(f'Personal data-like fields in public feed: {sorted(forbidden)}')
        uid = item.get('id')
        if not isinstance(uid, str) or not uid or uid in unique:
            raise AssertionError('Duplicate or missing article ID')
        unique.add(uid)
        source_id = item.get('source_id')
        if source_id not in allowed_sources or source_id not in config:
            raise AssertionError(f'Unknown or disabled article source: {source_id}')
        checked = radar.classify(item.get('title') or '', item.get('excerpt') or '', item.get('published_at'))
        if not acceptable_article_labels(item, config[source_id], checked):
            raise AssertionError(f'Unjustified RSS classification: {uid}')
        url = urlsplit(item.get('url') or '')
        source_host = (urlsplit(config[source_id]['feed_url']).hostname or '').lower().removeprefix('www.')
        if (url.scheme != 'https' or not url.hostname or url.username or url.password or
                url.hostname.lower().removeprefix('www.') != source_host):
            raise AssertionError(f'Unsafe or off-source article URL for {uid}')
        if not isinstance(item.get('title'), str) or not item['title'].strip():
            raise AssertionError(f'Empty title: {uid}')
        assert_valid_iso(item.get('published_at'), name=f'article.{uid}.published_at')
        assert_valid_iso(item.get('first_seen'), name=f'article.{uid}.first_seen')
        countries, regions = item.get('countries', []), item.get('regions', [])
        if not isinstance(countries, list) or not set(countries) <= {'HR','FR'}:
            raise AssertionError(f'Invalid countries: {uid}')
        if not isinstance(regions, list) or not all(isinstance(r, str) for r in regions):
            raise AssertionError(f'Invalid regions: {uid}')
    print(f'QUALITY_OK: assets={len(assets.paths)}, sources={len(allowed_sources)}, articles={len(unique)}')

if __name__ == '__main__':
    check()
