"""On-demand free diagnostics for official EMODnet services.

External availability must not decide whether offline code changes are merged.
This uses two small, read-only queries, and reports browser CORS limitations.
"""
from __future__ import annotations
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

ORIGIN = 'https://jpamler33-ops.github.io'
PROFILE = 'https://rest.emodnet-bathymetry.eu/depth_profile?' + urlencode({
    'geom': 'LINESTRING(-7.7783203125 49.02099609375,-9.9755859375 46.42822265625)'
})
WMS = 'https://ows.emodnet-seabedhabitats.eu/geoserver/emodnet_view/wms?' + urlencode({
    'service': 'WMS', 'version': '1.3.0', 'request': 'GetMap',
    'layers': 'eusm2025_subs_400', 'styles': '', 'format': 'image/png',
    'transparent': 'true', 'crs': 'EPSG:4326',
    'bbox': '43.500000,16.400000,43.600000,16.500000',
    'width': '128', 'height': '128'
})

def check_profile():
    req = Request(PROFILE, headers={
        'Origin': ORIGIN, 'Accept': 'application/json',
        'User-Agent': 'COASTFINDER-FreeHealthCheck/1.0'
    })
    with urlopen(req, timeout=15) as response:
        content_type = response.headers.get('Content-Type', '')
        cors = response.headers.get('Access-Control-Allow-Origin', '')
        payload = response.read(200_000)
        code = response.status
    result = json.loads(payload)
    if code != 200 or not isinstance(result, list) or len(result) < 5 or sum(
        isinstance(n, (int, float)) and n < 0 for n in result
    ) < 5:
        raise ValueError('EMODnet REST response invalid: type=' + type(result).__name__ + ', sample=' + repr(str(result)[:350]))
    if cors not in ('*', ORIGIN):
        raise ValueError('EMODnet REST lacks browser CORS permission '
                         f'(Access-Control-Allow-Origin: {cors or "missing"})')
    print(f'PASS EMODnet depth_profile: {len(result)} grid values; CORS={cors}; type={content_type}')

def check_wms():
    req = Request(WMS, headers={
        'User-Agent': 'COASTFINDER-FreeHealthCheck/1.0',
        'Accept': 'image/png'
    })
    with urlopen(req, timeout=15) as response:
        content_type = response.headers.get('Content-Type', '')
        prefix = response.read(1500)
        code = response.status
    if code != 200 or not prefix.startswith(bytes.fromhex('89504e470d0a1a0a')):
        raise ValueError(f'EMODnet WMS did not return PNG (HTTP {code}, {content_type}), body=' + repr(prefix[:500].decode('utf-8', 'replace')))
    print('PASS EUSeaMap 2025 WMS: actual PNG response')

def diagnose_layers():
    """Report real published EUSeaMap layer IDs on an exception."""
    url = 'https://ows.emodnet-seabedhabitats.eu/geoserver/emodnet_view/wms?' + urlencode({
        'service':'WMS','version':'1.3.0','request':'GetCapabilities'
    })
    req=Request(url,headers={'User-Agent':'COASTFINDER-FreeHealthCheck/1.0'})
    with urlopen(req,timeout=15) as response:
        raw=response.read(3_000_000)
    root=ET.fromstring(raw)
    names=sorted({(node.text or '').strip() for node in root.iter()
                  if node.tag.rsplit('}',1)[-1]=='Name' and
                  ('eusm2025' in (node.text or '').lower() or 'substrate' in (node.text or '').lower())})
    print('WMS_PUBLISHED_RELEVANT_LAYERS:',repr(names[:80]))

if __name__ == '__main__':
    failures = []
    for name, check in [('depth_profile', check_profile), ('EUSeaMap WMS', check_wms)]:
        try:
            check()
        except (HTTPError, URLError, TimeoutError, OSError, ValueError, TypeError) as exc:
            print(f'WARN {name}: {type(exc).__name__}: {str(exc)[:800]}')
            if name == 'EUSeaMap WMS':
                try:
                    diagnose_layers()
                except (HTTPError, URLError, TimeoutError, OSError, ValueError, ET.ParseError) as diagnostic:
                    print('WMS_CAPABILITIES_ERROR:',type(diagnostic).__name__,str(diagnostic)[:160])
            failures.append(name)
    if failures:
        raise SystemExit('Live EMODnet unavailable or browser-incompatible: ' + ', '.join(failures))
