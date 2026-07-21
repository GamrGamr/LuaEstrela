export class ValidationError extends Error {
  constructor(message, fieldId = "") {
    super(message);
    this.name = "ValidationError";
    this.fieldId = fieldId;
  }
}

export function sanitiseDecimalInput(value) {
  let separatorUsed = false;
  return [...String(value ?? "")].reduce((result, character) => {
    if (/\d/.test(character)) return result + character;
    if ((character === "." || character === ",") && !separatorUsed) {
      separatorUsed = true;
      return result + character;
    }
    return result;
  }, "");
}

export function sanitiseIntegerInput(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function parseNumber(value, { field, fieldId = "", min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) throw new ValidationError(`${field} is required.`, fieldId);
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new ValidationError(`${field} must be a valid number.`, fieldId);
  const number = Number(text);
  if (!Number.isFinite(number)) throw new ValidationError(`${field} must be a valid number.`, fieldId);
  if (number < min) throw new ValidationError(`${field} must be at least ${min}.`, fieldId);
  if (number > max) throw new ValidationError(`${field} cannot be greater than ${max}.`, fieldId);
  if (integer && !Number.isInteger(number)) throw new ValidationError(`${field} must be a whole number.`, fieldId);
  return number;
}

export function calculateHomeEnergy(input = {}) {
  const pricePerKwh = parseNumber(input.pricePerKwh, { field: "Electricity price", fieldId: "price-per-kwh", min: 0, max: 100 });
  const energyIvaRate = input.energyIvaRate === "" || input.energyIvaRate == null
    ? 0
    : parseNumber(input.energyIvaRate, { field: "Energy IVA", fieldId: "energy-iva", min: 0, max: 100 });
  const contractedPowerPricePerDay = input.contractedPowerPricePerDay === "" || input.contractedPowerPricePerDay == null
    ? 0
    : parseNumber(input.contractedPowerPricePerDay, { field: "Contracted power price", fieldId: "contracted-power-price", min: 0, max: 1000 });
  const contractedPowerIvaRate = input.contractedPowerIvaRate === "" || input.contractedPowerIvaRate == null
    ? 0
    : parseNumber(input.contractedPowerIvaRate, { field: "Contracted power IVA", fieldId: "contracted-power-iva", min: 0, max: 100 });
  const billingDays = input.billingDays === "" || input.billingDays == null
    ? 30
    : parseNumber(input.billingDays, { field: "Billing days", fieldId: "billing-days", min: 1, max: 366, integer: true });
  const fixedMonthlyCost = input.fixedMonthlyCost === "" || input.fixedMonthlyCost == null
    ? 0
    : parseNumber(input.fixedMonthlyCost, { field: "Fixed monthly charge", fieldId: "fixed-monthly-cost", min: 0, max: 100000 });
  const appliances = Array.isArray(input.appliances) ? input.appliances : [];
  if (!appliances.length) throw new ValidationError("Add at least one appliance before calculating.", "appliance-list");

  const items = appliances.map((appliance, index) => {
    const position = index + 1;
    const name = String(appliance.name ?? "").trim() || `Appliance ${position}`;
    const hasMeasuredKwh = String(appliance.monthlyKwh ?? "").trim() !== "";
    const mode = hasMeasuredKwh ? "measured" : "estimate";
    if (hasMeasuredKwh) {
      const monthlyKwh = parseNumber(appliance.monthlyKwh, { field: `${name} monthly use`, fieldId: `appliance-${index}-kwh`, min: 0.01, max: 100000000 });
      const monthlyCost = monthlyKwh * pricePerKwh * (1 + (energyIvaRate / 100));
      return {
        id: appliance.id ?? String(position),
        name,
        mode,
        monthlyKwh,
        monthlyCost,
        annualKwh: monthlyKwh * 12,
        annualCost: monthlyCost * 12,
      };
    }
    const watts = parseNumber(appliance.watts, { field: `${name} power`, fieldId: `appliance-${index}-watts`, min: 0, max: 1000000 });
    const quantity = parseNumber(appliance.quantity, { field: `${name} quantity`, fieldId: `appliance-${index}-quantity`, min: 1, max: 10000, integer: true });
    const hoursPerDay = parseNumber(appliance.hoursPerDay, { field: `${name} daily use`, fieldId: `appliance-${index}-hours`, min: 0, max: 24 });
    const daysPerMonth = parseNumber(appliance.daysPerMonth, { field: `${name} monthly days`, fieldId: `appliance-${index}-days`, min: 1, max: 31, integer: true });
    const monthlyKwh = (watts / 1000) * quantity * hoursPerDay * daysPerMonth;
    const monthlyCost = monthlyKwh * pricePerKwh * (1 + (energyIvaRate / 100));
    return {
      id: appliance.id ?? String(position),
      name,
      mode,
      watts,
      quantity,
      hoursPerDay,
      daysPerMonth,
      monthlyKwh,
      monthlyCost,
      annualKwh: monthlyKwh * 12,
      annualCost: monthlyCost * 12,
    };
  });

  const monthlyKwh = items.reduce((sum, item) => sum + item.monthlyKwh, 0);
  const monthlyEnergySubtotal = monthlyKwh * pricePerKwh;
  const monthlyEnergyIva = monthlyEnergySubtotal * (energyIvaRate / 100);
  const monthlyEnergyCost = monthlyEnergySubtotal + monthlyEnergyIva;
  const monthlyPowerSubtotal = contractedPowerPricePerDay * billingDays;
  const monthlyPowerIva = monthlyPowerSubtotal * (contractedPowerIvaRate / 100);
  const monthlyPowerCost = monthlyPowerSubtotal + monthlyPowerIva;
  const monthlyCost = monthlyEnergyCost + monthlyPowerCost + fixedMonthlyCost;
  const annualEnergySubtotal = monthlyEnergySubtotal * 12;
  const annualEnergyIva = monthlyEnergyIva * 12;
  const annualEnergyCost = annualEnergySubtotal + annualEnergyIva;
  const annualPowerSubtotal = contractedPowerPricePerDay * 365;
  const annualPowerIva = annualPowerSubtotal * (contractedPowerIvaRate / 100);
  const annualPowerCost = annualPowerSubtotal + annualPowerIva;
  const annualCost = annualEnergyCost + annualPowerCost + (fixedMonthlyCost * 12);
  return {
    pricePerKwh,
    energyIvaRate,
    contractedPowerPricePerDay,
    contractedPowerIvaRate,
    billingDays,
    fixedMonthlyCost,
    items: items.sort((left, right) => right.monthlyKwh - left.monthlyKwh),
    dailyKwh: monthlyKwh / billingDays,
    dailyCost: monthlyCost / billingDays,
    monthlyKwh,
    monthlyEnergySubtotal,
    monthlyEnergyIva,
    monthlyEnergyCost,
    monthlyPowerSubtotal,
    monthlyPowerIva,
    monthlyPowerCost,
    monthlyCost,
    annualKwh: monthlyKwh * 12,
    annualEnergySubtotal,
    annualEnergyIva,
    annualEnergyCost,
    annualPowerSubtotal,
    annualPowerIva,
    annualPowerCost,
    annualCost,
  };
}

export function formatNumber(value, digits = 2) {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(Number(value) || 0);
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(Number(value) || 0);
}
