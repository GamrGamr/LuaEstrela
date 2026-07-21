import { ValidationError, calculateHomeEnergy, formatCurrency, parseNumber, sanitiseDecimalInput, sanitiseIntegerInput } from "./calculations.js?v=7";

const results = [];
const assert = (condition, message = "Assertion failed") => { if (!condition) throw new Error(message); };
const closeTo = (actual, expected, tolerance = 0.0001) => assert(Math.abs(actual - expected) <= tolerance, `${actual} is not close to ${expected}`);
async function test(name, run) {
  try { await run(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.message }); }
}

const base = { pricePerKwh: "0.25", fixedMonthlyCost: "0", appliances: [{ name: "TV", watts: "100", quantity: "1", hoursPerDay: "4", daysPerMonth: "30" }] };

await test("Single appliance monthly kWh", () => closeTo(calculateHomeEnergy(base).monthlyKwh, 12));
await test("Single appliance monthly cost", () => closeTo(calculateHomeEnergy(base).monthlyCost, 3));
await test("Quantity is included", () => closeTo(calculateHomeEnergy({ ...base, appliances: [{ ...base.appliances[0], quantity: "2" }] }).monthlyKwh, 24));
await test("Multiple appliances are totalled", () => closeTo(calculateHomeEnergy({ ...base, appliances: [...base.appliances, { name: "Lamp", watts: "10", quantity: "2", hoursPerDay: "5", daysPerMonth: "30" }] }).monthlyKwh, 15));
await test("Fixed monthly charge is included", () => closeTo(calculateHomeEnergy({ ...base, fixedMonthlyCost: "7" }).monthlyCost, 10));
await test("Energy IVA is included", () => closeTo(calculateHomeEnergy({ ...base, energyIvaRate: "23" }).monthlyCost, 3.69));
await test("Energy IVA amount is reported separately", () => closeTo(calculateHomeEnergy({ ...base, energyIvaRate: "23" }).monthlyEnergyIva, 0.69));
await test("Contracted power daily price is included", () => closeTo(calculateHomeEnergy({ ...base, contractedPowerPricePerDay: "0.30", billingDays: "30" }).monthlyCost, 12));
await test("Contracted power IVA is included", () => closeTo(calculateHomeEnergy({ ...base, contractedPowerPricePerDay: "0.30", contractedPowerIvaRate: "6", billingDays: "30" }).monthlyCost, 12.54));
await test("Contracted power IVA amount is reported separately", () => closeTo(calculateHomeEnergy({ ...base, contractedPowerPricePerDay: "0.30", contractedPowerIvaRate: "6", billingDays: "30" }).monthlyPowerIva, 0.54));
await test("Contracted power charge uses billing days", () => closeTo(calculateHomeEnergy({ ...base, contractedPowerPricePerDay: "0.30", billingDays: "31" }).monthlyPowerCost, 9.3));
await test("Daily averages use billing days", () => closeTo(calculateHomeEnergy({ ...base, contractedPowerPricePerDay: "0.30", billingDays: "30" }).dailyCost, 0.4));
await test("Annual contracted power uses 365 days", () => closeTo(calculateHomeEnergy({ ...base, contractedPowerPricePerDay: "0.30", billingDays: "30" }).annualCost, 145.5));
await test("Annual contracted power includes IVA", () => closeTo(calculateHomeEnergy({ ...base, contractedPowerPricePerDay: "0.30", contractedPowerIvaRate: "6", billingDays: "30" }).annualPowerCost, 116.07));
await test("IVA over 100 percent is rejected", () => { try { calculateHomeEnergy({ ...base, energyIvaRate: "101" }); } catch (error) { assert(error instanceof ValidationError); return; } throw new Error("Expected validation error"); });
await test("Zero billing days is rejected", () => { try { calculateHomeEnergy({ ...base, billingDays: "0" }); } catch (error) { assert(error instanceof ValidationError); return; } throw new Error("Expected validation error"); });
await test("Annual result is twelve months", () => closeTo(calculateHomeEnergy(base).annualCost, 36));
await test("Decimal comma is accepted", () => closeTo(calculateHomeEnergy({ ...base, pricePerKwh: "0,25" }).monthlyCost, 3));
await test("Measured monthly kWh is accepted directly", () => closeTo(calculateHomeEnergy({ ...base, appliances: [{ name: "Computer", monthlyKwh: "18" }] }).monthlyKwh, 18));
await test("Measured monthly kWh calculates cost", () => closeTo(calculateHomeEnergy({ ...base, appliances: [{ name: "Computer", monthlyKwh: "18" }] }).monthlyCost, 4.5));
await test("Measured kWh does not require watts or hours", () => closeTo(calculateHomeEnergy({ ...base, appliances: [{ name: "Computer", monthlyKwh: "18", watts: "", hoursPerDay: "" }] }).annualKwh, 216));
await test("Measured kWh works when power and hours are zero", () => closeTo(calculateHomeEnergy({ ...base, appliances: [{ name: "Monitor", monthlyKwh: "9.5", watts: "0", hoursPerDay: "0" }] }).monthlyKwh, 9.5));
await test("Measured kWh overrides power and time", () => closeTo(calculateHomeEnergy({ ...base, appliances: [{ ...base.appliances[0], monthlyKwh: "18" }] }).monthlyKwh, 18));
await test("Empty measured kWh falls back to estimation", () => closeTo(calculateHomeEnergy({ ...base, appliances: [{ ...base.appliances[0], monthlyKwh: "" }] }).monthlyKwh, 12));
await test("Estimated and measured usage can be combined", () => closeTo(calculateHomeEnergy({ ...base, appliances: [...base.appliances, { name: "Computer", monthlyKwh: "18" }] }).monthlyKwh, 30));
await test("Highest consumer is listed first", () => assert(calculateHomeEnergy({ ...base, appliances: [{ ...base.appliances[0], name: "Small" }, { name: "Large", watts: "1000", quantity: "1", hoursPerDay: "2", daysPerMonth: "30" }] }).items[0].name === "Large"));
await test("Letters are removed from decimal input", () => assert(sanitiseDecimalInput("abc12,5xyz") === "12,5"));
await test("Only one decimal separator is kept", () => assert(sanitiseDecimalInput("1.2,3") === "1.23"));
await test("Integer input removes non-digits", () => assert(sanitiseIntegerInput("12 days") === "12"));
await test("Missing appliances are rejected", () => { try { calculateHomeEnergy({ pricePerKwh: "0.25", appliances: [] }); } catch (error) { assert(error instanceof ValidationError); return; } throw new Error("Expected validation error"); });
await test("More than 24 hours is rejected", () => { try { calculateHomeEnergy({ ...base, appliances: [{ ...base.appliances[0], hoursPerDay: "25" }] }); } catch (error) { assert(error instanceof ValidationError); return; } throw new Error("Expected validation error"); });
await test("More than 31 days is rejected", () => { try { calculateHomeEnergy({ ...base, appliances: [{ ...base.appliances[0], daysPerMonth: "32" }] }); } catch (error) { assert(error instanceof ValidationError); return; } throw new Error("Expected validation error"); });
await test("Zero power produces zero usage", () => closeTo(calculateHomeEnergy({ ...base, appliances: [{ ...base.appliances[0], watts: "0" }] }).monthlyKwh, 0));
await test("Zero power produces zero cost", () => closeTo(calculateHomeEnergy({ ...base, appliances: [{ ...base.appliances[0], watts: "0" }] }).monthlyCost, 0));
await test("Zero hours produces zero usage", () => closeTo(calculateHomeEnergy({ ...base, appliances: [{ ...base.appliances[0], hoursPerDay: "0" }] }).monthlyKwh, 0));
await test("Zero measured monthly kWh is rejected", () => { try { calculateHomeEnergy({ ...base, appliances: [{ name: "Computer", monthlyKwh: "0" }] }); } catch (error) { assert(error instanceof ValidationError); return; } throw new Error("Expected validation error"); });
await test("Non-numeric input is rejected", () => { try { parseNumber("hello", { field: "Value" }); } catch (error) { assert(error instanceof ValidationError); return; } throw new Error("Expected validation error"); });
await test("Currency is formatted in euros", () => assert(formatCurrency(12.5).includes("12.50")));

const passed = results.filter((result) => result.passed).length;
document.querySelector("#test-count").textContent = `${results.length} tests`;
document.querySelector("#passed-count").textContent = `${passed} passed`;
document.querySelector("#failed-count").textContent = `${results.length - passed} failed`;
document.querySelector("#test-results").innerHTML = results.map((result) => `<li class="${result.passed ? "pass" : "fail"}"><strong>${result.passed ? "PASS" : "FAIL"}</strong> ${result.name}${result.error ? `<small>${result.error}</small>` : ""}</li>`).join("");
