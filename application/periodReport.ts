import type {analyzePeriods} from '../domain/periodAnalysis';
import type {CurrencyConfig} from '../domain/types';
import {formatMinorToDecimal,toCsvRows} from './csvExport';

type Analysis=Awaited<ReturnType<typeof analyzePeriods>>;
export const periodReportScope='Recorded transactions only. Transfers, excluded records, schedules and balance adjustments are excluded. Refunds reduce expenses in their recorded month. Surplus is not verified savings. Reviews are self-reported, not independent verification.';
const reviewLabel=(state:string)=>({reviewed:'Self-reviewed and unchanged',changed:'Changed since review',incomplete:'Current/future month: incomplete',unreviewed:'Not reviewed: completeness unknown'}[state]??state);
type ReportOptions={currency:CurrencyConfig;example:boolean;generatedAt:string};

/** Snapshot export: uses the exact analyzed result, never re-reads or mutates a vault. */
export function periodReportRows(result:Analysis,{currency,example,generatedAt}:ReportOptions):unknown[][]{
  const money=(n:number)=>formatMinorToDecimal(n,currency.minorDigits);
  const rows:unknown[][]=[['Folio period report'],['Data identity',example?'EXAMPLE — fictional data':'Personal records'],['Generated at',generatedAt],['Currency',currency.code],['Minor-unit digits',currency.minorDigits],['Method',result.method],['Scope',periodReportScope],['Assumptions','Equal-length adjacent calendar periods; no inferred inflation, FX conversion or investment returns. Current/future months are incomplete.'],['Comparison status',result.comparable?'All months self-reviewed and unchanged':'Headline changes withheld: incomplete or unreviewed/changed records'],[],['Period','From','Through','Recorded income','Net expenses','Recorded surplus','Included flow records','Reviewed unchanged months']];
  for(const [name,p]of [['Previous',result.baseline],['Selected',result.selected]]as const)rows.push([name,p.from,p.to,money(p.income),money(p.expense),money(p.net),p.transactionCount,p.reviewed]);
  rows.push([],['Period','Month','Recorded income','Net expenses','Recorded surplus','Included flow records','Review status']);
  for(const [name,p]of [['Previous',result.baseline],['Selected',result.selected]]as const)for(const m of p.months)rows.push([name,m.month,money(m.income),money(m.expense),money(m.net),m.transactionCount,reviewLabel(m.state)]);
  rows.push([],['Category ID','Category name','Previous net expenses','Selected net expenses','Recorded change']);
  for(const c of result.categories)rows.push([c.id,c.name,money(c.baseline),money(c.selected),c.change===null?'Withheld: review periods first':money(c.change)]);
  return rows;
}
export function exportPeriodReportCsv(result:Analysis,options:ReportOptions){return toCsvRows(periodReportRows(result,options));}
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function exportPeriodReportHtml(result:Analysis,options:ReportOptions){
  const rows=periodReportRows(result,options);
  // Fixed groups keep real table headings/captions and repeated print headers.
  const groups:unknown[][][]=[[]];for(const row of rows){if(!row.length)groups.push([]);else groups.at(-1)!.push(row);}
  const metadata=groups.shift()!.slice(1).map(r=>`<dt>${escape(r[0])}</dt><dd>${escape(r[1])}</dd>`).join('');
  const captions=['Recorded period totals','Exact monthly values and data confidence','Category net expenses'];
  const tables=groups.map((group,i)=>`<table><caption>${captions[i]}</caption><thead><tr>${group[0].map(v=>`<th scope="col">${escape(v)}</th>`).join('')}</tr></thead><tbody>${group.slice(1).map(row=>`<tr>${row.map(v=>`<td>${escape(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Folio period report</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#182331;background:#fff;max-width:1100px;margin:32px auto;padding:0 20px}h1{margin-bottom:8px}dt{font-weight:650;margin-top:10px}dd{margin:0;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;margin:28px 0;font-variant-numeric:tabular-nums}caption{text-align:left;font-weight:700;font-size:18px;margin-bottom:8px}th,td{text-align:left;padding:9px;border-bottom:1px solid #ccd2d8;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}.notice{padding:12px;border:1px solid #9ca7b2}@media print{body{max-width:none;margin:0;padding:0;font-size:10pt}.print-help{display:none}table{font-size:9pt}h1,caption{break-after:avoid}}@media(max-width:600px){table{font-size:12px}th,td{padding:5px}}</style></head><body><h1>Folio period report</h1><p class="notice">${options.example?'EXAMPLE — fictional data. ':''}Unencrypted financial report. Keep private. This is not a restorable profile backup.</p><p class="print-help">Open this saved file in a browser to read it offline or use the browser’s Print / Save as PDF command. No internet connection is needed.</p><dl>${metadata}</dl>${tables}</body></html>`;
}
