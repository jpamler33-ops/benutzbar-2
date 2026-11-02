"""Audit a tiny allowlist of public fishing RSS endpoints before onboarding.

Runs only in the pull-request diagnostic step. It honors robots.txt, rate limits,
fixed known URLs, and never saves posts or personal data. A missing feed does
not mean the site has no fishing content.
"""
from __future__ import annotations
import sys
from pathlib import Path
import xml.etree.ElementTree as ET
sys.path.insert(0, str(Path(__file__).resolve().parent))
import radar

CANDIDATES = (
    ('Na Udici – Jadran portal', 'https://naudici.com/feed/'),
    ('Slovenian sea-fishing forum – phpBB feed', 'https://morski-ribolov.net/feed.php'),
    ('Slovenian sea-fishing forum – app.php feed', 'https://morski-ribolov.net/app.php/feed'),
    ('Croatian maritime forum – RSS', 'https://www.ribolovnamoru.eu/public/index.rss'),
)

def inspect(name, url):
    source={'id':'probe', 'name':name, 'feed_url':url, 'enabled':True}
    print('SOURCE:', name, url, flush=True)
    try:
        if not radar._robots_allows(source):
            print('SOURCE_RESULT: robots=disallowed; no content requested', flush=True)
            return
        raw=radar._get_bytes(url)
        root=ET.fromstring(raw)
        total=len(root.findall('.//item'))+len(root.findall('.//{http://www.w3.org/2005/Atom}entry'))
        valid=radar.parse_feed(raw,source)
        print('SOURCE_RESULT: robots=allowed; xml_root=%s; items=%d; coastal_matches=%d; bytes=%d' %
              (root.tag, total, len(valid), len(raw)),flush=True)
        for row in valid[:3]:
            print('SAMPLE_MATCH:',row['title'][:100],'; regions=',row['regions'],flush=True)
    except Exception as exc:
        # This is a diagnostic, not an ingestion bypass.
        print('SOURCE_RESULT:',type(exc).__name__,str(exc)[:160],flush=True)

if __name__=='__main__':
    for name,url in CANDIDATES:
        inspect(name,url)
