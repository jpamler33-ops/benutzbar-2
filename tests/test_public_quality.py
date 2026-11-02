"""Regression coverage: regional RSS entries and category-vetted unlocated editorials."""
from pathlib import Path
import sys
import unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import radar
import quality_gate

class PublicFeedQualityTest(unittest.TestCase):
    def test_real_public_feed_passes(self):
        quality_gate.check()

    def test_editorial_is_accepted_only_unlocated(self):
        source=next(s for s in radar.load_sources(ROOT/'scripts'/'sources.json')
                    if s['id']=='naudici_shore')
        classified=radar.classify('CAR NA NIZ OD PEDLJA',
                                   'Morski ribolov s obale',None)
        self.assertFalse(classified['relevant'])
        unlocated={'regions':[],'countries':[],'relevance':0}
        self.assertTrue(quality_gate.acceptable_article_labels(unlocated,source,classified))
        for bad in [
            {'regions':['split'],'countries':['HR'],'relevance':99},
            {'regions':[],'countries':['HR'],'relevance':0},
            {'regions':[],'countries':[],'relevance':50}
        ]:
            with self.subTest(bad=bad):
                self.assertFalse(quality_gate.acceptable_article_labels(bad,source,classified))
        self.assertFalse(quality_gate.acceptable_article_labels(unlocated,
                         {'id':'rogue','enabled':True},classified))

    def test_regular_regional_source_must_really_match(self):
        source=next(s for s in radar.load_sources(ROOT/'scripts'/'sources.json')
                    if s['id']=='anglerboard')
        checked=radar.classify('Rovinj brancin s obale','morski ribolov',None)
        self.assertTrue(checked['relevant'])
        self.assertTrue(quality_gate.acceptable_article_labels(
            {'regions':['istria'],'countries':['HR'],'relevance':70},source,checked))
        self.assertFalse(quality_gate.acceptable_article_labels(
            {'regions':['riviera'],'countries':['FR'],'relevance':70},source,checked))

if __name__=='__main__':
    unittest.main()
