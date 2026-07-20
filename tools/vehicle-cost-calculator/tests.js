import { ValidationError, calculateFillUpConsumption, calculateJourney, formatCurrency } from "./calculations.js";
import { CalculatorStorage } from "./storage.js";

const results = [];
const base = { oneWayDistance: 100, tripMultiplier: 1, passengerCount: 1, energyType: "petrol", fuelConsumption: 6, fuelPrice: 2, currency: "EUR" };

function assert(condition, message = "Assertion failed") { if (!condition) throw new Error(message); }
function close(actual, expected, tolerance = 1e-9) { assert(Math.abs(actual - expected) <= tolerance, `Expected ${expected}, received ${actual}`); }
async function test(name, callback) {
  try { await callback(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.message }); }
}

await test("Petrol calculation", () => { const result = calculateJourney(base); close(result.fuelQuantity, 6); close(result.fuelCost, 12); });
await test("Diesel calculation", () => { const result = calculateJourney({ ...base, energyType: "diesel", fuelConsumption: 5, fuelPrice: 1.8 }); close(result.fuelCost, 9); });
await test("LPG calculation", () => { const result = calculateJourney({ ...base, energyType: "lpg", fuelConsumption: 8, fuelPrice: 1 }); close(result.fuelCost, 8); });
await test("Hybrid fuel calculation", () => { const result = calculateJourney({ ...base, energyType: "hybrid", fuelConsumption: 4.5 }); close(result.fuelQuantity, 4.5); });
await test("Plug-in hybrid combines fuel and electricity", () => { const result = calculateJourney({ ...base, energyType: "plug-in-hybrid", fuelConsumption: 2, electricConsumption: 12, fuelPrice: 2, electricityPrice: .25 }); close(result.energyCost, 7); });
await test("Electric calculation", () => { const result = calculateJourney({ ...base, energyType: "electric", electricConsumption: 18, electricityPrice: .25 }); close(result.electricQuantity, 18); close(result.electricityCost, 4.5); });
await test("One-way journey", () => close(calculateJourney(base).totalDistance, 100));
await test("Return journey", () => close(calculateJourney({ ...base, tripMultiplier: 2 }).totalDistance, 200));
await test("Separate outbound and return tolls", () => { const result = calculateJourney({ ...base, outboundToll: 10, returnToll: 12 }); close(result.totalTolls, 22); });
await test("Custom multiplier", () => close(calculateJourney({ ...base, tripMultiplier: 1.5 }).totalDistance, 150));
await test("Additional kilometres", () => close(calculateJourney({ ...base, additionalKilometres: 25 }).totalDistance, 125));
await test("Parking and ferry", () => close(calculateJourney({ ...base, parkingCost: 8, ferryCost: 12 }).totalCost, 32));
await test("Maintenance cost", () => close(calculateJourney({ ...base, maintenanceRate: .1 }).maintenanceCost, 10));
await test("Multiple custom costs", () => close(calculateJourney({ ...base, customCosts: [{ name: "Fee", amount: 3 }, { name: "Permit", amount: 4 }] }).customCostTotal, 7));
await test("Passenger splitting", () => close(calculateJourney({ ...base, passengerCount: 4 }).costPerPassenger, 3));
await test("Currency display rounds to two decimals", () => assert(/12[,.]35/.test(formatCurrency(12.345, "EUR", "en-IE"))));
await test("Decimal comma input", () => close(calculateJourney({ ...base, fuelConsumption: "6,5" }).fuelQuantity, 6.5));
await test("Invalid numeric input rejected", () => { let threw = false; try { calculateJourney({ ...base, fuelPrice: "abc" }); } catch (error) { threw = error instanceof ValidationError; } assert(threw); });
await test("Negative values rejected", () => { let threw = false; try { calculateJourney({ ...base, parkingCost: -1 }); } catch { threw = true; } assert(threw); });
await test("Negative tolls rejected", () => { let threw = false; try { calculateJourney({ ...base, outboundToll: -1 }); } catch { threw = true; } assert(threw); });
await test("Zero passengers prevented", () => { let threw = false; try { calculateJourney({ ...base, passengerCount: 0 }); } catch { threw = true; } assert(threw); });
await test("NaN and Infinity prevented", () => { let threw = false; try { calculateJourney({ ...base, fuelPrice: Infinity }); } catch { threw = true; } assert(threw); });

const fullTankRecords = [
  { id: "f1", date: "2026-01-01", odometer: 1000, litres: 40, fullTank: true, drivingType: "mixed" },
  { id: "f2", date: "2026-01-10", odometer: 1300, litres: 10, fullTank: false, drivingType: "city" },
  { id: "f3", date: "2026-01-20", odometer: 1600, litres: 30, fullTank: true, drivingType: "mixed" },
  { id: "f4", date: "2026-02-01", odometer: 2200, litres: 36, fullTank: true, drivingType: "motorway" },
  { id: "f5", date: "2026-02-15", odometer: 2800, litres: 42, fullTank: true, drivingType: "city" },
  { id: "f6", date: "2026-03-01", odometer: 3400, litres: 39, fullTank: true, drivingType: "mixed" },
];

