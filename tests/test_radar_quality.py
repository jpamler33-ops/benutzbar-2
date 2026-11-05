"""Offline regression tests for multilingual coastal RSS data quality."""
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import radar
import update_free_feed


class RadarQuality(unittest.TestCase):
    def classify(self, title, body='', when='2026-10-22T08:46:30Z'):
        return radar.classify(title, body, when)

    def test_french_rod_ads_are_not_cannes(self):
        for title, summary in [
            ('VENDUES 3 cannes Winston LT', 'avec tube de transport et sac'),
            ('Comment se procurer un blank alvéolé', 'Je restaure des cannes anciennes'),
            ('Comparatif des cannes à pêche', 'pêche en mer - nouveau matériel')
        ]:
            with self.subTest(title=title):
                tags = self.classify(title, summary)
                self.assertNotIn('riviera', tags['regions'])
                self.assertFalse(tags['relevant'])
                self.assertEqual(0, tags['relevance'])

    def test_real_cannes_location_is_retained(self):
        tags = self.classify('Pêche du bord à Cannes', 'bar commun pêché en mer près du port')
        self.assertTrue(tags['relevant'])
        self.assertEqual(['riviera'], tags['regions'])

    def test_nice_is_geographic_only_with_context(self):
        tags = self.classify('Rockfishing à Nice', 'bar commun depuis la digue')
        self.assertTrue(tags['relevant'])
        self.assertEqual(['riviera'], tags['regions'])
        self.assertFalse(self.classify('Nice rods for beginners', 'shore fishing and sea bass')['relevant'])

    def test_croatian_coastal_fishing_report(self):
        tags = self.classify('Ulovljen brancin Zadar', 's obale, morski ribolov')
        self.assertEqual(['zadar'], tags['regions'])
        self.assertEqual(['HR'], tags['countries'])
        self.assertIn('Wolfsbarsch', tags['fish'])
        self.assertTrue(tags['relevant'])

    def test_brittany_coast_report(self):
        tags = self.classify('Wolfsbarsch an der Küste der Bretagne', 'Fangbericht vom Ufer')
        self.assertTrue(tags['relevant'])
        self.assertEqual(['brittany'], tags['regions'])

    def test_weather_only_is_no_fishing_report(self):
        self.assertFalse(self.classify('Wind an der Küste der Normandie',
                                        'starke Wellen im Meer')['relevant'])

    def test_specific_region_required(self):
        self.assertFalse(self.classify('Wolfsbarsch fangen an der Küste',
                                        'Fangbericht mit Wellengang')['relevant'])

    def test_invalid_month_is_not_autumn(self):
        data = self.classify('Ulovljen brancin Zadar', 's obale, morski ribolov', '2026-99-01')
        self.assertIsNone(data['publication_season'])

    def test_legacy_false_positives_removed(self):
        sources = radar.load_sources(ROOT / 'scripts' / 'sources.json')
        old = [
            {'id':'a', 'source_id':'gobages', 'url':'https://forum.gobages.com/t/41172',
             'title':'VENDUES 3 cannes Winston LT', 'excerpt':'cannes avec tube de transport'},
            {'id':'b', 'source_id':'gobages', 'url':'https://forum.gobages.com/t/41171',
             'title':'Comment restaurer des cannes anciennes', 'excerpt':'blanks de cannes'}
        ]
        self.assertEqual([], update_free_feed.revalidate_previous(old, sources))

    def test_known_relevant_cache_stays_unknown_host_drops(self):
        sources = radar.load_sources(ROOT / 'scripts' / 'sources.json')
        safe = {'id':'ok','source_id':'gobages','url':'https://forum.gobages.com/t/123',
                'title':'Pêche du bord à Cannes','excerpt':'bar commun en mer'}
        evil = {**safe,'id':'bad','url':'https://evil.example/t/123'}
        good = update_free_feed.revalidate_previous([safe, evil], sources)
        self.assertEqual(1, len(good))
        self.assertEqual(['riviera'], good[0]['regions'])

    def test_invalid_feed_does_not_block_others(self):
        sources=radar.load_sources(ROOT / 'scripts' / 'sources.json')
        good, bad = sources[:2]
        xml = b'<rss><channel><item><title>Rockfishing a Zadar</title><link>https://www.barsch-alarm.de/community/a</link><description>brancin morski ribolov s obale</description></item></channel></rss>'
        def fetch(url, limit=None):
            return b'<html>not XML' if url == bad['feed_url'] else xml
        with tempfile.TemporaryDirectory() as temp:
            db=radar.connect(Path(temp)/'radar.sqlite')
            try:
                runs=radar.sync_all(db,[good,bad],fetcher=fetch,robots_checker=lambda s:True)
                self.assertEqual(['ok','error'],[r['status'] for r in runs])
                self.assertEqual(1,len(radar.query_articles(db)))
            finally: db.close()


    def test_portal_only_shore_category_and_no_fake_place(self):
        source=next(s for s in radar.load_sources(ROOT/'scripts'/'sources.json')
                    if s['id']=='naudici_shore')
        self.assertTrue(source['enabled'])
        self.assertTrue(source['editorial_adriatic'])
        xml=b'''<rss><channel>
          <item><title>CAR NA NIZ OD PEDLJA</title>
            <link>https://naudici.com/sea-article-a/</link>
            <description>Prica o morskom ribolovu na Jadranu</description>
            <category>Ribolov s obale</category><category>zubatac</category></item>
          <item><title>KRUNAS VANKA MLJETA</title>
            <link>https://naudici.com/boat-b/</link>
            <description>Ribolov iz barke</description><category>Jigging</category>
            <category>Ribolov iz barke</category></item>
          <item><title>PRODAJA STAPOVA</title>
            <link>https://naudici.com/gear-c/</link>
            <category>Ribolov s obale</category><description>vends rod</description></item>
          </channel></rss>'''
        rows=radar.parse_feed(xml,source)
        self.assertEqual(1,len(rows))
        self.assertEqual([],rows[0]['regions'])
        self.assertEqual([],rows[0]['countries'])
        self.assertEqual(0,rows[0]['relevance'])
        self.assertIn('Dentex',rows[0]['fish'])
        # A country of publication or a fish tag cannot become a proven catch location.
        self.assertEqual(1,len(update_free_feed.revalidate_previous(rows,[source])))
        with tempfile.TemporaryDirectory() as d:
            db=radar.connect(Path(d)/'test.sqlite')
            try:
                def fetch(url,limit=None): return xml
                result=radar.sync_one(db,source,fetcher=fetch,
                                      robots_checker=lambda s:True)
                self.assertEqual('ok',result['status'])
                row=db.execute('SELECT fetched,stored FROM syncs ORDER BY id DESC LIMIT 1').fetchone()
                self.assertEqual(3,row['fetched']) # Raw RSS items, not matching posts
                self.assertEqual(1,row['stored'])
            finally: db.close()

    def test_portal_geo_location_requires_real_place(self):
        source=next(s for s in radar.load_sources(ROOT/'scripts'/'sources.json')
                    if s['id']=='naudici_shore')
        xml=b'''<rss><channel><item>
          <title>Rovinj brancin s obale</title>
          <link>https://naudici.com/real-geo/</link>
          <description>Rockfishing u moru kod Rovinja.</description>
          <category>Ribolov s obale</category>
          <category>brancin</category>
          </item></channel></rss>'''
        rows=radar.parse_feed(xml,source)
        self.assertEqual(1,len(rows))
        self.assertEqual(['istria'],rows[0]['regions'])
        self.assertEqual(['HR'],rows[0]['countries'])
        self.assertGreater(rows[0]['relevance'],0)


    def test_makarska_riviera_inflection_in_real_source_excerpt(self):
        # The published article refers to the Makarska Riviera, not a precise spot.
        excerpt=('Evo ovako je to bilo toga dana gospodnjeg 14. listopada '
                 '2026. godine na Makarskoj rivijeri. Moj prijatelj zove me '
                 'da odemo na prvi eging s obale. Dani uz obalu su jos vruci.')
        tags = self.classify('CAR NA NIZ OD PEDLJA', excerpt, '2026-11-01T04:00:34Z')
        self.assertTrue(tags['relevant'])
        self.assertEqual(['split'], tags['regions'])
        self.assertEqual(['HR'], tags['countries'])
        self.assertIn('Uferangeln', tags['themes'])
        self.assertEqual([], tags['fish'])  # No fish asserted from that excerpt alone.

    def test_makarska_riviera_negative_lookalikes(self):
        for title, description in [
            ('Unterkunft an der Makarskoj rivijeri', 'Hotel und Pool am Meer'),
            ('Neue Ruten auf der Makarskoj rivijeri zu verkaufen', 'Eging s obale'),
            ('Eging s obale an der französischen Riviera', 'im Meer bei Nice, keine Makarska'),
            ('Makarskoj: der Familienname', 'Spinning am See, keine Küste'),
        ]:
            with self.subTest(title=title):
                result=self.classify(title, description)
                self.assertFalse(result['relevant'] and 'split' in result['regions'])

    def test_feed_category_cannot_create_geographic_evidence(self):
        source=next(s for s in radar.load_sources(ROOT/'scripts'/'sources.json')
                    if s['id']=='naudici_shore')
        xml='''<rss><channel><item>
            <title>Eging s obale</title>
            <link>https://naudici.com/no-geography/</link>
            <description>Ribolov u moru</description>
            <category>Ribolov s obale</category>
            <category>Makarskoj rivijeri</category>
            </item></channel></rss>'''.encode('utf-8')
        rows=radar.parse_feed(xml,source)
        self.assertEqual(1,len(rows))
        self.assertEqual([],rows[0]['regions'])
        self.assertEqual([],rows[0]['countries'])
        self.assertEqual(0,rows[0]['relevance'])

    def test_feed_recovers_only_region_from_bent_croatian_place(self):
        source=next(s for s in radar.load_sources(ROOT/'scripts'/'sources.json')
                    if s['id']=='naudici_shore')
        excerpt=('Evo tako dana na Makarskoj rivijeri. '
                 'Odlazimo na prvi eging s obale.')
        xml=f'''<rss><channel><item>
            <title>CAR NA NIZ OD PEDLJA</title>
            <link>https://naudici.com/car-na-niz-od-pedlja/</link>
            <description>{excerpt}</description>
            <category>Ribolov s obale</category><category>zubatac</category>
            </item></channel></rss>'''.encode('utf-8')
        rows=radar.parse_feed(xml,source)
        self.assertEqual(1,len(rows))
        self.assertEqual(['split'],rows[0]['regions'])
        self.assertEqual(['HR'],rows[0]['countries'])
        self.assertGreater(rows[0]['relevance'],0)
        self.assertIn('Dentex',rows[0]['fish'])  # Publisher category, not verified catch.
        previous={**rows[0], 'regions':[], 'countries':[], 'relevance':0}
        refreshed=update_free_feed.revalidate_previous([previous],[source])
        self.assertEqual(['split'],refreshed[0]['regions'])
        self.assertEqual(['HR'],refreshed[0]['countries'])


if __name__ == '__main__':
    unittest.main()
