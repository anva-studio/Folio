import {useEffect,useRef,useState} from 'react';
import type {analyzePeriods} from '../../domain/periodAnalysis';
import {exportPeriodReportCsv,exportPeriodReportHtml} from '../../application/periodReport';
import {downloadTextFile} from '../../application/fileDownload';
import {useProduct} from '../../application/productNavigation';
import {usePresentation} from '../usePresentation';

export function PeriodReportExport({result}:{result:Awaited<ReturnType<typeof analyzePeriods>>}){
  const {currency}=usePresentation(),{example}=useProduct();
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
  const saving=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const save=async(format:'csv'|'html')=>{
    if(saving.current)return;saving.current=true;setBusy(true);setError('');setStatus('');
    try{
      const options={currency,example,generatedAt:new Date().toISOString()};
      const text=format==='csv'?exportPeriodReportCsv(result,options):exportPeriodReportHtml(result,options);
      await downloadTextFile(`folio-period-${result.selected.from}-${result.selected.to}.${format}`,text,format==='csv'?'text/csv':'text/html');
      if(mounted.current)setStatus('Report save/share requested. Finish saving outside Folio and check the file; opening the chooser does not confirm a saved copy.');
    }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Could not export this report. Try again.');}
    finally{saving.current=false;if(mounted.current)setBusy(false);}
  };
  return <details className="report-export"><summary>Save or print this period report</summary><p>These files contain actual amounts, even while Folio’s amount display is hidden. They are unencrypted and include both date ranges, currency, calculation scope, review confidence and category totals{example?', labelled as fictional Example data':''}. No transactions are changed. Use an encrypted backup to restore a profile.</p><div className="action-row"><button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void save('csv')}>Save report CSV</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void save('html')}>Save printable report</button></div><p className="field-help">The printable report is a self-contained HTML file. Save it, open it in a browser, then use Print or Save as PDF. Available print/save destinations depend on your device.</p>{busy&&<p role="status">Preparing report…</p>}{status&&<p role="status">{status}</p>}{error&&<p role="alert">{error}</p>}</details>;
}
