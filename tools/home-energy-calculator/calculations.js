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
  const fixedMonthlyCost = input.fixedMonthlyCost === "" || input.fixedMonthlyCost == null
    ? 0
    : parseNumber(input.fixedMonthlyCost, { field: "Fixed monthly charge", fieldId: "fixed-monthly-cost", min: 0, max: 100000 });
  const appliances = Array.isArray(input.appliances) ? input.appliances : [];
  if (!appliances.length) throw new ValidationError("Add at least one appliance before calculating.", "appliance-list");

  const items = appliances.map((appliance, index) => {
    const position = index + 1;
    const name = String(appliance.name ?? "").trim() || `Appliance ${position}`;
    const mode = appliance.mode === "known" ? "known" : "estimate";
    if (mode === "known") {
      const monthlyKwh = parseNumber(appliance.monthlyKwh, { field: `${name} monthly use`, fieldId: `appliance-${index}-kwh`, min: 0.01, max: 100000000 });
      const monthlyCost = monthlyKwh * pricePerKwh;
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
    const watts = parseNumber(appliance.watts, { field: `${name} power`, fieldId: `appliance-${index}-watts`, min: 0.01, max: 1000000 });
    const quantity = parseNumber(appliance.quantity, { field: `${name} quantity`, fieldId: `appliance-${index}-quantity`, min: 1, max: 10000, integer: true });
    const hoursPerDay = parseNumber(appliance.hoursPerDay, { field: `${name} daily use`, fieldId: `appliance-${index}-hours`, min: 0.01, max: 24 });
    const daysPerMonth = parseNumber(appliance.daysPerMonth, { field: `${name} monthly days`, fieldId: `appliance-${index}-days`, min: 1, max: 31, integer: true });
    const monthlyKwh = (watts / 1000) * quantity * hoursPerDay * daysPerMonth;
    const monthlyCost = monthlyKwh * pricePerKwh;
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
  const monthlyEnergyCost = items.reduce((sum, item) => sum + item.monthlyCost, 0);
  const monthlyCost = monthlyEnergyCost + fixedMonthlyCost;
  return {
    pricePerKwh,
    fixedMonthlyCost,
    items: items.sort((left, right) => right.monthlyKwh - left.monthlyKwh),
    dailyKwh: monthlyKwh / 30,
    dailyCost: monthlyCost / 30,
    monthlyKwh,
    monthlyEnergyCost,
    monthlyCost,
    annualKwh: monthlyKwh * 12,
    annualEnergyCost: monthlyEnergyCost * 12,
    annualCost: monthlyCost * 12,
  };
}

export function formatNumber(value, digits = 2) {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(Number(value) || 0);
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(Number(value) || 0);
}