await test("Full-tank consumption", () => { const stats = calculateFillUpConsumption(fullTankRecords.slice(0, 3)); close(stats.latest, 40 / 600 * 100); });
await test("Partial fills included between full fills", () => { const stats = calculateFillUpConsumption(fullTankRecords.slice(0, 3)); close(stats.intervals[0].litres, 40); assert(stats.intervals[0].partialFills === 1); });
await test("Partial fill alone is not a valid interval", () => assert(calculateFillUpConsumption(fullTankRecords.slice(0, 2)).intervals.length === 0));
await test("Invalid fill-up interval ignored", () => assert(calculateFillUpConsumption([{ id: "a", fullTank: true, odometer: 1000, litres: 30 }, { id: "b", fullTank: true, odometer: 1000, litres: 30 }]).intervals.length === 0));
await test("Weighted average consumption", () => { const stats = calculateFillUpConsumption(fullTankRecords); close(stats.overall, (40 + 36 + 42 + 39) / (600 * 4) * 100); });
await test("Latest-three weighted consumption", () => { const stats = calculateFillUpConsumption(fullTankRecords); close(stats.latestThree, (36 + 42 + 39) / 1800 * 100); });
await test("Driving-type average", () => assert(calculateFillUpConsumption(fullTankRecords).byDrivingType.city > 0));

const testDatabase = `vcc-tests-${Date.now()}`;
const testStorage = new CalculatorStorage(testDatabase, `${testDatabase}:`);
await test("Saving vehicle profiles", async () => { await testStorage.put("vehicles", { id: "vehicle-1", name: "Test car" }); assert((await testStorage.getAll("vehicles")).length === 1); });
await test("Editing vehicle profiles", async () => { await testStorage.put("vehicles", { id: "vehicle-1", name: "Edited car" }); assert((await testStorage.get("vehicles", "vehicle-1")).name === "Edited car"); });
await test("Deleting vehicle profiles", async () => { await testStorage.remove("vehicles", "vehicle-1"); assert((await testStorage.getAll("vehicles")).length === 0); });
await test("Saving journeys", async () => { await testStorage.put("journeys", { id: "journey-1", total: 50 }); assert((await testStorage.get("journeys", "journey-1")).total === 50); });
await test("Loading journeys", async () => assert((await testStorage.getAll("journeys")).some((item) => item.id === "journey-1")));
await test("Exporting JSON backup", async () => { const backup = await testStorage.exportAll(); assert(backup.application === "Vehicle Cost Calculator" && backup.data.journeys.length === 1); });
await test("Importing JSON backup", async () => { const backup = await testStorage.exportAll(); backup.data.vehicles.push({ id: "vehicle-imported", name: "Imported" }); await testStorage.importAll(backup, "merge"); assert(Boolean(await testStorage.get("vehicles", "vehicle-imported"))); });
await test("Rejecting malformed backup", () => { let threw = false; try { testStorage.validateBackup({ application: "Wrong", version: 1, data: {} }); } catch { threw = true; } assert(threw); });

const migrationDatabase = `vcc-migration-${Date.now()}`;
await new Promise((resolve, reject) => {
  const request = indexedDB.open(migrationDatabase, 1);
  request.onupgradeneeded = () => {
    ["vehicles", "fillups", "journeys", "routeCache", "fuelPrices"].forEach((name) => request.result.createObjectStore(name, { keyPath: "id" }));
  };
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const database = request.result;
    const transaction = database.transaction(["vehicles", "journeys", "routeCache"], "readwrite");
    transaction.objectStore("vehicles").put({ id: "old-vehicle", name: "Existing car", tollCategory: "passenger-car", axleCount: 2 });
    transaction.objectStore("journeys").put({ id: "old-journey", name: "Existing journey", provider: "Old service", routeSelection: { id: "route" }, input: { oneWayDistance: 10, tollSource: "Old service" } });
    transaction.objectStore("routeCache").put({ id: "old-route", value: 1 });
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error);
  };
});
const migrationStorage = new CalculatorStorage(migrationDatabase, `${migrationDatabase}:`);
await test("Online-route data is removed without losing saved records", async () => {
  const database = await migrationStorage.open();
  assert(!database.objectStoreNames.contains("routeCache"));
  const vehicle = await migrationStorage.get("vehicles", "old-vehicle");
  const journey = await migrationStorage.get("journeys", "old-journey");
  assert(vehicle.name === "Existing car" && !("tollCategory" in vehicle) && journey.name === "Existing journey" && !("provider" in journey) && !("tollSource" in journey.input));
});
await test("Relative calculator path works under /EstrelaLua/", () => { const target = new URL("../../apps/vehicle-cost-calculator.html", "https://gamrgamr.github.io/EstrelaLua/tools/vehicle-cost-calculator/index.html"); assert(target.pathname === "/EstrelaLua/apps/vehicle-cost-calculator.html"); });

await testStorage.deleteAll().catch(() => {});
await migrationStorage.deleteAll().catch(() => {});

const passed = results.filter((result) => result.pass).length;
const failed = results.length - passed;
document.querySelector("#test-total").textContent = `${results.length} tests`;
document.querySelector("#test-passed").textContent = `${passed} passed`;
document.querySelector("#test-failed").textContent = `${failed} failed`;
document.querySelector("#test-results").innerHTML = results.map((result) => `<li class="${result.pass ? "pass" : "fail"}"><strong>${result.pass ? "PASS" : "FAIL"}</strong> ${result.name}${result.error ? `<small>${result.error}</small>` : ""}</li>`).join("");
document.documentElement.dataset.tests = failed ? "failed" : "passed";
