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


if __name__ == '__main__':
    unittest.main()
