import { describe, it, expect } from 'vitest';
import {
  ScenarioError,
  assertValidScenarioInput,
  evaluateAffordabilityScenario,
} from '../../src/domain/scenario';

describe('Scenario validation', () => {
  it('valid scenario', () => {
    expect(() => assertValidScenarioInput({
      currentLiquidFunds: 1000,
      emergencyReserve: 500,
      currentMonthlySurplus: 200,
      upfrontCost: 100,
      addedMonthlyCost: 50,
    })).not.toThrow();
  });
  it('zero costs valid', () => {
    expect(() => assertValidScenarioInput({
      currentLiquidFunds: 0,
      emergencyReserve: 0,
      currentMonthlySurplus: 0,
      upfrontCost: 0,
      addedMonthlyCost: 0,
    })).not.toThrow();
  });
  it('negative liquid funds rejected', () => {
    expect(() => assertValidScenarioInput({
      currentLiquidFunds: -1,
      emergencyReserve: 0,
      currentMonthlySurplus: 0,
      upfrontCost: 0,
      addedMonthlyCost: 0,
    })).toThrow(ScenarioError);
  });
  it('negative reserve rejected', () => {
    expect(() => assertValidScenarioInput({
      currentLiquidFunds: 0,
      emergencyReserve: -1,
      currentMonthlySurplus: 0,
      upfrontCost: 0,
      addedMonthlyCost: 0,
    })).toThrow(ScenarioError);
  });
  it('negative upfront rejected', () => {
    expect(() => assertValidScenarioInput({
      currentLiquidFunds: 0,
      emergencyReserve: 0,
      currentMonthlySurplus: 0,
      upfrontCost: -1,
      addedMonthlyCost: 0,
    })).toThrow(ScenarioError);
  });
  it('negative added monthly cost rejected', () => {
    expect(() => assertValidScenarioInput({
      currentLiquidFunds: 0,
      emergencyReserve: 0,
      currentMonthlySurplus: 0,
      upfrontCost: 0,
      addedMonthlyCost: -1,
    })).toThrow(ScenarioError);
  });
  it('negative currentMonthlySurplus allowed', () => {
    expect(() => assertValidScenarioInput({
      currentLiquidFunds: 0,
      emergencyReserve: 0,
      currentMonthlySurplus: -100,
      upfrontCost: 0,
      addedMonthlyCost: 0,
    })).not.toThrow();
  });
  it('non-integer money rejected', () => {
    expect(() => assertValidScenarioInput({
      currentLiquidFunds: 1.5 as any,
      emergencyReserve: 0,
      currentMonthlySurplus: 0,
      upfrontCost: 0,
      addedMonthlyCost: 0,
    })).toThrow(ScenarioError);
  });
  it('unsafe integer rejected', () => {
    const big = Number.MAX_SAFE_INTEGER + 1;
    expect(() => assertValidScenarioInput({
      currentLiquidFunds: big as any,
      emergencyReserve: 0,
      currentMonthlySurplus: 0,
      upfrontCost: 0,
      addedMonthlyCost: 0,
    })).toThrow(ScenarioError);
  });
  it('horizon 0 rejected', () => {
    expect(() => assertValidScenarioInput({
      currentLiquidFunds: 0,
      emergencyReserve: 0,
      currentMonthlySurplus: 0,
      upfrontCost: 0,
      addedMonthlyCost: 0,
      horizonMonths: 0,
    })).toThrow(ScenarioError);
  });
  it('negative horizon rejected', () => {
    expect(() => assertValidScenarioInput({
      currentLiquidFunds: 0,
      emergencyReserve: 0,
      currentMonthlySurplus: 0,
      upfrontCost: 0,
      addedMonthlyCost: 0,
      horizonMonths: -1,
    })).toThrow(ScenarioError);
  });
  it('non-integer horizon rejected', () => {
    expect(() => assertValidScenarioInput({
      currentLiquidFunds: 0,
      emergencyReserve: 0,
      currentMonthlySurplus: 0,
      upfrontCost: 0,
      addedMonthlyCost: 0,
      horizonMonths: 1.5 as any,
    })).toThrow(ScenarioError);
  });
});

