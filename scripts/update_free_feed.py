"""GitHub Actions: collect explicitly configured public RSS feeds into PUBLIC static JSON.
No personal catch records, no broad scraping, no forum fulltext pages.
"""
import datetime as dt
import json
from pathlib import Path
import tempfile
import radar

BASE=Path(__file__).resolve().parent.parent
OUT=BASE/'feed'/'radar.json'
SOURCES=BASE/'scripts'/'sources.json'

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
    merged={p['id']:p for p in prev if isinstance(p,dict) and isinstance(p.get('id'),str) and isinstance(p.get('url'),str)}
    for p in new: merged[p['id']]=p
    # Bounded public dataset; do not publish private catches, tokens or per-user coordinates.
    ordered=sorted(merged.values(),key=lambda p:p.get('published_at') or p.get('first_seen') or '',reverse=True)[:400]
    public_fields={'id','source_id','url','title','excerpt','published_at','first_seen','last_seen','regions','countries','fish','themes','publication_season','relevance','evidence'}
    articles=[{k:v for k,v in p.items() if k in public_fields} for p in ordered]
    result={'updated_at':dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00','Z'),
            'sources':statuses,'articles':articles,
            'scope':'Nur konfigurierte und robots.txt-zugelassene RSS-Feeds; keine flächendeckende Forensuche.',
            'data_type':'Unbestätigte Quellenhinweise, keine tatsächlichen Fänge'}
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'sources':[(s['id'],s['last_check']['status'] if s['last_check'] else 'unchecked') for s in statuses], 'articles':len(articles)},ensure_ascii=False))
    return result
if __name__=='__main__': update()
