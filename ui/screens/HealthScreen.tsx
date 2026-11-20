import {PlanningHealth} from '../components/PlanningHealth';
import {evaluateHealthComponents} from '../../domain/health';
import {HistoryInsights} from '../components/HistoryInsights';
import {SharedAssumptions} from '../components/SharedAssumptions';
import {usePresentation} from '../usePresentation';
import {useProduct} from '../../application/productNavigation';
import {exampleFigures} from '../../application/exampleProfile';
import { EntryDialog } from '../components/EntryDialog';
import { useMemo, useState, useEffect } from 'react';
import { useSession } from '../../application/FolioProvider.js';
import {scaleMinor} from '../../domain/money.js';

export function HealthScreen() {
  const {money,parseAmount,inputAmount}=usePresentation();
  const product=useProduct();
  const { controller, controllerRevision } = useSession();
  void controllerRevision;
  if (!controller) return null;

  const fmt = money;

  const [liquidFundsStr, setLiquidFundsStr] = useState('');
  const [monthlyIncomeStr, setMonthlyIncomeStr] = useState('');
  const [monthlyExpensesStr, setMonthlyExpensesStr] = useState('');
  const [annualIncomeStr, setAnnualIncomeStr] = useState('');
  const [errors, setErrors] = useState<{ liquidFunds: string; monthlyIncome: string; monthlyExpenses: string; annualIncome: string }>({
    liquidFunds: '',
    monthlyIncome: '',
    monthlyExpenses: '',
    annualIncome: '',
  });

  const config = useMemo(()=>controller.getHealthConfig(),[controller,controllerRevision]);
  const [configOpen, setConfigOpen] = useState(false);
  const [configSaveError,setConfigSaveError]=useState('');
  const [configDraft, setConfigDraft] = useState({
    targetEmergencyMonths: String(config.targetEmergencyMonths),
    maxDebtToIncome: String(config.maxDebtToIncome),
    minSavingsRate: String(config.minSavingsRate * 100),
  });
  const [configErrors, setConfigErrors] = useState<{ targetEmergencyMonths: string; maxDebtToIncome: string; minSavingsRate: string }>({
    targetEmergencyMonths: '',
    maxDebtToIncome: '',
    minSavingsRate: '',
  });

  useEffect(() => {
    setConfigDraft({
      targetEmergencyMonths: String(config.targetEmergencyMonths),
      maxDebtToIncome: String(config.maxDebtToIncome),
      minSavingsRate: String(config.minSavingsRate * 100),
    });
  }, [config.targetEmergencyMonths, config.maxDebtToIncome, config.minSavingsRate, controllerRevision]);


  const parseMoney = (s: string) => {
    try {
      return parseAmount(s);
    } catch {
      return null;
    }
  };

  const validate = (_name: 'liquidFunds' | 'monthlyIncome' | 'monthlyExpenses' | 'annualIncome', value: string) => {
    if (value.trim() === '') return 'Required';
    const v = parseMoney(value);
    if (v === null || v < 0) return 'Invalid amount';
    return '';
  };

  const handleMoneyChange = (field: keyof typeof errors, value: string) => {
    if (field === 'liquidFunds') setLiquidFundsStr(value);
    else if (field === 'monthlyIncome') setMonthlyIncomeStr(value);
    else if (field === 'monthlyExpenses') setMonthlyExpensesStr(value);
    else if (field === 'annualIncome') setAnnualIncomeStr(value);
    const err = validate(field as any, value);
    setErrors(e => ({ ...e, [field]: err }));
  };

  const debtSummary=useMemo(()=>controller.getDebtSummary(),[controller,controllerRevision]);
  const totalDebt=debtSummary.totalBalance,hasActiveDebtRecords=debtSummary.activeCount>0;
  const liquidFunds = parseMoney(liquidFundsStr);
  const monthlyIncome = parseMoney(monthlyIncomeStr);
  const monthlyExpenses = parseMoney(monthlyExpensesStr);
  const annualIncome = parseMoney(annualIncomeStr);
  const supplied=(value:number|null)=>value!==null&&value>=0?value:undefined;
  const report=useMemo(()=>evaluateHealthComponents({liquidFunds:supplied(liquidFunds),monthlyIncome:supplied(monthlyIncome),monthlyExpenses:supplied(monthlyExpenses),annualIncome:supplied(annualIncome),totalDebt},config),[liquidFunds,monthlyIncome,monthlyExpenses,annualIncome,totalDebt,config]);
  const {emergencyFund:emergency,debtToIncome:debtCheck,savings}=report;
  // Removed fill from accounts per Phase-E requirements

  const fillIncomeExpensesFromMonth = () => {
    const monthKey = controller.getCurrentMonthKey();
    const cash = controller.getMonthlyCashFlow(monthKey);
    const inc = inputAmount(cash.actual.income);
    const exp = inputAmount(cash.actual.expense);
    handleMoneyChange('monthlyIncome',inc);
    handleMoneyChange('monthlyExpenses',exp);
  };

  const annualizeMonthlyIncome = () => {
    const v = parseMoney(monthlyIncomeStr);
    if (v === null || v < 0) return;
    try{const annual = scaleMinor(v, 12, 1);setAnnualIncomeStr(inputAmount(annual));setErrors(e => ({ ...e, annualIncome: '' }));}
    catch{setErrors(e=>({...e,annualIncome:'Annualized income exceeds supported precision. Enter an annual amount explicitly.'}));}
  };

  const saveConfig = () => {
    const nextErrors = { targetEmergencyMonths: '', maxDebtToIncome: '', minSavingsRate: '' };
    let ok = true;
    const tem = Number(configDraft.targetEmergencyMonths);
    const mdi = Number(configDraft.maxDebtToIncome);
    const msr = Number(configDraft.minSavingsRate) / 100;
    if (!configDraft.targetEmergencyMonths.trim() || !Number.isFinite(tem) || tem < 0) { nextErrors.targetEmergencyMonths = 'Enter a target of zero or more months'; ok = false; }
    if (!configDraft.maxDebtToIncome.trim() || !Number.isFinite(mdi) || mdi < 0) { nextErrors.maxDebtToIncome = 'Enter a maximum of zero or more'; ok = false; }
    if (!configDraft.minSavingsRate.trim() || !Number.isFinite(msr) || msr < 0 || msr > 1) { nextErrors.minSavingsRate = 'Enter a percentage between 0 and 100'; ok = false; }
    setConfigErrors(nextErrors);
    if (!ok) {const first=Object.entries(nextErrors).find(([,message])=>message);if(first)document.getElementById(first[0])?.focus();return;}
    try{controller.updateHealthConfig({ targetEmergencyMonths: tem, maxDebtToIncome: mdi, minSavingsRate: msr });setConfigSaveError('');setConfigOpen(false);}
    catch(e){setConfigSaveError(e instanceof Error?e.message:'Targets could not be saved.');}
  };

  return (
    <div>
      <div className="screen-header"><div><h1 className="screen-title">Health checks</h1><div className="screen-sub">Compare the figures you supply with your chosen targets. Working inputs are temporary unless you explicitly save them as shared planning assumptions.</div></div></div>

      <fieldset className="card" style={{ marginBottom: '1rem' }}>
        <legend className="label">Health inputs</legend><SharedAssumptions values={{liquidFunds,monthlyIncome,monthlyExpenses,annualIncome}} onLoad={values=>{if(values.liquidFunds!==undefined)handleMoneyChange('liquidFunds',inputAmount(values.liquidFunds));if(values.monthlyIncome!==undefined)handleMoneyChange('monthlyIncome',inputAmount(values.monthlyIncome));if(values.monthlyExpenses!==undefined)handleMoneyChange('monthlyExpenses',inputAmount(values.monthlyExpenses));if(values.annualIncome!==undefined)handleMoneyChange('annualIncome',inputAmount(values.annualIncome));}}/>{product.example&&<><button type="button" className="btn btn-secondary" onClick={()=>{setLiquidFundsStr(exampleFigures.liquidFunds);setMonthlyIncomeStr(exampleFigures.monthlyIncome);setMonthlyExpensesStr(exampleFigures.monthlyExpenses);setAnnualIncomeStr(exampleFigures.annualIncome);setErrors({liquidFunds:"",monthlyIncome:"",monthlyExpenses:"",annualIncome:""});}}>Try example figures</button><p className="field-help">Fictional temporary assumptions, not verified finances.</p></>}<p className="field-help">Enter figures you intend to assess. Recorded helper values cover the full calendar month, including future-dated records, not a verified typical month.</p>
        <div className="grid grid-2">
          <div>
            <label className="label" htmlFor="liquidFunds">Liquid funds</label>
            <input className="input" inputMode="decimal" id="liquidFunds" value={liquidFundsStr} onChange={e => handleMoneyChange('liquidFunds', e.target.value)} aria-invalid={!!errors.liquidFunds} aria-describedby="liquidFunds-error" />
            {errors.liquidFunds && <div id="liquidFunds-error" role="alert">{errors.liquidFunds}</div>}
          </div>
          <div>
            <label className="label" htmlFor="monthlyIncome">Monthly income</label>
            <input className="input" inputMode="decimal" id="monthlyIncome" value={monthlyIncomeStr} onChange={e => handleMoneyChange('monthlyIncome', e.target.value)} aria-invalid={!!errors.monthlyIncome} aria-describedby="monthlyIncome-error" />
            {errors.monthlyIncome && <div id="monthlyIncome-error" role="alert">{errors.monthlyIncome}</div>}
          </div>
          <div>
            <label className="label" htmlFor="monthlyExpenses">Monthly expenses</label>
            <input className="input" inputMode="decimal" id="monthlyExpenses" value={monthlyExpensesStr} onChange={e => handleMoneyChange('monthlyExpenses', e.target.value)} aria-invalid={!!errors.monthlyExpenses} aria-describedby="monthlyExpenses-error" />
            {errors.monthlyExpenses && <div id="monthlyExpenses-error" role="alert">{errors.monthlyExpenses}</div>}
            <button className="btn btn-secondary" type="button" onClick={fillIncomeExpensesFromMonth}>Use this month's recorded income and expenses</button>
          </div>
          <div>
            <label className="label" htmlFor="annualIncome">Annual income</label>
            <input className="input" inputMode="decimal" id="annualIncome" value={annualIncomeStr} onChange={e => handleMoneyChange('annualIncome', e.target.value)} aria-invalid={!!errors.annualIncome} aria-describedby="annualIncome-error" />
            {errors.annualIncome && <div id="annualIncome-error" role="alert">{errors.annualIncome}</div>}
            <button className="btn btn-secondary" type="button" onClick={annualizeMonthlyIncome}>Use entered monthly income × 12</button>
          </div>
        </div>
      </fieldset>

      <div className="grid grid-2">
        <div className="card">
          <h2 className="card-title">Emergency reserve check</h2>{report.errors.emergencyFund&&<p role="alert">{report.errors.emergencyFund}</p>}<p className="field-help">Target = your monthly expenses × target months. Coverage = entered liquid funds ÷ entered expenses. No reserve is earmarked automatically.</p>
          <div className="stat"><div className="stat-label">Target months</div><div className="stat-value">{config.targetEmergencyMonths}</div></div>
          <div className="stat"><div className="stat-label">Target amount</div><div className="stat-value">{emergency ? fmt(emergency.targetAmount) : 'Not supplied'}</div></div>
          <div className="stat"><div className="stat-label">Current liquid funds</div><div className="stat-value">{liquidFunds !== null ? fmt(liquidFunds) : 'Not supplied'}</div></div>
          <div className="stat"><div className="stat-label">Months covered</div><div className="stat-value">{emergency ? emergency.monthsCovered === null ? 'Cannot calculate' : emergency.monthsCovered.toFixed(1) : 'Not supplied'}</div></div>
          <div className="stat"><div className="stat-label">Result</div><div className="stat-value">{emergency ? monthlyExpenses === 0 ? 'Cannot assess coverage with zero expenses' : emergency.meetsTarget ? 'Target met' : 'Target not met' : 'Not supplied'}</div></div>
        </div>
        <div className="card">
          <h2 className="card-title">Outstanding debt / annual income</h2>{report.errors.debtToIncome&&<p role="alert">{report.errors.debtToIncome}</p>}<p className="field-help">Active Debt plans (including explicitly linked liability balances) ÷ your entered annual income. This is not monthly debt-service pressure.</p>
          <div className="stat"><div className="stat-label">Total debt</div><div className="stat-value">{fmt(totalDebt)}</div></div>
          <div className="stat"><div className="stat-label">Annual income</div><div className="stat-value">{annualIncome !== null ? fmt(annualIncome) : 'Not supplied'}</div></div>
          <div className="stat"><div className="stat-label">Ratio</div><div className="stat-value">{debtCheck ? debtCheck.ratio === null ? 'Cannot calculate' : debtCheck.ratio.toFixed(2) : 'Not supplied'}</div></div>
          <div className="stat"><div className="stat-label">Chosen maximum</div><div className="stat-value">{config.maxDebtToIncome}</div></div>
          {!hasActiveDebtRecords&&<p className="field-help">No active Debt plans are recorded. This does not establish that you have no debt.</p>}
          <div className="stat"><div className="stat-label">Meets target</div><div className="stat-value">{debtCheck ? !hasActiveDebtRecords ? 'No active Debt records' : annualIncome === 0 ? 'Cannot assess with zero annual income' : debtCheck.meetsTarget ? 'Target met' : 'Target not met' : 'Not supplied'}</div></div>
        </div>
        <div className="card">
          <h2 className="card-title">Surplus check</h2>{report.errors.savings&&<p role="alert">{report.errors.savings}</p>}<p className="field-help">Entered monthly income less expenses, divided by entered income. This measures an input-based surplus rate, not verified savings.</p>
          <div className="stat"><div className="stat-label">Income less expenses</div><div className="stat-value">{savings ? fmt(savings.monthlySavings) : 'Not supplied'}</div></div>
          <div className="stat"><div className="stat-label">Rate</div><div className="stat-value">{savings ? savings.rate === null ? 'Cannot calculate' : (savings.rate * 100).toFixed(1) + '%' : 'Not supplied'}</div></div>
          <div className="stat"><div className="stat-label">Target rate</div><div className="stat-value">{(config.minSavingsRate * 100).toFixed(0)}%</div></div>
          <div className="stat"><div className="stat-label">Meets target</div><div className="stat-value">{savings ? (savings.meetsTarget === null ? 'Cannot calculate' : (savings.meetsTarget ? 'Target met' : 'Target not met')) : 'Not supplied'}</div></div>
        </div>
        <div className="card">
          <h2 className="card-title">About these checks</h2>
          <div className="muted">Each component uses only its own required inputs. Missing values stay unknown. Debt uses active plans and their explicitly linked accounts where configured. Surplus is not verified saving. Review each check; there is no overall score.</div>
          <div style={{ marginTop: '0.5rem' }}>
            <button className="btn btn-secondary" type="button" onClick={() => setConfigOpen(true)}>Edit targets</button>
          </div>
        </div>
      </div>

      <PlanningHealth components={report} monthlyIncome={monthlyIncome}/><HistoryInsights/>
      <EntryDialog open={configOpen} title="Edit health targets" onClose={()=>setConfigOpen(false)}>{configSaveError&&<p role="alert">{configSaveError}</p>}            <div className="grid grid-1">
              <div>
                <label className="label" htmlFor="targetEmergencyMonths">Target emergency months</label>
                <input className="input" inputMode="decimal" id="targetEmergencyMonths" type="number" step="any" value={configDraft.targetEmergencyMonths} onChange={e => setConfigDraft(d => ({ ...d, targetEmergencyMonths: e.target.value }))} aria-invalid={!!configErrors.targetEmergencyMonths} aria-describedby="targetEmergencyMonths-error" />
                {configErrors.targetEmergencyMonths && <div id="targetEmergencyMonths-error" role="alert">{configErrors.targetEmergencyMonths}</div>}
              </div>
              <div>
                <label className="label" htmlFor="maxDebtToIncome">Maximum outstanding debt / annual income (times)</label>
                <input className="input" inputMode="decimal" id="maxDebtToIncome" type="number" step="any" value={configDraft.maxDebtToIncome} onChange={e => setConfigDraft(d => ({ ...d, maxDebtToIncome: e.target.value }))} aria-invalid={!!configErrors.maxDebtToIncome} aria-describedby="maxDebtToIncome-error" />
                {configErrors.maxDebtToIncome && <div id="maxDebtToIncome-error" role="alert">{configErrors.maxDebtToIncome}</div>}
              </div>
              <div>
                <label className="label" htmlFor="minSavingsRate">Minimum surplus rate (%)</label>
                <input className="input" inputMode="decimal" id="minSavingsRate" type="number" step="any" min="0" max="100" value={configDraft.minSavingsRate} onChange={e => setConfigDraft(d => ({ ...d, minSavingsRate: e.target.value }))} aria-invalid={!!configErrors.minSavingsRate} aria-describedby="minSavingsRate-error" />
                {configErrors.minSavingsRate && <div id="minSavingsRate-error" role="alert">{configErrors.minSavingsRate}</div>}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" type="button" onClick={() => setConfigOpen(false)}>Cancel</button>
              <button className="btn btn-secondary" type="button" onClick={saveConfig}>Save</button>
            </div></EntryDialog>
    </div>
  );
}