describe('Upfront affordability', () => {
  it('enough cash', () => {
    const r = evaluateAffordabilityScenario({
      currentLiquidFunds: 1000,
      emergencyReserve: 500,
      currentMonthlySurplus: 200,
      upfrontCost: 600,
      addedMonthlyCost: 0,
    });
    expect(r.upfrontAffordable).toBe(true);
    expect(r.postPurchaseLiquidFunds).toBe(400);
  });
  it('exact cash amount', () => {
    const r = evaluateAffordabilityScenario({
      currentLiquidFunds: 1000,
      emergencyReserve: 500,
      currentMonthlySurplus: 200,
      upfrontCost: 1000,
      addedMonthlyCost: 0,
    });
    expect(r.upfrontAffordable).toBe(true);
    expect(r.postPurchaseLiquidFunds).toBe(0);
  });
  it('insufficient cash', () => {
    const r = evaluateAffordabilityScenario({
      currentLiquidFunds: 500,
      emergencyReserve: 500,
      currentMonthlySurplus: 200,
      upfrontCost: 600,
      addedMonthlyCost: 0,
    });
    expect(r.upfrontAffordable).toBe(false);
    expect(r.postPurchaseLiquidFunds).toBe(-100);
  });
  it('reserve remains protected', () => {
    const r = evaluateAffordabilityScenario({
      currentLiquidFunds: 1000,
      emergencyReserve: 500,
      currentMonthlySurplus: 200,
      upfrontCost: 400,
      addedMonthlyCost: 0,
    });
    expect(r.reserveProtected).toBe(true);
    expect(r.reserveShortfall).toBe(0);
  });
  it('reserve breached', () => {
    const r = evaluateAffordabilityScenario({
      currentLiquidFunds: 1000,
      emergencyReserve: 700,
      currentMonthlySurplus: 200,
      upfrontCost: 400,
      addedMonthlyCost: 0,
    });
    expect(r.reserveProtected).toBe(false);
    expect(r.reserveShortfall).toBe(100);
  });
  it('exact reserve boundary', () => {
    const r = evaluateAffordabilityScenario({
      currentLiquidFunds: 1000,
      emergencyReserve: 600,
      currentMonthlySurplus: 200,
      upfrontCost: 400,
      addedMonthlyCost: 0,
    });
    expect(r.reserveProtected).toBe(true);
    expect(r.reserveShortfall).toBe(0);
  });
});

describe('Monthly affordability', () => {
  it('monthly cost below surplus', () => {
    const r = evaluateAffordabilityScenario({
      currentLiquidFunds: 1000,
      emergencyReserve: 500,
      currentMonthlySurplus: 200,
      upfrontCost: 0,
      addedMonthlyCost: 100,
    });
    expect(r.postScenarioMonthlySurplus).toBe(100);
    expect(r.monthlyAffordable).toBe(true);
  });
  it('exactly consumes surplus', () => {
    const r = evaluateAffordabilityScenario({
      currentLiquidFunds: 1000,
      emergencyReserve: 500,
      currentMonthlySurplus: 200,
      upfrontCost: 0,
      addedMonthlyCost: 200,
    });
    expect(r.postScenarioMonthlySurplus).toBe(0);
    expect(r.monthlyAffordable).toBe(true);
  });
  it('exceeds surplus', () => {
    const r = evaluateAffordabilityScenario({
      currentLiquidFunds: 1000,
      emergencyReserve: 500,
      currentMonthlySurplus: 200,
      upfrontCost: 0,
      addedMonthlyCost: 250,
    });
    expect(r.postScenarioMonthlySurplus).toBe(-50);
    expect(r.monthlyAffordable).toBe(false);
  });
  it('baseline surplus already negative', () => {
    const r = evaluateAffordabilityScenario({
      currentLiquidFunds: 1000,
      emergencyReserve: 500,
      currentMonthlySurplus: -100,
      upfrontCost: 0,
      addedMonthlyCost: 0,
    });
    expect(r.monthlyAffordable).toBe(false);
  });
});

