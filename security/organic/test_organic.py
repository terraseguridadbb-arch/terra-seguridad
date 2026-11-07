import copy
import json
import unittest
from pathlib import Path
from urllib.parse import urlsplit
from unittest.mock import patch

from build import ROOT, HOST, render_all
from monitor import Page, checks, audit
from metrics import validate, report

class PublishingTests(unittest.TestCase):
    def test_generated_output_is_current(self):
        for path,text in render_all().items(): self.assertEqual((ROOT/path).read_text(),text,path)

    def test_content_sources_and_unique_intentions(self):
        d=json.loads((ROOT/'security/organic/content.json').read_text()); self.assertEqual(d['publication_status'],'awaiting_owner_review')
        for field in ['slug','title','description','h1']:
            self.assertEqual(len({p[field] for p in d['pages']}),len(d['pages']))
        for p in d['pages']:
            self.assertTrue(p['source_ids']); self.assertTrue(set(p['source_ids'])<=d['sources'].keys())
            self.assertNotIn(p['slug'],p['related'])

    def test_all_generated_pages_links_metadata_and_no_new_lead_producer(self):
        home=(ROOT/'index.html').read_text()
        import re
        home_scripts=re.findall(r'<script>([\s\S]*?)</script>',home)[:2]
        for path,html in render_all().items():
            if not path.endswith('.html'): continue
            p=Page(html)
            self.assertTrue(all(checks(html,HOST+'/'+path).values()),path)
            self.assertEqual(re.findall(r'<script>([\s\S]*?)</script>',html),home_scripts)
            self.assertNotIn('<form',html); self.assertNotIn('main.js',html); self.assertNotIn("fbq('track', 'Lead'",html)
            self.assertEqual(html.count('<main '),1)
            for link in p.links:
                url=urlsplit(link)
                if url.scheme or url.netloc: continue
                target=ROOT/(url.path.lstrip('/') or 'index.html')
                if not url.path: target=ROOT/path
                self.assertTrue(target.exists(),f'{path}: {link}')
                if url.fragment: self.assertIn(url.fragment,Page(target.read_text()).ids,f'{path}: {link}')
            graph=p.schema[0]['@graph']
            self.assertEqual({x['@type'] for x in graph},{'Organization','WebPage','BreadcrumbList'})
            self.assertNotIn('aggregateRating',html)

    def test_no_private_files_deployed(self):
        self.assertIn('security/',(ROOT/'.vercelignore').read_text())

class MonitorTests(unittest.TestCase):
    def test_fail_closed_for_noindex_bad_canonical_and_invalid_schema(self):
        html='<title>T</title><meta name="description" content="D"><h1>H</h1><link rel="canonical" href="https://wrong.example"><script type="application/ld+json">{bad}</script>'
        result=checks(html,HOST+'/',{'x-robots-tag':'noindex'})
        for name in ['canonical','schema_json','indexable_directive','contact_path']: self.assertFalse(result[name])

    def test_non_terra_sitemap_cannot_be_requested(self):
        def fake(url):
            if url.endswith('/robots.txt'): return {'status':200,'text':'User-agent: *\nAllow: /'}
            if url.endswith('/sitemap.xml'): return {'status':200,'text':'<urlset><url><loc>https://example.com/</loc></url></urlset>'}
            if url.endswith('/gracias.html'): return {'status':200,'text':'<meta name="robots" content="noindex">'}
            self.fail('Unexpected request '+url)
        with patch('monitor.fetch',side_effect=fake): result=audit()
        self.assertFalse(result['ok']); self.assertIn('sitemap_off_origin_or_noncanonical',result['errors'])

    def test_unavailable_is_not_success_or_zero(self):
        with patch('monitor.fetch',return_value={'status':None,'error':'URLError'}): result=audit()
        self.assertFalse(result['ok']);self.assertIsNone(result['sitemap_http']);self.assertEqual(result['pages'],[])

class MetricsTests(unittest.TestCase):
    def row(self,metric,value,source='gsc',**kw):
        return dict(source=source,metric=metric,value=value,status='verified',period_start='2026-11-01',period_end='2026-11-07',timezone='America/Argentina/Buenos_Aires',cohort='period',currency=None,**kw)

    def test_unknown_and_zero_denominator(self):
        self.assertIsNone(report([])['search_ctr_pct']['value'])
        r=report([self.row('clicks',0),self.row('impressions',0)])
        self.assertEqual(r['search_ctr_pct']['reason'],'zero_denominator')
        r=report([self.row('clicks',0),self.row('impressions',10)])
        self.assertEqual(r['search_ctr_pct']['value'],0)

    def test_known_ratio_and_roi(self):
        self.assertEqual(report([self.row('clicks',4),self.row('impressions',100)])['search_ctr_pct']['value'],4)
        rows=[self.row('organic_margin_before_acquisition',300,'finance'), self.row('organic_acquisition_cost',200,'finance')]
        for r in rows:r['currency']='ARS';r['cohort']='lead_created_period'
        self.assertEqual(report(rows)['organic_roi_pct']['value'],50)

    def test_incompatible_currency_and_cohorts(self):
        rows=[self.row('organic_margin_before_acquisition',300,'finance'), self.row('organic_acquisition_cost',200,'finance')]
        rows[0]['currency']='ARS';rows[1]['currency']='USD'
        self.assertIsNone(report(rows)['organic_roi_pct']['value'])
        rows=[self.row('clicks',4),self.row('impressions',100)]; rows[1]['cohort']='lead_created_period'
        self.assertIsNone(report(rows)['search_ctr_pct']['value'])

    def test_reject_duplicate_pii_nonfinite_and_unknown_numbers(self):
        row=self.row('clicks',2)
        for rows in [[row,row],[dict(row,email='someone@example.org')],[dict(row,value=float('nan'))],[dict(row,status='not_connected')],[dict(row,source='hubspot')],[dict(row,value=True)]]:
            with self.assertRaises(ValueError): validate(rows)

    def test_multiple_windows_do_not_silently_choose_first(self):
        rows=[self.row('clicks',4),self.row('impressions',100),self.row('clicks',7)]
        rows[-1]['period_start']='2026-10-01'
        self.assertIsNone(report(rows)['search_ctr_pct']['value'])

if __name__=='__main__': unittest.main()
