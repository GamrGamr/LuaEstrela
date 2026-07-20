export class ValidationError extends Error {
  constructor(message, field = "") {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

export const ENERGY_TYPES = ["petrol", "diesel", "lpg", "hybrid", "plug-in-hybrid", "electric"];

export function parseNumber(value, { field = "Value", min = 0, required = false } = {}) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ValidationError(`${field} must be a valid number.`, field);
    if (value < min) throw new ValidationError(`${field} cannot be lower than ${min}.`, field);
    return value;
  }

  let text = String(value ?? "").trim().replace(/\s/g, "");
  if (!text) {
    if (required) throw new ValidationError(`${field} is required.`, field);
    return 0;
  }

  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    text = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (comma >= 0) {
    text = text.replace(",", ".");
  }

  const number = Number(text);
  if (!Number.isFinite(number)) throw new ValidationError(`${field} must be a valid number.`, field);
  if (number < min) throw new ValidationError(`${field} cannot be lower than ${min}.`, field);
  return number;
}

export function calculateJourney(input = {}) {
  const energyType = ENERGY_TYPES.includes(input.energyType) ? input.energyType : "petrol";
  const oneWayDistance = parseNumber(input.oneWayDistance, { field: "One-way distance", required: true });
  const tripMultiplier = parseNumber(input.tripMultiplier ?? 1, { field: "Trip multiplier", min: 0.01, required: true });
  const additionalKilometres = parseNumber(input.additionalKilometres, { field: "Additional kilometres" });
  const passengerCount = parseNumber(input.passengerCount ?? 1, { field: "Passenger count", min: 1, required: true });
  if (!Number.isInteger(passengerCount)) throw new ValidationError("Passenger count must be a whole number.", "Passenger count");

  const totalDistance = oneWayDistance * tripMultiplier + additionalKilometres;
  if (!(totalDistance > 0)) throw new ValidationError("Total distance must be greater than zero.", "Total distance");

  let fuelConsumption = 0;
  let electricConsumption = 0;
  let fuelPrice = 0;
  let electricityPrice = 0;

  if (energyType === "electric") {
    electricConsumption = parseNumber(input.electricConsumption ?? input.consumption, { field: "Electricity consumption", min: 0.01, required: true });
    electricityPrice = parseNumber(input.electricityPrice ?? input.energyPrice, { field: "Electricity price", required: true });
  } else if (energyType === "plug-in-hybrid") {
    fuelConsumption = parseNumber(input.fuelConsumption ?? input.consumption, { field: "Fuel consumption" });
    electricConsumption = parseNumber(input.electricConsumption, { field: "Electricity consumption" });
    fuelPrice = parseNumber(input.fuelPrice ?? input.energyPrice, { field: "Fuel price" });
    electricityPrice = parseNumber(input.electricityPrice, { field: "Electricity price" });
    if (!(fuelConsumption > 0 || electricConsumption > 0)) {
      throw new ValidationError("Enter fuel consumption, electricity consumption, or both.", "Consumption");
    }
  } else {
    fuelConsumption = parseNumber(input.fuelConsumption ?? input.consumption, { field: "Fuel consumption", min: 0.01, required: true });
    fuelPrice = parseNumber(input.fuelPrice ?? input.energyPrice, { field: "Fuel price", required: true });
  }

  const fuelQuantity = totalDistance * fuelConsumption / 100;
  const electricQuantity = totalDistance * electricConsumption / 100;
  const fuelCost = fuelQuantity * fuelPrice;
  const electricityCost = electricQuantity * electricityPrice;
  const energyCost = fuelCost + electricityCost;

  const outboundToll = parseNumber(input.outboundToll, { field: "Outbound toll" });
  const returnToll = parseNumber(input.returnToll, { field: "Return toll" });
  const ferryCost = parseNumber(input.ferryCost, { field: "Ferry cost" });
  const parkingCost = parseNumber(input.parkingCost, { field: "Parking cost" });
  const maintenanceRate = parseNumber(input.maintenanceRate, { field: "Maintenance cost per kilometre" });
  const maintenanceCost = totalDistance * maintenanceRate;
  const customCosts = (Array.isArray(input.customCosts) ? input.customCosts : []).map((item, index) => ({
    name: String(item?.name || `Additional cost ${index + 1}`).trim(),
    amount: parseNumber(item?.amount, { field: item?.name || `Additional cost ${index + 1}` }),
  })).filter((item) => item.amount > 0);
  const customCostTotal = customCosts.reduce((sum, item) => sum + item.amount, 0);
  const totalTolls = outboundToll + returnToll;
  const totalCost = energyCost + totalTolls + ferryCost + parkingCost + maintenanceCost + customCostTotal;

  return {
    oneWayDistance,
    tripMultiplier,
    additionalKilometres,
    totalDistance,
    durationSeconds: parseNumber(input.durationSeconds, { field: "Duration" }),
    energyType,
    fuelConsumption,
    electricConsumption,
    fuelPrice,
    electricityPrice,
    fuelQuantity,
    electricQuantity,
    fuelCost,
    electricityCost,
    energyCost,
    outboundToll,
    returnToll,
    totalTolls,
    ferryCost,
    parkingCost,
    maintenanceRate,
    maintenanceCost,
    customCosts,
    customCostTotal,
    passengerCount,
    totalCost,
    costPerKilometre: totalCost / totalDistance,
    costPerPassenger: totalCost / passengerCount,
    currency: String(input.currency || "EUR").toUpperCase().slice(0, 3),
  };
}

function validPositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function weightedConsumption(intervals) {
  const kilometres = intervals.reduce((sum, item) => sum + item.kilometres, 0);
  const litres = intervals.reduce((sum, item) => sum + item.litres, 0);
  return kilometres > 0 ? litres / kilometres * 100 : null;
}

export function calculateFillUpConsumption(records = []) {
  const fills = [...records].sort((a, b) => {
    const dateDifference = new Date(a.date || 0) - new Date(b.date || 0);
    if (dateDifference) return dateDifference;
    return validPositive(a.odometer) - validPositive(b.odometer);
  });
  const intervals = [];
  let previousFullIndex = -1;

  fills.forEach((fill, index) => {
    if (!fill.fullTank) return;
    if (previousFullIndex >= 0) {
      const previous = fills[previousFullIndex];
      const slice = fills.slice(previousFullIndex + 1, index + 1);
      const previousOdometer = validPositive(previous.odometer);
      const currentOdometer = validPositive(fill.odometer);
      const odometerDistance = previousOdometer && currentOdometer ? currentOdometer - previousOdometer : 0;
      const tripDistance = slice.reduce((sum, item) => sum + validPositive(item.tripDistance), 0);
      const kilometres = odometerDistance > 0 ? odometerDistance : tripDistance;
      const litres = slice.reduce((sum, item) => sum + validPositive(item.litres), 0);

      if (kilometres > 0 && litres > 0) {
        intervals.push({
          startId: previous.id,
          endId: fill.id,
          dateStart: previous.date || "",
          dateEnd: fill.date || "",
          kilometres,
          litres,
          consumption: litres / kilometres * 100,
          drivingType: fill.drivingType || "other",
          partialFills: Math.max(0, slice.length - 1),
        });
      }
    }
    previousFullIndex = index;
  });

  if (!intervals.length) {
    return {
      intervals,
      latest: null,
      overall: null,
      latestThree: null,
      byDrivingType: {},
      minimum: null,
      maximum: null,
      dateRange: null,
      message: "Record another full-tank fill-up after driving normally. The calculator needs two full-tank records to calculate consumption.",
    };
  }

  const byDrivingType = {};
  ["city", "motorway", "mixed", "other"].forEach((type) => {
    const matching = intervals.filter((item) => item.drivingType === type);
    if (matching.length) byDrivingType[type] = weightedConsumption(matching);
  });
  const values = intervals.map((item) => item.consumption);

  return {
    intervals,
    latest: intervals.at(-1).consumption,
    overall: weightedConsumption(intervals),
    latestThree: weightedConsumption(intervals.slice(-3)),
    byDrivingType,
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    dateRange: { start: intervals[0].dateStart, end: intervals.at(-1).dateEnd },
    message: "",
  };
}

export function formatCurrency(value, currency = "EUR", locale = globalThis.navigator?.language || "en-IE") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number);
  } catch {
    return `${currency} ${number.toFixed(2)}`;
  }
}

export function formatNumber(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString(undefined, { maximumFractionDigits: digits }) : "—";
}

export function formatDuration(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  if (!value) return "Not provided";
  const hours = Math.floor(value / 3600);
  const minutes = Math.round((value % 3600) / 60);
  return [hours ? `${hours} h` : "", minutes ? `${minutes} min` : ""].filter(Boolean).join(" ");
}

export function makeId(prefix = "item") {
  return `${prefix}-${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
}

export function buildJourneySummary(journey, result) {
  const lines = [
    "Vehicle Cost Calculator",
    "",
    `Journey: ${journey.name || [journey.origin, journey.destination].filter(Boolean).join(" to ") || "Untitled journey"}`,
    `Journey type: ${result.tripMultiplier === 2 ? "Return" : result.tripMultiplier === 1 ? "One-way" : `Multiplier ${result.tripMultiplier}`}`,
    `Distance: ${formatNumber(result.totalDistance, 2)} km`,
    `Duration: ${formatDuration(result.durationSeconds)}`,
    `Vehicle: ${journey.vehicleName || "Custom vehicle"}`,
    `Consumption used: ${result.energyType === "electric" ? `${formatNumber(result.electricConsumption)} kWh/100 km` : `${formatNumber(result.fuelConsumption)} L/100 km`}`,
    `Consumption source: ${journey.consumptionSourceLabel || "Manual consumption"}`,
    "",
  ];
  if (result.fuelQuantity) lines.push(`Fuel required: ${formatNumber(result.fuelQuantity)} L`, `Fuel cost: ${formatCurrency(result.fuelCost, result.currency)}`);
  if (result.electricQuantity) lines.push(`Electricity required: ${formatNumber(result.electricQuantity)} kWh`, `Electricity cost: ${formatCurrency(result.electricityCost, result.currency)}`);
  lines.push(
    `Tolls: ${formatCurrency(result.totalTolls, result.currency)}`,
    `Ferry: ${formatCurrency(result.ferryCost, result.currency)}`,
    `Parking: ${formatCurrency(result.parkingCost, result.currency)}`,
    `Maintenance: ${formatCurrency(result.maintenanceCost, result.currency)}`,
  );
  result.customCosts.forEach((item) => lines.push(`${item.name}: ${formatCurrency(item.amount, result.currency)}`));
  lines.push("", `Total: ${formatCurrency(result.totalCost, result.currency)}`, `Passengers: ${result.passengerCount}`, `Per passenger: ${formatCurrency(result.costPerPassenger, result.currency)}`);
  return lines.join("\n");
}