describe('Overall affordability', () => {
  it('fully affordable', () => {
    const r = evaluateAffordabilityScenario({
      currentLiquidFunds: 1000,
      emergencyReserve: 500,
      currentMonthlySurplus: 200,
      upfrontCost: 300,
      addedMonthlyCost: 100,
    });
    expect(r.affordable).toBe(true);
  });
  it('upfront unaffordable', () => {
    const r = evaluateAffordabilityScenario({
      currentLiquidFunds: 200,
      emergencyReserve: 500,
      currentMonthlySurplus: 200,
      upfrontCost: 300,
      addedMonthlyCost: 100,
    });
    expect(r.affordable).toBe(false);
    expect(r.upfrontAffordable).toBe(false);
  });
  it('reserve breach', () => {
    const r = evaluateAffordabilityScenario({
      currentLiquidFunds: 800,
      emergencyReserve: 600,
      currentMonthlySurplus: 200,
      upfrontCost: 300,
      addedMonthlyCost: 100,
    });
    expect(r.affordable).toBe(false);
    expect(r.reserveProtected).toBe(false);
  });
  it('monthly unaffordable', () => {
    const r = evaluateAffordabilityScenario({
      currentLiquidFunds: 1000,
      emergencyReserve: 500,
      currentMonthlySurplus: 100,
      upfrontCost: 300,
      addedMonthlyCost: 200,
    });
    expect(r.affordable).toBe(false);
    expect(r.monthlyAffordable).toBe(false);
  });
});

describe('Recovery months', () => {
  it('no shortfall => 0', () => {
    const r = evaluateAffordabilityScenario({
      currentLiquidFunds: 1000,
      emergencyReserve: 500,
      currentMonthlySurplus: 200,
      upfrontCost: 300,
      addedMonthlyCost: 0,
    });
    expect(r.monthsToRecoverReserve).toBe(0);
  });
  it('positive surplus exact division', () => {
    const r = evaluateAffordabilityScenario({
      currentLiquidFunds: 400,
      emergencyReserve: 600,
      currentMonthlySurplus: 200,
      upfrontCost: 0,
      addedMonthlyCost: 100,
    });
    expect(r.reserveShortfall).toBe(200);
    expect(r.postScenarioMonthlySurplus).toBe(100);
    expect(r.monthsToRecoverReserve).toBe(2);
  });
  it('positive surplus ceiling division', () => {
    const r = evaluateAffordabilityScenario({
      currentLiquidFunds: 400,
      emergencyReserve: 600,
      currentMonthlySurplus: 200,
      upfrontCost: 0,
      addedMonthlyCost: 50,
    });
    expect(r.reserveShortfall).toBe(200);
    expect(r.postScenarioMonthlySurplus).toBe(150);
    expect(r.monthsToRecoverReserve).toBe(2);
  });
  it('zero post-scenario surplus => null', () => {
    const r = evaluateAffordabilityScenario({
      currentLiquidFunds: 400,
      emergencyReserve: 600,
      currentMonthlySurplus: 100,
      upfrontCost: 0,
      addedMonthlyCost: 100,
    });
    expect(r.monthsToRecoverReserve).toBeNull();
  });
  it('negative post-scenario surplus => null', () => {
    const r = evaluateAffordabilityScenario({
      currentLiquidFunds: 400,
      emergencyReserve: 600,
      currentMonthlySurplus: 50,
      upfrontCost: 0,
      addedMonthlyCost: 100,
    });
    expect(r.monthsToRecoverReserve).toBeNull();
  });
});

describe('Horizon', () => {
  it('default 12', () => {
    const r = evaluateAffordabilityScenario({
      currentLiquidFunds: 1000,
      emergencyReserve: 500,
      currentMonthlySurplus: 200,
      upfrontCost: 100,
      addedMonthlyCost: 50,
    });
    expect(r.horizonMonths).toBe(12);
    expect(r.totalAddedCostOverHorizon).toBe(100 + 50 * 12);
  });
  it('custom horizon', () => {
    const r = evaluateAffordabilityScenario({
      currentLiquidFunds: 1000,
      emergencyReserve: 500,
      currentMonthlySurplus: 200,
      upfrontCost: 100,
      addedMonthlyCost: 50,
      horizonMonths: 6,
    });
    expect(r.horizonMonths).toBe(6);
    expect(r.totalAddedCostOverHorizon).toBe(100 + 50 * 6);
  });
  it('multiplication overflow throws', () => {
    const big = Number.MAX_SAFE_INTEGER;
    expect(() => evaluateAffordabilityScenario({
      currentLiquidFunds: 0,
      emergencyReserve: 0,
      currentMonthlySurplus: 0,
      upfrontCost: 0,
      addedMonthlyCost: big,
      horizonMonths: 2,
    })).toThrow(RangeError);
  });
});
