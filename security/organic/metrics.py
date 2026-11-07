"""Aggregate-only measurement contract. Unknown is not zero; no platform summing."""
import argparse
import json
import math
from datetime import date
from pathlib import Path

KEYS={'source','period_start','period_end','timezone','cohort','currency','metric','value','status'}
SOURCES={'gsc','ga4','hubspot','finance','geo_panel'}
ALLOWED={
 'gsc':{'impressions','clicks'},
 'ga4':{'organic_sessions','organic_lead_sessions','ai_referral_sessions'},
 'hubspot':{'organic_valid_leads','organic_qualified_leads','organic_activations','organic_unattributed_leads'},
 'finance':{'organic_acquisition_cost','organic_margin_before_acquisition','organic_commission_paid'},
 'geo_panel':{'observed_responses','brand_mentions','source_citations'}
}
FINANCIAL=ALLOWED['finance']

def validate(rows):
    seen=set()
    for r in rows:
        if set(r)!=KEYS: raise ValueError('Only the documented aggregate fields are allowed; no PII or free-text payloads')
        if r['source'] not in SOURCES or r['metric'] not in ALLOWED[r['source']]: raise ValueError('source_metric_mismatch')
        if r['timezone']!='America/Argentina/Buenos_Aires': raise ValueError('timezone_not_normalized')
        if date.fromisoformat(r['period_start'])>date.fromisoformat(r['period_end']): raise ValueError('invalid_period')
        if r['cohort'] not in {'period','lead_created_period','fixed_prompt_panel_v1'}: raise ValueError('invalid_cohort')
        if r['currency'] not in ({'ARS','USD'} if r['metric'] in FINANCIAL else {None}): raise ValueError('currency_mismatch')
        if r['status'] not in {'verified','not_connected','no_data','error'}: raise ValueError('invalid_status')
        value=r['value']
        if r['status']=='verified':
            if isinstance(value,bool) or not isinstance(value,(float,int)) or not math.isfinite(value): raise ValueError('invalid_value')
            if value<0 and r['metric']!='organic_margin_before_acquisition': raise ValueError('negative_count_or_cost')
            if r['metric'] not in FINANCIAL and int(value)!=value: raise ValueError('count_must_be_integer')
        elif value is not None: raise ValueError('unverified_value_must_be_null')
        key=tuple(r[k] for k in ['source','period_start','period_end','timezone','cohort','currency','metric'])
        if key in seen: raise ValueError('duplicate_aggregate')
        seen.add(key)
    return rows

def ratio(a,b,multiplier=100,bounded=True):
    if not a or not b or a['status']!='verified' or b['status']!='verified': return {'value':None,'reason':'missing_verified_source'}
    if any(a[k]!=b[k] for k in ['period_start','period_end','timezone','cohort','currency']): return {'value':None,'reason':'incompatible_period_cohort_or_currency'}
    if b['value']==0: return {'value':None,'reason':'zero_denominator'}
    if bounded and a['value']>b['value']: return {'value':None,'reason':'numerator_exceeds_eligible_population'}
    return {'value':round(a['value']/b['value']*multiplier,4),'reason':None}

def report(rows):
    validate(rows)
    # One complete window per report; never silently select the first of several cohorts.
    def one(metric):
        found=[r for r in rows if r['metric']==metric]
        return found[0] if len(found)==1 else None
    out={'search_ctr_pct':ratio(one('clicks'),one('impressions')),
         'organic_session_lead_rate_pct':ratio(one('organic_lead_sessions'),one('organic_sessions')),
         'organic_qualification_pct':ratio(one('organic_qualified_leads'),one('organic_valid_leads')),
         'geo_observed_mention_pct':ratio(one('brand_mentions'),one('observed_responses'))}
    cost=one('organic_acquisition_cost'); margin=one('organic_margin_before_acquisition')
    roi=ratio(margin,cost,bounded=False)
    if roi['value'] is not None: roi['value']=round(roi['value']-100,4)
    out['organic_roi_pct']=roi
    out['limits']=['GA4 session lead rate uses sessions with a confirmed lead, not raw event counts.', 'GEO panel is a reproducible sample, not market share or a ranking.', 'Organic ROI requires attributable margin and complete acquisition costs in the same cohort and currency.', 'No join of persons or addition of platform conversions is performed.']
    return out

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('input',type=Path);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    result=report(json.loads(a.input.read_text())); a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
