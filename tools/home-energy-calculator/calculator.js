import { ValidationError, calculateHomeEnergy, formatCurrency, formatNumber, sanitiseDecimalInput, sanitiseIntegerInput } from "./calculations.js?v=8";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORAGE_KEY = "estrelalua-home-energy-v1";
let nextRowId = 1;
let calculateTimer = 0;

const blankAppliance = () => ({ id: String(nextRowId++), name: "", watts: "", quantity: "1", hoursPerDay: "", daysPerMonth: "30", monthlyKwh: "" });
const exampleHome = [
  { name: "Refrigerator", watts: "120", quantity: "1", hoursPerDay: "8", daysPerMonth: "30" },
  { name: "Television", watts: "100", quantity: "1", hoursPerDay: "4", daysPerMonth: "30" },
  { name: "Washing machine", watts: "2000", quantity: "1", hoursPerDay: "1", daysPerMonth: "12" },
  { name: "Laptop", watts: "60", quantity: "1", hoursPerDay: "6", daysPerMonth: "30" },
];

function addAppliance(appliance = blankAppliance()) {
  const fragment = $("#appliance-template").content.cloneNode(true);
  const row = $(".appliance-row", fragment);
  const rowId = appliance.id || String(nextRowId++);
  row.dataset.id = rowId;
  const numericId = Number(rowId);
  if (Number.isInteger(numericId)) {
    nextRowId = Math.max(nextRowId, numericId + 1);
  }
  $(".appliance-name", row).value = appliance.name ?? "";
  $(".appliance-watts", row).value = appliance.watts ?? "";
  $(".appliance-quantity", row).value = appliance.quantity ?? "1";
  $(".appliance-hours", row).value = appliance.hoursPerDay ?? "";
  $(".appliance-days", row).value = appliance.daysPerMonth ?? "30";
  $(".appliance-known-kwh", row).value = appliance.monthlyKwh ?? "";
  $("#appliance-list").append(row);
  syncRowLabels();
  syncMeasuredMode(row);
}

function syncMeasuredMode(row) {
  const measuredInput = $(".appliance-known-kwh", row);
  const measuredValue = Number(measuredInput.value.trim().replace(",", "."));
  const usesMeasuredKwh = Number.isFinite(measuredValue) && measuredValue > 0;
  row.classList.toggle("uses-measured-kwh", usesMeasuredKwh);
  $$(".appliance-watts, .appliance-quantity, .appliance-hours, .appliance-days", row).forEach((input) => {
    input.disabled = usesMeasuredKwh;
  });
  $(".input-choice-note", row).textContent = usesMeasuredKwh
    ? "Measured kWh is active. Power, Quantity, Hours, and Days are ignored for this appliance."
    : "Enter measured kWh to use the meter reading instead of Power, Quantity, Hours, and Days.";
}

function applyInputBounds(input) {
  const value = Number(input.value.replace(",", "."));
  if (!input.value.trim() || !Number.isFinite(value)) return;
  const minimum = input.dataset.min === undefined ? null : Number(input.dataset.min);
  const maximum = input.dataset.max === undefined ? null : Number(input.dataset.max);
  if (minimum !== null && value < minimum) input.value = String(minimum);
  if (maximum !== null && value > maximum) input.value = String(maximum);
}

function syncRowLabels() {
  $$(".appliance-row").forEach((row, index) => {
    $("h3", row).textContent = `Appliance ${index + 1}`;
    const fields = [
      [".appliance-name", "name"], [".appliance-watts", "watts"], [".appliance-quantity", "quantity"],
      [".appliance-hours", "hours"], [".appliance-days", "days"],
      [".appliance-known-kwh", "kwh"],
    ];
    fields.forEach(([selector, suffix]) => {
      const control = $(selector, row);
      control.id = `appliance-${index}-${suffix}`;
      control.closest(".field").querySelector("label").htmlFor = control.id;
    });
  });
}

