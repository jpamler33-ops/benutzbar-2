"""Read-only public-site and public API smoke probes. Optional providers are warnings."""
from __future__ import annotations
import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
AGENT='COASTFINDER-FreeHealthCheck/1.0 (+https://github.com/jpamler33-ops/benutzbar-2)'
PROBES=[
 ('pages','https://jpamler33-ops.github.io/benutzbar-2/','COASTFINDER',True),
 ('rss-json','https://jpamler33-ops.github.io/benutzbar-2/feed/radar.json','sources',True),
 ('open-meteo','https://api.open-meteo.com/v1/forecast?latitude=44.87&longitude=13.85&current=wind_speed_10m','current',False),
 ('open-meteo-marine','https://marine-api.open-meteo.com/v1/marine?latitude=44.87&longitude=13.85&hourly=wave_height&forecast_days=1','hourly',False),
]
def probe(name,url,marker,critical):
    try:
        req=Request(url,headers={'User-Agent':AGENT,'Accept':'text/html,application/json'})
        with urlopen(req,timeout=12) as response:
            content=response.read(180_000)
            status=response.status
        body=content.decode('utf-8',errors='replace')
        ok=status==200 and marker in body
        if name=='rss-json' and ok:
            data=json.loads(body)
            ok=isinstance(data.get('sources'),list) and isinstance(data.get('articles'),list)
        print(f'{"PASS" if ok else ("FAIL" if critical else "WARN")}: {name} [HTTP {status}]')
        return ok or not critical
    except (HTTPError,URLError,TimeoutError,ValueError,OSError) as exc:
        print(f'{"FAIL" if critical else "WARN"}: {name}: {type(exc).__name__}: {str(exc)[:140]}')
        return not critical
if __name__=='__main__':
    results = [probe(*entry) for entry in PROBES]
    if not all(results):
        raise SystemExit('Critical live-site probe failed. Inspect Pages deployment.')
