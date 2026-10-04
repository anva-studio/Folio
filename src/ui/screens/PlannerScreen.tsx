import {useProduct} from '../../application/productNavigation';
import {exampleFigures} from '../../application/exampleProfile';
import { useMemo, useState } from 'react';
import { useSession } from '../../application/FolioProvider.js';
import { formatMinor, INR, parseAmountToMinor } from '../../domain/money.js';

export function PlannerScreen() {
  const product=useProduct();
  const { controller, controllerRevision } = useSession();
  void controllerRevision;
  if (!controller) return null;

  const fmt = (n: number) => formatMinor(n, { symbol: INR.symbol, minorDigits: INR.minorDigits, indianGrouping: INR.indianGrouping });

  const [currentLiquidFundsStr, setCurrentLiquidFundsStr] = useState('');
  const [reserveStr, setReserveStr] = useState('');
  const [currentMonthlySurplusStr, setCurrentMonthlySurplusStr] = useState('');
  const [upfrontCostStr, setUpfrontCostStr] = useState('');
  const [addedMonthlyCostStr, setAddedMonthlyCostStr] = useState('');
  const [touched,setTouched] = useState<Record<string,boolean>>({});
  const showError=(id:string,error:string|undefined)=>!!error&&(error!=='Required'||!!touched[id]);
  const [horizonStr, setHorizonStr] = useState('12');

  const handleFillCurrentSurplus = () => {
    const monthKey = controller.getCurrentMonthKey();
    const cash = controller.getMonthlyCashFlow(monthKey);
    const net = cash.actual.net;
    // Input expects numeric major units without symbol prefix
    const major = net / Math.pow(10, INR.minorDigits);
    setCurrentMonthlySurplusStr(String(major));
  };

  const handleFillReserve = () => {
    // Delegate to controller's canonical emergency reserve computation via evaluateHealth
    const monthKey = controller.getCurrentMonthKey();
    const cash = controller.getMonthlyCashFlow(monthKey);
    const healthInput = {
      liquidFunds: 0,
      monthlyIncome: 0,
      monthlyExpenses: cash.actual.expense,
      totalDebt: 0,
      annualIncome: 0,
    };
    const report = controller.evaluateHealth(healthInput);
    const emergencyTarget = report.emergencyFund.targetAmount;
    const major = emergencyTarget / Math.pow(10, INR.minorDigits);
    setReserveStr(String(major));
  };

  const parseMoneyField = (s: string) => {
    try {
      if (!s || s.trim() === '') return { value: undefined as number | undefined, error: 'Required' };
      const v = parseAmountToMinor(s, { minorDigits: INR.minorDigits, symbol: INR.symbol });
      return { value: v, error: undefined };
    } catch {
      return { value: undefined as number | undefined, error: 'Invalid amount' };
    }
  };

  const liquid = parseMoneyField(currentLiquidFundsStr);
  const reserve = parseMoneyField(reserveStr);
  const surplus = parseMoneyField(currentMonthlySurplusStr);
  const upfront = parseMoneyField(upfrontCostStr);
  const added = parseMoneyField(addedMonthlyCostStr);

  const horizonError = horizonStr.trim() === '' ? 'Required' : !Number.isSafeInteger(Number(horizonStr)) || Number(horizonStr) <= 0 ? 'Must be positive integer' : undefined;
  const horizonValue = horizonError ? undefined : Number(horizonStr);

  const inputReady = liquid.value !== undefined && reserve.value !== undefined && surplus.value !== undefined && upfront.value !== undefined && added.value !== undefined && horizonValue !== undefined;

  const scenarioInput = useMemo(() => {
    if (!inputReady) return null;
    return {
      currentLiquidFunds: liquid.value!,
      emergencyReserve: reserve.value!,
      currentMonthlySurplus: surplus.value!,
      upfrontCost: upfront.value!,
      addedMonthlyCost: added.value!,
      horizonMonths: horizonValue!,
    };
  }, [liquid.value, reserve.value, surplus.value, upfront.value, added.value, horizonValue, inputReady]);

  let result = null;
  if (scenarioInput) {
    try {
      result = controller.evaluateScenario(scenarioInput);
    } catch {}
  }

  return (
    <div>
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Planner</h1>{product.example&&<><button className="btn btn-secondary" onClick={()=>{setCurrentLiquidFundsStr(exampleFigures.liquidFunds);setReserveStr(exampleFigures.reserve);setCurrentMonthlySurplusStr(exampleFigures.surplus);setUpfrontCostStr(exampleFigures.upfront);setAddedMonthlyCostStr(exampleFigures.added);}}>Try example figures</button><p className="field-help">Fictional temporary assumptions. Change them to explore a what-if.</p></>}
          <div className="screen-sub">Try a purchase using explicit inputs. This scenario does not change your records. Inputs are temporary.</div>
        </div>
      </div>

      <p className="scope-note">Helpers use this month’s recorded income and expenses to date. They may not represent a typical month. The reserve helper multiplies those expenses by the chosen Health target months; it does not reuse Health’s entered expenses.</p>
      <div className="grid grid-2">
        <div className="card">
          <h2 className="card-title">Inputs</h2>
          <fieldset onBlurCapture={e=>{const id=(e.target as HTMLElement).id;if(id)setTouched(t=>({...t,[id]:true}));}}>
            <legend className="label">Inputs & assumptions</legend>
            <div className="field">
              <label className="label" htmlFor="currentLiquidFunds">Current liquid funds</label>
              <div className="input-money"><span className="currency-prefix">{INR.symbol}</span><input inputMode="decimal" id="currentLiquidFunds" className="input" value={currentLiquidFundsStr} onChange={e=>setCurrentLiquidFundsStr(e.target.value)} aria-invalid={showError('currentLiquidFunds',liquid.error)} aria-describedby="currentLiquidFunds-error" /></div>
              {showError('currentLiquidFunds',liquid.error) && <div id="currentLiquidFunds-error" role="alert">{liquid.error}</div>}
            </div>
            <div className="field">
              <label className="label" htmlFor="reserve">Emergency reserve target</label>
              <div className="input-money"><span className="currency-prefix">{INR.symbol}</span><input inputMode="decimal" id="reserve" className="input" value={reserveStr} onChange={e=>setReserveStr(e.target.value)} aria-invalid={showError('reserve',reserve.error)} aria-describedby="reserve-error" /></div>
              <button className="btn btn-secondary btn-small" type="button" onClick={handleFillReserve}>Calculate reserve from this month's recorded expenses</button>
              {showError('reserve',reserve.error) && <div id="reserve-error" role="alert">{reserve.error}</div>}
            </div>
            <div className="field">
              <label className="label" htmlFor="currentMonthlySurplus">Current monthly surplus</label>
              <div className="input-money"><span className="currency-prefix">{INR.symbol}</span><input inputMode="decimal" id="currentMonthlySurplus" className="input" value={currentMonthlySurplusStr} onChange={e=>setCurrentMonthlySurplusStr(e.target.value)} aria-invalid={showError('currentMonthlySurplus',surplus.error)} aria-describedby="currentMonthlySurplus-error" /></div>
              <button className="btn btn-secondary btn-small" type="button" onClick={handleFillCurrentSurplus}>Use this month's recorded surplus</button>
              {showError('currentMonthlySurplus',surplus.error) && <div id="currentMonthlySurplus-error" role="alert">{surplus.error}</div>}
            </div>
            <div className="field">
              <label className="label" htmlFor="upfrontCost">Upfront cost</label>
              <div className="input-money"><span className="currency-prefix">{INR.symbol}</span><input inputMode="decimal" id="upfrontCost" className="input" value={upfrontCostStr} onChange={e=>setUpfrontCostStr(e.target.value)} aria-invalid={showError('upfrontCost',upfront.error)} aria-describedby="upfrontCost-error" /></div>
              {showError('upfrontCost',upfront.error) && <div id="upfrontCost-error" role="alert">{upfront.error}</div>}
            </div>
            <div className="field">
              <label className="label" htmlFor="addedMonthlyCost">Added monthly cost</label>
              <div className="input-money"><span className="currency-prefix">{INR.symbol}</span><input inputMode="decimal" id="addedMonthlyCost" className="input" value={addedMonthlyCostStr} onChange={e=>setAddedMonthlyCostStr(e.target.value)} aria-invalid={showError('addedMonthlyCost',added.error)} aria-describedby="addedMonthlyCost-error" /></div>
              {showError('addedMonthlyCost',added.error) && <div id="addedMonthlyCost-error" role="alert">{added.error}</div>}
            </div>
            <div className="field">
              <label className="label" htmlFor="horizonMonths">Horizon months</label>
              <input inputMode="decimal" id="horizonMonths" className="input" type="number" min="1" value={horizonStr} onChange={e=>setHorizonStr(e.target.value)} aria-invalid={!!horizonError} aria-describedby="horizonMonths-error" />
              {horizonError && <div id="horizonMonths-error" role="alert">{horizonError}</div>}
            </div>
          </fieldset>
        </div>

        <div className="card">
          <h2 className="card-title">Result</h2>
          {result ? (
            <><p className="scenario-conclusion" role="status">This purchase would leave {fmt(result.postPurchaseLiquidFunds)} in supplied funds. {result.reserveShortfall > 0 ? 'That is '+fmt(result.reserveShortfall)+' below your entered reserve.' : 'Your entered reserve would be covered.'}</p><div className="grid grid-2">
              <div className="stat"><div className="stat-label">Funds after purchase</div><div className="stat-value">{fmt(result.postPurchaseLiquidFunds)}</div></div>
              <div className="stat"><div className="stat-label">Reserve shortfall</div><div className="stat-value">{fmt(result.reserveShortfall)}</div></div>
              <div className="stat"><div className="stat-label">Post-scenario monthly surplus</div><div className="stat-value">{fmt(result.postScenarioMonthlySurplus)}</div></div>
              <div className="stat"><div className="stat-label">Upfront affordable</div><div className="stat-value">{result.upfrontAffordable ? 'Condition met' : 'Condition not met'}</div></div>
              <div className="stat"><div className="stat-label">Reserve protected</div><div className="stat-value">{result.reserveProtected ? 'Condition met' : 'Condition not met'}</div></div>
              <div className="stat"><div className="stat-label">Monthly affordable</div><div className="stat-value">{result.monthlyAffordable ? 'Condition met' : 'Condition not met'}</div></div>
              <div className="stat"><div className="stat-label">Fits these supplied conditions</div><div className={`stat-value ${result.affordable ? 'positive' : 'negative'}`}>{result.affordable ? 'Condition met' : 'Condition not met'}</div></div>
              <div className="stat"><div className="stat-label">Months to recover reserve</div><div className="stat-value">{result.monthsToRecoverReserve ?? 'Cannot calculate'}</div></div>
              <div className="stat"><div className="stat-label">Total added cost over horizon</div><div className="stat-value">{fmt(result.totalAddedCostOverHorizon)}</div></div>
            </div></>
          ) : (
            <div className="empty-state"><h3>Enter values</h3><p>Enter all required figures to compare the purchase with your supplied funds, surplus and reserve target. Enter zero explicitly where a cost does not apply.</p></div>
          )}
        </div>
      </div>
    </div>
  );
}