function readAppliances() {
  syncRowLabels();
  return $$(".appliance-row").map((row) => ({
    id: row.dataset.id,
    name: $(".appliance-name", row).value,
    watts: $(".appliance-watts", row).value,
    quantity: $(".appliance-quantity", row).value,
    hoursPerDay: $(".appliance-hours", row).value,
    daysPerMonth: $(".appliance-days", row).value,
    monthlyKwh: $(".appliance-known-kwh", row).value,
  }));
}

function readInput() {
  return {
    pricePerKwh: $("#price-per-kwh").value,
    energyIvaRate: $("#energy-iva").value,
    contractedPowerPricePerDay: $("#contracted-power-price").value,
    contractedPowerIvaRate: $("#contracted-power-iva").value,
    billingDays: $("#billing-days").value,
    fixedMonthlyCost: $("#fixed-monthly-cost").value,
    appliances: readAppliances(),
  };
}

function saveDraft() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readInput()));
    $("#save-status").textContent = "Saved on this device.";
  } catch {
    $("#save-status").textContent = "This browser could not save the setup.";
  }
}

function loadDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.appliances)) return false;
    $("#price-per-kwh").value = saved.pricePerKwh ?? "0.25";
    $("#energy-iva").value = saved.energyIvaRate ?? "0";
    $("#contracted-power-price").value = saved.contractedPowerPricePerDay ?? "0";
    $("#contracted-power-iva").value = saved.contractedPowerIvaRate ?? "0";
    $("#billing-days").value = saved.billingDays ?? "30";
    $("#fixed-monthly-cost").value = saved.fixedMonthlyCost ?? "0";
    saved.appliances.forEach(addAppliance);
    return true;
  } catch { return false; }
}

function clearErrors() {
  $$('[aria-invalid="true"]').forEach((field) => field.removeAttribute("aria-invalid"));
  $("#form-message").textContent = "";
  $("#form-message").className = "form-message";
}

function showError(error) {
  $("#form-message").textContent = error.message;
  $("#form-message").className = "form-message error";
  if (error.fieldId) {
    const field = document.getElementById(error.fieldId);
    if (field) { field.setAttribute("aria-invalid", "true"); field.focus(); }
  }
}

function updateRowEstimates(result) {
  const byId = new Map(result.items.map((item) => [String(item.id), item]));
  $$(".appliance-row").forEach((row) => {
    const item = byId.get(String(row.dataset.id));
    $(".row-estimate", row).textContent = item
      ? `${formatNumber(item.monthlyKwh)} kWh/month · ${formatCurrency(item.monthlyCost)}/month`
      : Number($(".appliance-known-kwh", row).value.trim().replace(",", ".")) > 0
        ? "Enter a valid measured monthly kWh value."
        : "Enter the appliance details to calculate its monthly use.";
  });
}

function renderResult(result) {
  $("#monthly-cost").textContent = formatCurrency(result.monthlyCost);
  $("#monthly-kwh").textContent = `${formatNumber(result.monthlyKwh)} kWh`;
  $("#daily-cost").textContent = formatCurrency(result.dailyCost);
  $("#annual-cost").textContent = formatCurrency(result.annualCost);
  $("#annual-kwh").textContent = `${formatNumber(result.annualKwh)} kWh`;
  $("#energy-charge").textContent = formatCurrency(result.monthlyEnergySubtotal);
  $("#energy-iva-charge").textContent = formatCurrency(result.monthlyEnergyIva);
  $("#power-charge").textContent = formatCurrency(result.monthlyPowerSubtotal);
  $("#power-iva-charge").textContent = formatCurrency(result.monthlyPowerIva);
  $("#fixed-charge").textContent = formatCurrency(result.fixedMonthlyCost);
  $("#daily-kwh").textContent = `${formatNumber(result.dailyKwh)} kWh`;

  const maximum = Math.max(...result.items.map((item) => item.monthlyKwh), 1);
  $("#usage-list").innerHTML = result.items.length ? result.items.map((item) => {
    const share = result.monthlyKwh ? (item.monthlyKwh / result.monthlyKwh) * 100 : 0;
    const width = Math.max(3, (item.monthlyKwh / maximum) * 100);
    return `<li><div class="usage-copy"><strong>${escapeHtml(item.name)}</strong><span>${formatNumber(item.monthlyKwh)} kWh · ${formatCurrency(item.monthlyCost)} · ${formatNumber(share, 1)}%</span></div><div class="usage-bar"><span style="width:${width}%"></span></div></li>`;
  }).join("") : '<li class="empty-result">Add an appliance to see its share.</li>';
  updateRowEstimates(result);
}

