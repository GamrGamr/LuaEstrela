# Vehicle Cost Calculator

The Vehicle Cost Calculator is a fully manual, browser-based tool for estimating the cost of a vehicle journey. It does not require an account, API key, backend, package manager, or build process.

Open the app from `apps/vehicle-cost-calculator.html` or directly at `tools/vehicle-cost-calculator/index.html`.

## What the user enters

- Optional journey name and notes for saved calculations
- One-way distance and optional one-way duration in `00h00` format
- One-way or return journey type
- Vehicle energy type and consumption
- Fuel or electricity price
- Outbound and return tolls
- Ferry, parking, maintenance, and custom costs
- Number of passengers

The distance, duration, tolls, and prices used in a calculation are entered manually by the user.

## Calculations

Total distance:

```text
one-way distance × 1 for one-way, or × 2 for return
```

Fuel or electricity quantity:

```text
total distance × consumption per 100 km ÷ 100
```

Energy cost:

```text
fuel quantity × fuel price
+ electricity quantity × electricity price
```

Total cost:

```text
energy + tolls + ferry + parking + maintenance + custom costs
```

Passenger cost:

```text
total cost ÷ passenger count
```

The app supports petrol, diesel, LPG, hybrid, plug-in hybrid, and electric vehicles. Plug-in hybrids can include both fuel and electricity in the same estimate.

## Vehicle profiles and fill-ups

Vehicle profiles can store identifying details, energy type, manual consumption, maintenance allowance, preferred consumption source, default passenger count, notes, and archive status.

For liquid-fuel vehicles, full-tank fill-up records can produce measured consumption. A valid interval needs two full-tank records. Any partial fills between them are included in the litres consumed. The user can choose the latest interval, latest-three weighted average, overall weighted average, or a driving-type average.

## Saved journeys and exports

Saved journeys are snapshots of the values and result at the time they were saved. They can be opened, duplicated, recalculated with the current vehicle profile, exported, or deleted.

Available exports include:

- Plain-text journey summary
- JSON journey file
- CSV lists for vehicles, fill-ups, and journeys
- Full JSON backup

Before replacing local data during an import, the app downloads a safety backup. Merge keeps existing records and replaces only matching IDs.

## Local storage and privacy

Structured records use IndexedDB. Currency and theme preferences use localStorage. The app stores:

- Vehicle profiles
- Fill-up records
- Saved journeys
- Recent energy prices
- Currency and theme preferences

The calculator does not contact mapping, routing, toll, analytics, advertising, telemetry, or cloud services. Journey details remain in the current browser unless the user explicitly exports a file. Clearing browser storage can remove saved information, so important data should be backed up.

Database version 4 removes obsolete online-route, location, and additional-distance fields while preserving existing vehicles, fill-ups, journeys, and price history.

## Files

- `tools/vehicle-cost-calculator/index.html` — interface
- `tools/vehicle-cost-calculator/calculator.css` — responsive styling and print layout
- `tools/vehicle-cost-calculator/calculator.js` — interface, records, imports, and exports
- `tools/vehicle-cost-calculator/calculations.js` — validation, formulas, formatting, and fill-up calculations
- `tools/vehicle-cost-calculator/storage.js` — IndexedDB, preferences, backup validation, and data migration
- `tools/vehicle-cost-calculator/tests.html` — browser test runner
- `tools/vehicle-cost-calculator/tests.js` — calculation, storage, backup, and migration tests

## Testing

Open `tools/vehicle-cost-calculator/tests.html` through GitHub Pages or a static development server. The tests make no network requests.

The suite covers:

- Every supported energy type
- One-way and return journeys with `00h00` duration validation
- Tolls and other manual costs
- Passenger splitting and numeric validation
- Field-level validation for missing, malformed, negative, out-of-range, and non-integer values
- Immediate letter filtering in decimal distance, consumption, price, and cost fields
- Full-tank consumption measurement
- IndexedDB create, update, read, delete, backup, and import
- Removal of obsolete online-route data without losing saved records
- Relative links under the `/EstrelaLua/` GitHub Pages path

For a manual interface check, calculate at least one liquid-fuel journey and one electric journey, save and reopen a journey, create a backup, and verify the layout on desktop and mobile widths.
