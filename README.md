# EstrelaLuaApps

This repository contains the official website for **EstrelaLuaApps**, an independent collection of practical Windows desktop applications and browser tools.

The website gives every app one clear home where visitors can:

- Discover what each application is designed to do
- Compare its main features and system requirements
- Understand how it handles privacy and local data
- Open the application's GitHub repository
- Download the latest official release

## Apps featured on the website

### Allin1APP

A lightweight Windows app launcher for organizing applications and shortcuts into categories, keeping favourites close, and reducing desktop clutter.

### Foculume

A private, local study timer with customizable focus and rest cycles, an always-on-top compact timer, long breaks, and seven-day statistics.

### MacroAPP

A portable macro recorder and player for capturing keyboard events and mouse clicks, saving reusable macros, and controlling playback with configurable hotkeys.

### Pixevra

A local image utility for converting, resizing, cropping, trimming, creating ICO files, and cleaning up image backgrounds without uploading files anywhere.

### Halvynox

A lightweight Windows shutdown scheduler with countdown warnings, limited delay attempts, optional password protection, and local configuration.

### Vehicle Cost Calculator

A fully manual browser-based journey calculator for fuel, electricity, tolls, parking, ferries, maintenance, custom costs, and passenger sharing. It supports local vehicle profiles, measured full-tank consumption, saved journey snapshots, and backups.

### Home Energy Calculator

A private browser-based household electricity calculator. Enter energy and daily contracted-power prices, then estimate appliances from their power and running time or enter known monthly kWh totals directly. It calculates energy, contracted-power, and optional fixed costs by day, month, and year, while storing the household setup only in the current browser.

## About the project

EstrelaLuaApps is created and maintained by one independent developer. The applications focus on useful everyday tools, straightforward interfaces, local data storage, and avoiding unnecessary accounts, cloud services, and telemetry.

This repository contains the public website and its browser-based calculators. Each desktop application's downloads, documentation, release history, and repository link are available from its dedicated page. Browser apps open directly from their information page.

## Website structure

- `index.html` - Main EstrelaLuaApps homepage and app collection
- `apps/` - Dedicated information page for each application
- `assets/` - Brand artwork, favicons, and official app icons
- `tools/vehicle-cost-calculator/` - Browser calculator, calculation and storage modules, and tests
- `tools/home-energy-calculator/` - Household electricity calculator, calculation module, and tests
- `docs/vehicle-cost-calculator.md` - Calculator operation, formulas, privacy, storage, and tests
- `styles.css` - Shared responsive design and page styling
- `script.js` - Navigation, scrolling, and reveal interactions

## Hosting

The website is static and is published through GitHub Pages from the `main` branch. It uses relative paths and does not require a build process, package manager, database, or web server framework.

The browser calculators work entirely in the browser without an API, backend, account, or build step. Users enter values manually, and the calculators do not send calculation data to external services.
