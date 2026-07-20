import {
  ValidationError,
  buildJourneySummary,
  calculateFillUpConsumption,
  calculateJourney,
  formatCurrency,
  formatDuration,
  formatDurationInput,
  formatNumber,
  makeId,
  parseDuration,
  parseNumber,
  sanitiseDecimalInput,
  sanitiseIntegerInput,
} from "./calculations.js?v=9";
import { CalculatorStorage, StorageError } from "./storage.js?v=6";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const storage = new CalculatorStorage();
const state = {
  vehicles: [],
  fillups: [],
  journeys: [],
  currentResult: null,
  currentInput: null,
  currentJourneyId: null,
  pendingBackup: null,
  storageAvailable: true,
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function message(element, text = "", type = "") {
  element.textContent = text;
  element.className = `inline-message${type ? ` ${type}` : ""}`;
}

function clearFieldError(element) {
  if (!element) return;
  element.removeAttribute("aria-invalid");
  const errorId = `${element.id}-error`;
  element.closest(".field")?.querySelector(`#${CSS.escape(errorId)}`)?.remove();
  const describedBy = (element.getAttribute("aria-describedby") || "").split(/\s+/).filter((id) => id && id !== errorId);
  if (describedBy.length) element.setAttribute("aria-describedby", describedBy.join(" "));
  else element.removeAttribute("aria-describedby");
}

function clearValidation(scope) {
  $$('[aria-invalid="true"]', scope).forEach(clearFieldError);
  $$(".field-error", scope).forEach((element) => element.remove());
}

function nativeValidationError(form) {
  const element = [...form.elements].find((control) => control.willValidate && !control.validity.valid && !control.closest("[hidden]"));
  if (!element) return null;
  const label = form.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.childNodes[0]?.textContent?.trim() || "This field";
  let text = `${label} contains an invalid value.`;
  if (element.validity.valueMissing) text = `${label} is required.`;
  else if (element.validity.tooLong) text = `${label} is too long.`;
  else if (element.validity.rangeUnderflow) text = `${label} must be at least ${element.min}.`;
  else if (element.validity.rangeOverflow) text = `${label} cannot be greater than ${element.max}.`;
  else if (element.validity.stepMismatch) text = `${label} must be a whole number.`;
  else if (element.validity.patternMismatch) text = `${label} must use the requested format.`;
  return new ValidationError(text, label, element.id);
}

function showValidationError(error, { form, status, summary } = {}) {
  const text = error instanceof ValidationError ? error.message : "Check the values and try again.";
  if (status) message(status, text, "error");
  if (summary) {
    summary.textContent = text;
    summary.hidden = false;
  }
  const element = error instanceof ValidationError && error.fieldId ? document.getElementById(error.fieldId) : null;
  if (!element || (form && !form.contains(element))) return;
  clearFieldError(element);
  element.setAttribute("aria-invalid", "true");
  const errorMessage = document.createElement("p");
  errorMessage.id = `${element.id}-error`;
  errorMessage.className = "field-error";
  errorMessage.textContent = text;
  element.closest(".field")?.append(errorMessage);
  const describedBy = new Set((element.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
  describedBy.add(errorMessage.id);
  element.setAttribute("aria-describedby", [...describedBy].join(" "));
  const details = element.closest("details");
  if (details) details.open = true;
  element.focus({ preventScroll: true });
  element.scrollIntoView({ behavior: "smooth", block: "center" });
}

function requireNativeValidity(form) {
  const error = nativeValidationError(form);
  if (error) throw error;
}

function safeValue(id, value = "") {
  const element = $(`#${id}`);
  if (element) element.value = value ?? "";
}

function value(id) {
  return $(`#${id}`)?.value ?? "";
}

function checked(id) {
  return Boolean($(`#${id}`)?.checked);
}

function downloadFile(filename, content, type = "application/octet-stream") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows, columns) {
  const header = columns.map(([label]) => csvCell(label)).join(",");
  return `\uFEFF${[header, ...rows.map((row) => columns.map(([, key]) => csvCell(typeof key === "function" ? key(row) : row[key])).join(","))].join("\r\n")}`;
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

function activeVehicle() {
  return state.vehicles.find((vehicle) => vehicle.id === value("vehicle-select")) || null;
}

function updateCurrencyLabels() {
  const currency = value("currency").trim().toUpperCase() || "EUR";
  $$(".currency-unit").forEach((element) => { element.textContent = currency; });
  $("#fuel-price-unit").textContent = `${currency}/L`;
  $("#electricity-price-unit").textContent = `${currency}/kWh`;
  $("#maintenance-unit").textContent = `${currency}/km`;
}

function applyTheme(theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.body.dataset.theme = dark ? "dark" : "light";
}

async function reloadData() {
  if (!state.storageAvailable) return;
  [state.vehicles, state.fillups, state.journeys] = await Promise.all([
    storage.getAll("vehicles"), storage.getAll("fillups"), storage.getAll("journeys"),
  ]);
  state.vehicles.sort((a, b) => Number(a.archived) - Number(b.archived) || String(a.name).localeCompare(String(b.name)));
  state.fillups.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  state.journeys.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  renderVehicleSelectors();
  renderVehicleList();
  renderFillups();
  renderJourneys();
}

function renderVehicleSelectors() {
  const selected = value("vehicle-select");
  const fillSelected = value("fillup-vehicle");
  const active = state.vehicles.filter((vehicle) => !vehicle.archived);
  $("#vehicle-select").innerHTML = `<option value="">Custom vehicle</option>${active.map((vehicle) => `<option value="${escapeHtml(vehicle.id)}">${escapeHtml(vehicle.name)}</option>`).join("")}`;
  $("#fillup-vehicle").innerHTML = `<option value="">Choose a saved vehicle</option>${active.map((vehicle) => `<option value="${escapeHtml(vehicle.id)}">${escapeHtml(vehicle.name)}</option>`).join("")}`;
  if (active.some((vehicle) => vehicle.id === selected)) $("#vehicle-select").value = selected;
  if (active.some((vehicle) => vehicle.id === fillSelected)) $("#fillup-vehicle").value = fillSelected;
}

function renderVehicleList() {
  const container = $("#vehicle-list");
  if (!state.vehicles.length) {
    container.className = "card-list empty-state";
    container.textContent = "No vehicles saved yet.";
    return;
  }
  container.className = "card-list";
  container.innerHTML = state.vehicles.map((vehicle) => `
    <article class="item-card${vehicle.archived ? " archived" : ""}">
      <h3>${escapeHtml(vehicle.name)}</h3>
      <p>${escapeHtml([vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ") || "Vehicle profile")}</p>
      <p>${escapeHtml(vehicle.energyType)} &middot; ${formatNumber(vehicle.manualConsumption || vehicle.manualElectricConsumption || 0)} ${vehicle.energyType === "electric" ? "kWh/100 km" : "L/100 km"}${vehicle.archived ? " · Archived" : ""}</p>
      <div class="item-actions">
        <button type="button" data-vehicle-action="use" data-id="${escapeHtml(vehicle.id)}">Use</button>
        <button type="button" data-vehicle-action="edit" data-id="${escapeHtml(vehicle.id)}">Edit</button>
        <button type="button" data-vehicle-action="duplicate" data-id="${escapeHtml(vehicle.id)}">Duplicate</button>
        <button type="button" data-vehicle-action="archive" data-id="${escapeHtml(vehicle.id)}">${vehicle.archived ? "Restore" : "Archive"}</button>
        <button type="button" data-vehicle-action="delete" data-id="${escapeHtml(vehicle.id)}">Delete</button>
      </div>
    </article>`).join("");
}

function vehicleConsumptionStats(vehicleId) {
  return calculateFillUpConsumption(state.fillups.filter((fill) => fill.vehicleId === vehicleId));
}

function measuredValue(source, stats) {
  const values = {
    latest: stats.latest,
    "latest-three": stats.latestThree,
    overall: stats.overall,
    city: stats.byDrivingType.city,
    motorway: stats.byDrivingType.motorway,
    mixed: stats.byDrivingType.mixed,
  };
  return values[source] ?? null;
}

function applyConsumptionSource() {
  const source = value("consumption-source");
  const vehicle = activeVehicle();
  if (source === "manual") {
    if (vehicle) {
      safeValue("fuel-consumption", vehicle.manualConsumption || "");
      safeValue("electric-consumption", vehicle.manualElectricConsumption || "");
    }
    message($("#consumption-feedback"), "Manual value selected. You can edit it for this journey.");
    return;
  }
  if (!vehicle) {
    message($("#consumption-feedback"), "Choose a saved fuel-powered vehicle before using measured consumption.", "warning");
    return;
  }
  const stats = vehicleConsumptionStats(vehicle.id);
  const measured = measuredValue(source, stats);
  if (!(measured > 0)) {
    message($("#consumption-feedback"), stats.message || `No valid ${source.replace("-", " ")} consumption is available.`, "warning");
    return;
  }
  safeValue("fuel-consumption", measured.toFixed(3));
  message($("#consumption-feedback"), `${source.replace("-", " ")} measured consumption: ${formatNumber(measured, 3)} L/100 km from ${stats.intervals.length} valid interval${stats.intervals.length === 1 ? "" : "s"}.`, "success");
}

function updateEnergyFields() {
  const energy = value("energy-type");
  const showFuel = energy !== "electric";
  const showElectric = energy === "electric" || energy === "plug-in-hybrid";
  $$(".fuel-field").forEach((field) => { field.hidden = !showFuel; });
  $$(".electric-field").forEach((field) => { field.hidden = !showElectric; });
  const fuelRequired = showFuel && energy !== "plug-in-hybrid";
  const electricRequired = energy === "electric";
  [$("#fuel-consumption"), $("#fuel-price")].forEach((element) => {
    element.required = fuelRequired;
    element.setAttribute("aria-required", String(fuelRequired));
  });
  [$("#electric-consumption"), $("#electricity-price")].forEach((element) => {
    element.required = electricRequired;
    element.setAttribute("aria-required", String(electricRequired));
  });
  if (energy === "electric" && value("consumption-source") !== "manual") {
    $("#consumption-source").value = "manual";
    message($("#consumption-feedback"), "Fill-up measurement applies to liquid fuel. Enter electric consumption manually.");
  }
  loadRecentPrice();
}

async function loadRecentPrice() {
  if (!state.storageAvailable) return;
  const energy = value("energy-type");
  const currency = value("currency").toUpperCase() || "EUR";
  const record = await storage.get("fuelPrices", `price-${energy}-${currency}`).catch(() => null);
  if (!record?.value) return;
  if (energy === "electric") {
    if (!value("electricity-price")) safeValue("electricity-price", record.value);
  } else if (!value("fuel-price")) safeValue("fuel-price", record.value);
}

function useVehicle(vehicle) {
  $("#vehicle-select").value = vehicle?.id || "";
  safeValue("vehicle-name", vehicle?.name || "");
  safeValue("energy-type", vehicle?.energyType || "petrol");
  safeValue("consumption-source", vehicle?.preferredConsumptionSource || "manual");
  safeValue("fuel-consumption", vehicle?.manualConsumption || "");
  safeValue("electric-consumption", vehicle?.manualElectricConsumption || "");
  safeValue("maintenance-rate", vehicle?.maintenanceRate || 0);
  safeValue("passenger-count", vehicle?.defaultPassengerCount || 1);
  updateEnergyFields();
  applyConsumptionSource();
  $("#vehicle-section").open = true;
}

function profileFromForm(existing = null) {
  const name = value("profile-name").trim();
  if (!name) throw new ValidationError("Vehicle name is required.", "Vehicle name", "profile-name");
  const energyType = value("profile-energy");
  return {
    id: value("profile-id") || makeId("vehicle"),
    name,
    make: value("profile-make").trim(),
    model: value("profile-model").trim(),
    year: value("profile-year") ? parseNumber(value("profile-year"), { field: "Year", fieldId: "profile-year", min: 1900, max: 2100, integer: true }) : "",
    engineDescription: value("profile-engine").trim(),
    registration: value("profile-registration").trim(),
    energyType,
    manualConsumption: parseNumber(value("profile-consumption"), { field: "Manual fuel consumption", fieldId: "profile-consumption", max: 10_000 }),
    manualElectricConsumption: parseNumber(value("profile-electric-consumption"), { field: "Manual electric consumption", fieldId: "profile-electric-consumption", max: 10_000 }),
    preferredConsumptionSource: value("profile-preferred-source"),
    maintenanceRate: parseNumber(value("profile-maintenance"), { field: "Maintenance cost per kilometre", fieldId: "profile-maintenance", max: 1_000_000 }),
    defaultPassengerCount: parseNumber(value("profile-passengers") || 1, { field: "Default passengers", fieldId: "profile-passengers", min: 1, max: 100_000, required: true, integer: true }),
    notes: value("profile-notes").trim(),
    archived: checked("profile-archived"),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function openVehicleDialog(vehicle = null, duplicate = false) {
  const copy = vehicle ? structuredClone(vehicle) : null;
  $("#vehicle-dialog-title").textContent = copy ? duplicate ? "Duplicate vehicle" : "Edit vehicle" : "Add vehicle";
  safeValue("profile-id", copy && !duplicate ? copy.id : "");
  safeValue("profile-name", copy ? `${copy.name}${duplicate ? " copy" : ""}` : "");
  safeValue("profile-make", copy?.make || "");
  safeValue("profile-model", copy?.model || "");
  safeValue("profile-year", copy?.year || "");
  safeValue("profile-engine", copy?.engineDescription || "");
  safeValue("profile-registration", copy?.registration || "");
  safeValue("profile-energy", copy?.energyType || "petrol");
  safeValue("profile-consumption", copy?.manualConsumption || "");
  safeValue("profile-electric-consumption", copy?.manualElectricConsumption || "");
  safeValue("profile-preferred-source", copy?.preferredConsumptionSource || "manual");
  safeValue("profile-maintenance", copy?.maintenanceRate || "");
  safeValue("profile-passengers", copy?.defaultPassengerCount || 1);
  safeValue("profile-notes", copy?.notes || "");
  $("#profile-archived").checked = copy?.archived || false;
  message($("#vehicle-form-status"));
  $("#vehicle-dialog").showModal();
  $("#profile-name").focus();
}

async function saveVehicle(event) {
  event.preventDefault();
  clearValidation(event.currentTarget);
  message($("#vehicle-form-status"));
  try {
    requireNativeValidity(event.currentTarget);
    const existing = state.vehicles.find((vehicle) => vehicle.id === value("profile-id"));
    const profile = profileFromForm(existing);
    await storage.put("vehicles", profile);
    $("#vehicle-dialog").close();
    await reloadData();
    useVehicle(profile);
    message($("#action-status"), `Saved ${profile.name}.`, "success");
  } catch (error) {
    showValidationError(error, { form: event.currentTarget, status: $("#vehicle-form-status") });
  }
}

async function handleVehicleAction(event) {
  const button = event.target.closest("[data-vehicle-action]");
  if (!button) return;
  const vehicle = state.vehicles.find((item) => item.id === button.dataset.id);
  if (!vehicle) return;
  const action = button.dataset.vehicleAction;
  if (action === "use") {
    useVehicle(vehicle);
    $("#vehicle-section").scrollIntoView({ behavior: "smooth" });
  } else if (action === "edit") openVehicleDialog(vehicle);
  else if (action === "duplicate") openVehicleDialog(vehicle, true);
  else if (action === "archive") {
    await storage.put("vehicles", { ...vehicle, archived: !vehicle.archived, updatedAt: new Date().toISOString() });
    await reloadData();
  } else if (action === "delete") {
    const relatedFills = state.fillups.filter((fill) => fill.vehicleId === vehicle.id);
    const relatedJourneys = state.journeys.filter((journey) => journey.vehicleId === vehicle.id);
    const explanation = `Delete “${vehicle.name}”? ${relatedFills.length} fill-up record(s) will also be removed. ${relatedJourneys.length} saved journey snapshot(s) will remain unchanged.`;
    if (!confirm(explanation)) return;
    await Promise.all(relatedFills.map((fill) => storage.remove("fillups", fill.id)));
    await storage.remove("vehicles", vehicle.id);
    await reloadData();
  }
}

function renderFillups() {
  const table = $("#fillup-table");
  if (!state.fillups.length) {
    table.innerHTML = '<tr><td colspan="7">No fill-ups saved.</td></tr>';
  } else {
    const names = Object.fromEntries(state.vehicles.map((vehicle) => [vehicle.id, vehicle.name]));
    table.innerHTML = state.fillups.map((fill) => `<tr>
      <td>${escapeHtml(fill.date)}</td><td>${escapeHtml(names[fill.vehicleId] || "Deleted vehicle")}</td>
      <td>${escapeHtml(fill.odometer ? `${formatNumber(fill.odometer)} km odometer` : `${formatNumber(fill.tripDistance)} km trip`)}</td>
      <td>${formatNumber(fill.litres, 3)} L</td><td>${fill.fullTank ? "Yes" : "No"}</td><td>${escapeHtml(fill.drivingType)}</td>
      <td><button type="button" data-fillup-delete="${escapeHtml(fill.id)}">Delete</button></td></tr>`).join("");
  }
  renderConsumptionStats(value("fillup-vehicle"));
}

function renderConsumptionStats(vehicleId) {
  const container = $("#consumption-stats");
  if (!vehicleId) {
    container.className = "stats-grid empty-state";
    container.textContent = "Choose a vehicle with fill-up history.";
    return;
  }
  const stats = vehicleConsumptionStats(vehicleId);
  if (!stats.intervals.length) {
    container.className = "stats-grid empty-state";
    container.textContent = stats.message;
    return;
  }
  const items = [
    ["Latest", stats.latest], ["Overall weighted", stats.overall], ["Latest three", stats.latestThree],
    ["City", stats.byDrivingType.city], ["Motorway", stats.byDrivingType.motorway], ["Mixed", stats.byDrivingType.mixed],
    ["Minimum", stats.minimum], ["Maximum", stats.maximum], ["Valid intervals", stats.intervals.length, ""],
    ["Date range", `${stats.dateRange.start} to ${stats.dateRange.end}`, ""],
  ];
  container.className = "stats-grid";
  container.innerHTML = items.filter(([, amount]) => amount !== undefined && amount !== null).map(([label, amount, unit = "L/100 km"]) => `<div class="stat"><span>${escapeHtml(label)}</span><strong>${typeof amount === "number" ? formatNumber(amount, 3) : escapeHtml(amount)}${unit ? ` ${unit}` : ""}</strong></div>`).join("");
}

async function saveFillup(event) {
  event.preventDefault();
  clearValidation(event.currentTarget);
  message($("#fillup-status"));
  try {
    requireNativeValidity(event.currentTarget);
    const vehicleId = value("fillup-vehicle");
    if (!vehicleId) throw new ValidationError("Choose a saved vehicle.", "Vehicle", "fillup-vehicle");
    const odometer = parseNumber(value("fillup-odometer"), { field: "Odometer", fieldId: "fillup-odometer", max: 100_000_000 });
    const tripDistance = parseNumber(value("fillup-trip-distance"), { field: "Trip distance", fieldId: "fillup-trip-distance", max: 1_000_000 });
    if (!(odometer > 0 || tripDistance > 0)) throw new ValidationError("Enter an odometer reading or trip distance greater than zero.", "Odometer or trip distance", "fillup-odometer");
    const litres = parseNumber(value("fillup-litres"), { field: "Litres added", fieldId: "fillup-litres", min: 0.01, max: 100_000, required: true });
    const pricePerLitre = parseNumber(value("fillup-price"), { field: "Price per litre", fieldId: "fillup-price", max: 1_000_000 });
    const record = {
      id: makeId("fillup"), vehicleId, date: value("fillup-date") || isoDate(), odometer, tripDistance, litres,
      pricePerLitre, totalPaid: parseNumber(value("fillup-total"), { field: "Total paid", fieldId: "fillup-total", max: 1_000_000_000 }) || litres * pricePerLitre,
      fullTank: checked("fillup-full"), fuelType: value("fillup-fuel-type"), drivingType: value("fillup-driving"),
      notes: value("fillup-notes").trim(), createdAt: new Date().toISOString(),
    };
    await storage.put("fillups", record);
    const selectedVehicle = vehicleId;
    $("#fillup-form").reset();
    safeValue("fillup-date", isoDate());
    await reloadData();
    safeValue("fillup-vehicle", selectedVehicle);
    renderConsumptionStats(selectedVehicle);
    message($("#fillup-status"), "Fill-up saved locally.", "success");
  } catch (error) {
    showValidationError(error, { form: event.currentTarget, status: $("#fillup-status") });
  }
}

async function deleteFillup(id) {
  if (!confirm("Delete this fill-up record? Measured averages will be recalculated.")) return;
  await storage.remove("fillups", id);
  await reloadData();
  applyConsumptionSource();
}

function readCustomCosts() {
  return $$(".custom-cost-row").map((row) => ({
    name: $(".custom-cost-name", row).value.trim(),
    amount: $(".custom-cost-amount", row).value,
    fieldId: $(".custom-cost-amount", row).id,
  }));
}

function normaliseDurationField() {
  const field = $("#manual-duration");
  const digits = field.value.replace(/\D/g, "").slice(0, 4).padStart(4, "0");
  field.value = `${digits.slice(0, 2)}h${digits.slice(2)}`;
  return field.value;
}

function rawJourneyValues() {
  const multiplier = value("trip-multiplier");
  const parsedMultiplier = parseNumber(multiplier || 1, { field: "Trip multiplier", fieldId: "trip-multiplier", min: 1, max: 2, required: true, integer: true });
  const durationSeconds = parseDuration(normaliseDurationField()) * parsedMultiplier;
  return {
    oneWayDistance: value("one-way-distance"),
    tripMultiplier: multiplier, passengerCount: value("passenger-count"),
    durationSeconds, energyType: value("energy-type"), fuelConsumption: value("fuel-consumption"),
    electricConsumption: value("electric-consumption"), fuelPrice: value("fuel-price"), electricityPrice: value("electricity-price"),
    outboundToll: value("outbound-toll"), returnToll: value("return-toll"), ferryCost: value("ferry-cost"),
    parkingCost: value("parking-cost"), maintenanceRate: value("maintenance-rate"), customCosts: readCustomCosts(),
    currency: value("currency").trim().toUpperCase() || "EUR",
  };
}

function consumptionSourceLabel() {
  return $("#consumption-source").selectedOptions[0]?.textContent || "Manual consumption";
}

function collectJourney() {
  const raw = rawJourneyValues();
  const result = calculateJourney(raw);
  raw.customCosts = result.customCosts.map(({ name, amount }) => ({ name, amount }));
  const journey = {
    name: value("journey-name").trim(), notes: value("journey-notes").trim(), vehicleId: value("vehicle-select"), vehicleName: value("vehicle-name").trim() || activeVehicle()?.name || "Custom vehicle",
    consumptionSource: value("consumption-source"), consumptionSourceLabel: consumptionSourceLabel(),
  };
  return { raw, result, journey };
}

async function rememberPrice(result) {
  if (!state.storageAvailable) return;
  const valueToSave = result.energyType === "electric" ? result.electricityPrice : result.fuelPrice;
  if (!(valueToSave > 0)) return;
  const id = `price-${result.energyType}-${result.currency}`;
  const existing = await storage.get("fuelPrices", id).catch(() => null);
  const history = [{ value: valueToSave, date: new Date().toISOString() }, ...(existing?.history || [])].slice(0, 10);
  await storage.put("fuelPrices", { id, energyType: result.energyType, currency: result.currency, value: valueToSave, history }).catch(() => {});
}

function resultRows(result) {
  const rows = [];
  if (result.fuelQuantity) rows.push([`Fuel (${formatNumber(result.fuelQuantity)} L)`, result.fuelCost]);
  if (result.electricQuantity) rows.push([`Electricity (${formatNumber(result.electricQuantity)} kWh)`, result.electricityCost]);
  rows.push(["Outbound tolls", result.outboundToll], ["Return tolls", result.returnToll], ["Ferry", result.ferryCost], ["Parking", result.parkingCost], ["Maintenance", result.maintenanceCost]);
  result.customCosts.forEach((item) => rows.push([item.name, item.amount]));
  rows.push(["Cost per kilometre", result.costPerKilometre]);
  return rows;
}

function renderResult(journey, result) {
  $("#result-total").textContent = formatCurrency(result.totalCost, result.currency);
  $("#result-passenger").textContent = formatCurrency(result.costPerPassenger, result.currency);
  $("#result-distance").textContent = `${formatNumber(result.totalDistance, 2)} km`;
  $("#result-breakdown").innerHTML = resultRows(result).map(([label, amount]) => `<div><dt>${escapeHtml(label)}</dt><dd>${formatCurrency(amount, result.currency)}</dd></div>`).join("");
  $("#result-assumptions").textContent = `${formatDuration(result.durationSeconds)} · ${journey.vehicleName} · ${journey.consumptionSourceLabel} · ${result.passengerCount} passenger${result.passengerCount === 1 ? "" : "s"}. Values are estimates based only on the manual entries shown.`;
  ["save-journey", "recalculate-result", "duplicate-current", "copy-summary", "export-summary", "print-result"].forEach((id) => { $(`#${id}`).disabled = false; });
}

async function calculateForm(event) {
  event?.preventDefault();
  clearValidation($("#journey-form"));
  $("#form-errors").hidden = true;
  try {
    const { raw, result, journey } = collectJourney();
    state.currentInput = { raw: structuredClone(raw), journey: structuredClone(journey) };
    state.currentResult = result;
    renderResult(journey, result);
    await rememberPrice(result);
    message($("#action-status"), "Journey recalculated. Save it if you want to keep this snapshot.", "success");
    if (matchMedia("(max-width: 820px)").matches) $("#results-section").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    showValidationError(error, { form: $("#journey-form"), summary: $("#form-errors") });
    if (!(error instanceof ValidationError) || !error.fieldId) $("#form-errors").scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

async function saveCurrentJourney() {
  if (!state.currentResult || !state.currentInput) return;
  const existing = state.journeys.find((journey) => journey.id === state.currentJourneyId);
  const now = new Date().toISOString();
  const record = {
    id: existing?.id || makeId("journey"), createdAt: existing?.createdAt || now, updatedAt: now,
    ...structuredClone(state.currentInput.journey), input: structuredClone(state.currentInput.raw), result: structuredClone(state.currentResult),
  };
  await storage.put("journeys", record);
  state.currentJourneyId = record.id;
  await reloadData();
  message($("#action-status"), "Journey snapshot saved locally.", "success");
}

function populateCustomCosts(items = []) {
  $("#custom-costs").innerHTML = "";
  items.forEach((item) => addCustomCost(item));
}

function addCustomCost(item = {}) {
  const fragment = $("#custom-cost-template").content.cloneNode(true);
  $(".custom-cost-name", fragment).value = item.name || "";
  $(".custom-cost-amount", fragment).value = item.amount || "";
  $(".custom-cost-amount", fragment).id = makeId("custom-cost-amount");
  $(".currency-unit", fragment).textContent = value("currency") || "EUR";
  $("#custom-costs").append(fragment);
}

function loadJourney(record, useCurrentVehicle = false) {
  const input = record.input || {};
  const journey = record;
  safeValue("journey-name", journey.name || ""); safeValue("journey-notes", journey.notes || "");
  safeValue("one-way-distance", input.oneWayDistance ?? record.result?.oneWayDistance ?? "");
  const loadedMultiplier = Number(input.tripMultiplier) === 2 ? 2 : 1;
  safeValue("trip-multiplier", loadedMultiplier); safeValue("passenger-count", input.passengerCount ?? 1);
  safeValue("manual-duration", formatDurationInput((input.durationSeconds ?? record.result?.durationSeconds ?? 0) / loadedMultiplier));
  const type = loadedMultiplier === 2 ? "return" : "one-way";
  $(`input[name="journeyType"][value="${type}"]`).checked = true;
  safeValue("energy-type", input.energyType || "petrol"); safeValue("fuel-consumption", input.fuelConsumption || "");
  safeValue("electric-consumption", input.electricConsumption || ""); safeValue("fuel-price", input.fuelPrice || ""); safeValue("electricity-price", input.electricityPrice || "");
  safeValue("outbound-toll", input.outboundToll || 0); safeValue("return-toll", input.returnToll || 0); safeValue("ferry-cost", input.ferryCost || 0); safeValue("parking-cost", input.parkingCost || 0); safeValue("maintenance-rate", input.maintenanceRate || 0);
  safeValue("vehicle-name", journey.vehicleName || ""); safeValue("consumption-source", journey.consumptionSource || "manual");
  if (state.vehicles.some((vehicle) => vehicle.id === journey.vehicleId)) safeValue("vehicle-select", journey.vehicleId);
  populateCustomCosts(input.customCosts || []);
  state.currentJourneyId = record.id;
  updateEnergyFields();
  if (useCurrentVehicle && activeVehicle()) useVehicle(activeVehicle());
  calculateForm();
  $("#trip-section").scrollIntoView({ behavior: "smooth" });
}

async function duplicateJourney(record) {
  const now = new Date().toISOString();
  await storage.put("journeys", { ...structuredClone(record), id: makeId("journey"), name: `${record.name || "Journey"} copy`, createdAt: now, updatedAt: now });
  await reloadData();
}

function renderJourneys() {
  const container = $("#journey-list");
  if (!state.journeys.length) {
    container.className = "card-list empty-state";
    container.textContent = "No journeys saved yet.";
    return;
  }
  container.className = "card-list";
  container.innerHTML = state.journeys.map((journey) => `<article class="item-card"><h3>${escapeHtml(journey.name || "Untitled journey")}</h3><p>${escapeHtml(journey.vehicleName || "Custom vehicle")} &middot; ${Number(journey.result?.tripMultiplier) === 2 ? "Return" : "One-way"}</p><p>${formatNumber(journey.result?.totalDistance, 1)} km · ${formatCurrency(journey.result?.totalCost, journey.result?.currency || "EUR")} · ${escapeHtml(new Date(journey.updatedAt || journey.createdAt).toLocaleDateString())}</p><div class="item-actions"><button type="button" data-journey-action="open" data-id="${escapeHtml(journey.id)}">Open</button><button type="button" data-journey-action="duplicate" data-id="${escapeHtml(journey.id)}">Duplicate</button><button type="button" data-journey-action="recalculate" data-id="${escapeHtml(journey.id)}">Recalculate current</button><button type="button" data-journey-action="export" data-id="${escapeHtml(journey.id)}">Export</button><button type="button" data-journey-action="delete" data-id="${escapeHtml(journey.id)}">Delete</button></div></article>`).join("");
}

async function handleJourneyAction(event) {
  const button = event.target.closest("[data-journey-action]");
  if (!button) return;
  const record = state.journeys.find((journey) => journey.id === button.dataset.id);
  if (!record) return;
  const action = button.dataset.journeyAction;
  if (action === "open") loadJourney(record);
  else if (action === "recalculate") loadJourney(record, true);
  else if (action === "duplicate") await duplicateJourney(record);
  else if (action === "export") downloadFile(`${record.name || "journey"}.json`, JSON.stringify(record, null, 2), "application/json");
  else if (action === "delete" && confirm(`Delete the saved journey “${record.name || "Untitled journey"}”?`)) {
    await storage.remove("journeys", record.id); await reloadData();
  }
}

async function copySummary() {
  if (!state.currentResult || !state.currentInput) return;
  const summary = buildJourneySummary(state.currentInput.journey, state.currentResult);
  try {
    await navigator.clipboard.writeText(summary);
    message($("#action-status"), "Summary copied to the clipboard.", "success");
  } catch {
    message($("#action-status"), "Clipboard access is unavailable. Use Export summary instead.", "error");
  }
}

function exportSummary() {
  if (!state.currentResult || !state.currentInput) return;
  downloadFile("vehicle-cost-summary.txt", buildJourneySummary(state.currentInput.journey, state.currentResult), "text/plain;charset=utf-8");
}

function resetCalculator(force = false) {
  if (!force && state.currentResult && !confirm("Reset the current calculator form? Saved vehicles, fill-ups, and journeys will not be removed.")) return;
  $("#journey-form").reset();
  safeValue("trip-multiplier", 1); safeValue("passenger-count", 1); safeValue("maintenance-rate", 0);
  safeValue("outbound-toll", 0); safeValue("return-toll", 0); safeValue("ferry-cost", 0); safeValue("parking-cost", 0);
  populateCustomCosts();
  state.currentResult = null; state.currentInput = null; state.currentJourneyId = null;
  updateEnergyFields();
  $("#result-total").textContent = "—"; $("#result-passenger").textContent = "—"; $("#result-distance").textContent = "—";
  $("#result-breakdown").innerHTML = "<div><dt>Energy</dt><dd>—</dd></div><div><dt>Tolls</dt><dd>—</dd></div><div><dt>Other costs</dt><dd>—</dd></div>";
  $("#result-assumptions").textContent = "Enter the distance and vehicle values, then calculate.";
  ["save-journey", "recalculate-result", "duplicate-current", "copy-summary", "export-summary", "print-result"].forEach((id) => { $(`#${id}`).disabled = true; });
}

async function saveSettings(event) {
  event.preventDefault();
  clearValidation(event.currentTarget);
  message($("#settings-status"));
  try {
    requireNativeValidity(event.currentTarget);
    const currency = value("currency").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new ValidationError("Currency must use a three-letter code such as EUR.", "Currency", "currency");
    storage.setSetting("currency", currency); storage.setSetting("theme", value("theme"));
    updateCurrencyLabels(); applyTheme(value("theme"));
    message($("#settings-status"), "Settings saved on this browser.", "success");
  } catch (error) {
    showValidationError(error, { form: event.currentTarget, status: $("#settings-status") });
  }
}

async function exportBackup() {
  const backup = await storage.exportAll();
  downloadFile(`vehicle-cost-calculator-backup-${isoDate()}.json`, JSON.stringify(backup, null, 2), "application/json");
  return backup;
}

async function prepareImport(file) {
  try {
    if (!file) return;
    if (file.size > 5_000_000) throw new StorageError("The backup is larger than the 5 MB safety limit.");
    const backup = JSON.parse(await file.text());
    const preview = storage.validateBackup(backup);
    state.pendingBackup = backup;
    $("#import-preview").innerHTML = [["Backup version", preview.version], ["Vehicles", preview.vehicles], ["Fill-ups", preview.fillups], ["Journeys", preview.journeys], ["Exported", preview.exportedAt]].map(([label, amount]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(amount)}</strong></div>`).join("");
    $("#import-dialog").showModal();
  } catch (error) {
    message($("#settings-status"), error.message || "The backup could not be read.", "error");
  } finally {
    $("#import-backup").value = "";
  }
}

async function importBackup(mode) {
  if (!state.pendingBackup) return;
  try {
    if (mode === "replace") await exportBackup();
    await storage.importAll(state.pendingBackup, mode);
    state.pendingBackup = null;
    $("#import-dialog").close();
    await loadSettings(); await reloadData();
    message($("#settings-status"), `Backup ${mode === "replace" ? "replaced" : "merged with"} local calculator data.`, "success");
  } catch (error) {
    message($("#settings-status"), error.message || "The backup could not be imported.", "error");
  }
}

function exportVehiclesCsv() {
  downloadFile("vehicle-cost-calculator-vehicles.csv", toCsv(state.vehicles, [["Name", "name"], ["Make", "make"], ["Model", "model"], ["Year", "year"], ["Energy type", "energyType"], ["Fuel consumption", "manualConsumption"], ["Electric consumption", "manualElectricConsumption"], ["Maintenance per km", "maintenanceRate"], ["Archived", (row) => row.archived ? "yes" : "no"]]), "text/csv;charset=utf-8");
}

function exportFillupsCsv() {
  const names = Object.fromEntries(state.vehicles.map((vehicle) => [vehicle.id, vehicle.name]));
  downloadFile("vehicle-cost-calculator-fillups.csv", toCsv(state.fillups, [["Vehicle", (row) => names[row.vehicleId] || row.vehicleId], ["Date", "date"], ["Odometer", "odometer"], ["Trip distance", "tripDistance"], ["Litres", "litres"], ["Price per litre", "pricePerLitre"], ["Total paid", "totalPaid"], ["Full tank", (row) => row.fullTank ? "yes" : "no"], ["Fuel type", "fuelType"], ["Driving type", "drivingType"], ["Notes", "notes"]]), "text/csv;charset=utf-8");
}

function exportJourneysCsv() {
  downloadFile("vehicle-cost-calculator-journeys.csv", toCsv(state.journeys, [["Date", "updatedAt"], ["Journey", "name"], ["Vehicle", "vehicleName"], ["Distance km", (row) => row.result?.totalDistance], ["Energy cost", (row) => row.result?.energyCost], ["Tolls", (row) => row.result?.totalTolls], ["Total", (row) => row.result?.totalCost], ["Passengers", (row) => row.result?.passengerCount], ["Per passenger", (row) => row.result?.costPerPassenger], ["Currency", (row) => row.result?.currency], ["Notes", "notes"]]), "text/csv;charset=utf-8");
}

async function deleteAllData() {
  const warning = "Delete all Vehicle Cost Calculator data from this browser? This removes vehicles, fill-ups, journeys, price history, and preferences. Other EstrelaLua data and other websites are not affected. This cannot be undone unless you exported a backup.";
  if (!confirm(warning)) return;
  try {
    await storage.deleteAll();
    state.vehicles = []; state.fillups = []; state.journeys = [];
    resetCalculator(true); await storage.open(); await loadSettings(); await reloadData();
    message($("#settings-status"), "All local Vehicle Cost Calculator data was deleted.", "success");
  } catch (error) {
    message($("#settings-status"), error.message || "Local data could not be deleted.", "error");
  }
}

async function loadSettings() {
  safeValue("currency", storage.getSetting("currency", "EUR"));
  safeValue("theme", storage.getSetting("theme", "light"));
  applyTheme(value("theme")); updateCurrencyLabels();
}

function bindEvents() {
  $("#journey-form").addEventListener("submit", calculateForm);
  $$('input[name="journeyType"]').forEach((radio) => radio.addEventListener("change", () => {
    if (radio.checked) safeValue("trip-multiplier", radio.value === "return" ? 2 : 1);
  }));
  $("#manual-duration").addEventListener("focus", (event) => requestAnimationFrame(() => event.target.select()));
  $("#manual-duration").addEventListener("input", (event) => { event.target.value = event.target.value.replace(/\D/g, "").slice(0, 4); });
  $("#manual-duration").addEventListener("blur", normaliseDurationField);
  $("#energy-type").addEventListener("change", updateEnergyFields);
  $("#consumption-source").addEventListener("change", applyConsumptionSource);
  $("#vehicle-select").addEventListener("change", () => { const vehicle = activeVehicle(); if (vehicle) useVehicle(vehicle); });
  $("#new-vehicle").addEventListener("click", () => openVehicleDialog());
  $("#add-vehicle-library").addEventListener("click", () => openVehicleDialog());
  $("#vehicle-form").addEventListener("submit", saveVehicle);
  $$('[data-close-dialog]').forEach((button) => button.addEventListener("click", () => $("#vehicle-dialog").close()));
  $("#vehicle-list").addEventListener("click", handleVehicleAction);
  $("#fillup-form").addEventListener("submit", saveFillup);
  $("#fillup-vehicle").addEventListener("change", () => renderConsumptionStats(value("fillup-vehicle")));
  $("#fillup-table").addEventListener("click", (event) => { const button = event.target.closest("[data-fillup-delete]"); if (button) deleteFillup(button.dataset.fillupDelete); });
  $("#add-custom-cost").addEventListener("click", () => addCustomCost());
  $("#custom-costs").addEventListener("click", (event) => { const button = event.target.closest(".remove-custom-cost"); if (button) button.closest(".custom-cost-row").remove(); });
  $("#save-journey").addEventListener("click", saveCurrentJourney);
  $("#recalculate-result").addEventListener("click", calculateForm);
  $("#duplicate-current").addEventListener("click", () => { if (!state.currentInput) return; safeValue("journey-name", `${value("journey-name") || "Journey"} copy`); state.currentJourneyId = null; calculateForm(); });
  $("#copy-summary").addEventListener("click", copySummary);
  $("#export-summary").addEventListener("click", exportSummary);
  $("#print-result").addEventListener("click", () => { try { window.print(); } catch { message($("#action-status"), "Printing is unavailable in this browser.", "error"); } });
  $("#reset-calculator").addEventListener("click", resetCalculator);
  $("#journey-list").addEventListener("click", handleJourneyAction);
  $("#settings-form").addEventListener("submit", saveSettings);
  $("#currency").addEventListener("input", updateCurrencyLabels);
  $("#theme").addEventListener("change", () => applyTheme(value("theme")));
  $("#export-backup").addEventListener("click", exportBackup);
  $("#import-backup").addEventListener("change", (event) => prepareImport(event.target.files[0]));
  $$('[data-close-import]').forEach((button) => button.addEventListener("click", () => $("#import-dialog").close()));
  $("#merge-backup").addEventListener("click", () => importBackup("merge"));
  $("#replace-backup").addEventListener("click", () => importBackup("replace"));
  $("#export-vehicles-csv").addEventListener("click", exportVehiclesCsv);
  $("#export-fillups-csv").addEventListener("click", exportFillupsCsv);
  $("#export-journeys-csv").addEventListener("click", exportJourneysCsv);
  $("#delete-all-data").addEventListener("click", deleteAllData);
  document.addEventListener("beforeinput", (event) => {
    if (!(event.target instanceof HTMLInputElement) || !event.inputType.startsWith("insert") || event.data === null) return;

    if (event.target.matches('input[inputmode="numeric"]')) {
      if (/\D/.test(event.data)) event.preventDefault();
      return;
    }

    const sanitise = event.target.matches('input[inputmode="decimal"]')
      ? sanitiseDecimalInput
      : event.target.matches('input[type="number"]')
        ? sanitiseIntegerInput
        : null;
    if (!sanitise) return;

    const selectionStart = event.target.selectionStart ?? event.target.value.length;
    const selectionEnd = event.target.selectionEnd ?? selectionStart;
    const nextValue = `${event.target.value.slice(0, selectionStart)}${event.data}${event.target.value.slice(selectionEnd)}`;
    if (sanitise(nextValue) !== nextValue) event.preventDefault();
  });
  document.addEventListener("input", (event) => {
    if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement)) return;
    if (event.target.matches('input[inputmode="decimal"]')) event.target.value = sanitiseDecimalInput(event.target.value);
    if (event.target.matches('input[type="number"]')) event.target.value = sanitiseIntegerInput(event.target.value);
    clearFieldError(event.target);
    if ($("#journey-form").contains(event.target)) $("#form-errors").hidden = true;
  });
}

async function initialise() {
  bindEvents();
  safeValue("fillup-date", isoDate());
  try {
    await storage.open();
    await loadSettings();
    await reloadData();
  } catch (error) {
    state.storageAvailable = false;
    message($("#settings-status"), "Browser storage is unavailable. Manual calculations still work, but profiles and journeys cannot be saved.", "error");
    ["save-journey", "new-vehicle", "add-vehicle-library", "export-backup", "import-backup"].forEach((id) => { const element = $(`#${id}`); if (element) element.disabled = true; });
  }
  updateEnergyFields();
}

initialise();