function resetResults() {
  window.clearTimeout(calculateTimer);
  renderResult({
    monthlyCost: 0,
    monthlyKwh: 0,
    dailyCost: 0,
    annualCost: 0,
    annualKwh: 0,
    monthlyEnergySubtotal: 0,
    monthlyEnergyIva: 0,
    monthlyPowerSubtotal: 0,
    monthlyPowerIva: 0,
    fixedMonthlyCost: 0,
    dailyKwh: 0,
    items: [],
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function calculate({ showErrors = true } = {}) {
  clearErrors();
  try {
    const result = calculateHomeEnergy(readInput());
    renderResult(result);
    return result;
  } catch (error) {
    if (showErrors && error instanceof ValidationError) showError(error);
    return null;
  }
}

function scheduleCalculation() {
  window.clearTimeout(calculateTimer);
  calculateTimer = window.setTimeout(() => { saveDraft(); calculate({ showErrors: false }); }, 180);
}

function bindEvents() {
  $("#energy-form").addEventListener("submit", (event) => { event.preventDefault(); saveDraft(); calculate(); });
  $("#add-appliance").addEventListener("click", () => { addAppliance(); saveDraft(); $(".appliance-row:last-child .appliance-name").focus(); });
  $("#load-example").addEventListener("click", () => {
    $("#appliance-list").replaceChildren();
    exampleHome.forEach((item) => addAppliance({ id: String(nextRowId++), ...item }));
    saveDraft(); calculate();
  });
  $("#reset-calculator").addEventListener("click", () => {
    $("#price-per-kwh").value = "0";
    $("#energy-iva").value = "0";
    $("#contracted-power-price").value = "0";
    $("#contracted-power-iva").value = "0";
    $("#billing-days").value = "0";
    $("#fixed-monthly-cost").value = "0";
    $("#appliance-list").replaceChildren();
    addAppliance({ id: String(nextRowId++), name: "", watts: "0", quantity: "1", hoursPerDay: "0", daysPerMonth: "0", monthlyKwh: "0" });
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    clearErrors();
    resetResults();
  });
  $("#appliance-list").addEventListener("click", (event) => {
    const button = event.target.closest(".remove-appliance");
    if (!button) return;
    button.closest(".appliance-row").remove();
    if (!$(".appliance-row")) addAppliance();
    syncRowLabels(); saveDraft(); calculate({ showErrors: false });
  });
  document.addEventListener("beforeinput", (event) => {
    if (!(event.target instanceof HTMLInputElement) || !event.inputType.startsWith("insert") || event.data === null) return;
    const sanitise = event.target.inputMode === "decimal" ? sanitiseDecimalInput : event.target.inputMode === "numeric" ? sanitiseIntegerInput : null;
    if (!sanitise) return;
    const start = event.target.selectionStart ?? event.target.value.length;
    const end = event.target.selectionEnd ?? start;
    const nextValue = `${event.target.value.slice(0, start)}${event.data}${event.target.value.slice(end)}`;
    if (sanitise(nextValue) !== nextValue) event.preventDefault();
  });
  document.addEventListener("input", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.target.inputMode === "decimal") event.target.value = sanitiseDecimalInput(event.target.value);
    if (event.target.inputMode === "numeric") event.target.value = sanitiseIntegerInput(event.target.value);
    applyInputBounds(event.target);
    if (event.target.classList.contains("appliance-known-kwh")) syncMeasuredMode(event.target.closest(".appliance-row"));
    event.target.removeAttribute("aria-invalid");
    scheduleCalculation();
  });
}

bindEvents();
if (!loadDraft()) addAppliance();
calculate({ showErrors: false });
