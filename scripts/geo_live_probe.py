"""On-demand free diagnostics for official EMODnet services.

External availability must not decide whether offline code changes are merged.
This uses two small, read-only queries, and reports browser CORS limitations.
"""
from __future__ import annotations
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

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
        isinstance(n, (int, float)) and n >= 0 for n in result
    ) < 5:
        raise ValueError('EMODnet REST did not return expected depth samples')
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
        prefix = response.read(8)
        code = response.status
    if code != 200 or prefix != bytes.fromhex('89504e470d0a1a0a'):
        raise ValueError(f'EMODnet WMS did not return PNG (HTTP {code}, {content_type})')
    print('PASS EUSeaMap 2025 WMS: actual PNG response')

if __name__ == '__main__':
    failures = []
    for name, check in [('depth_profile', check_profile), ('EUSeaMap WMS', check_wms)]:
        try:
            check()
        except (HTTPError, URLError, TimeoutError, OSError, ValueError, TypeError) as exc:
            print(f'WARN {name}: {type(exc).__name__}: {str(exc)[:160]}')
            failures.append(name)
    if failures:
        raise SystemExit('Live EMODnet unavailable or browser-incompatible: ' + ', '.join(failures))
