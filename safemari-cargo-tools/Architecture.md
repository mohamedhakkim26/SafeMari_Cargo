“Safemari Cargo Tools” – Desktop App

Standalone Windows offline desktop application for shipboard cargo validation.

Build Platform: macOS
Runtime Platform: Windows PCs (ship office, bridge, cargo office)
Packaging: Electron (or Tauri) → EXE
Network: 100% Offline

This app must not include:
❌ Signing secrets
❌ License generation logic
❌ Private keys

Only includes:
✔ Public verification routine
✔ UI for activation
✔ Core cargo tools
✔ Local logs

1. 🎯 Product Purpose

To provide four automated cargo validation tools used by ship officers:

Reefer Temperature Checker

CT Stowage Sorter

DG PDF Manifest vs DG Stowage (Excel) Checker

Generic 2-List Reconciliation

Local logging dashboard

With offline machine-bound licensing (Option B).

2. 🔐 LICENSING MODEL (OPTION B – MACHINE-BOUND)
Core principles:

App ships locked.

On first run → app shows Machine ID.

Ship sends Machine ID to owner (You).

You use a separate License Generator product to generate key.

Ship enters license key → app unlocks for defined period.

App remains 100% offline.

The Safemari Cargo Tools app cannot derive or fake license keys.

3. 🧠 Machine ID Logic (in main app)

Generate a stable, non-sensitive hardware fingerprint:

Windows UUID

Disk serial

Username

MAC hash

Concatenate → SHA256 → take first 8 bytes uppercase.

Example:

4F2E9A88B1C7


Store nothing sensitive.
Never expose raw machine hardware identifiers.

4. 🔍 License Code Format (verification only)

App expects license format:

LC-<MID>-<YYYYMMDD>-<SIG>


Where:

<MID> = sanitized MachineID embedded in code

<YYYYMMDD> = expiry

<SIG> = first 12–16 characters of HMAC-SHA256(machineID|expiry, public-salt)

❗ App only verifies signature via PUBLIC key or SALT
It cannot generate licenses.

5. 🗂️ Local License Storage

Path:

%LOCALAPPDATA%/SafemariCargoTools/license.json


Contents:

{
  "machine_id": "4F2E9A88B1C7",
  "expiry": "2026-03-01",
  "signature": "9D7C3FA1B2C4"
}


On each launch:

Verify machine ID matches.

Verify date ≤ expiry.

Verify signature is valid.

If invalid → lock screen.

6. 🖥️ App UI / Modules

Left sidebar:

Reefers
  - Temp Checker
  - CT Stowage

DG Cargo
  - DG Checker

Tools
  - List Compare

Logs
  - View / Export

Settings
  - Change username
  - View license info
  - Clear cache

About
  - App version, contact


Each module uses drag-and-drop, file pickers, and export to Excel.

All error handling must be neat and friendly for officers.

7. 🚢 MODULE SPECS
7.1 Reefer Temperature Checker

Inputs:

CHECK Excel (set temperatures)

MANIFEST Excel (actual temperatures)

Auto-detect:

Container ID column

Set Temp column

Manifest Temp column

Any header naming variation (Temperature, Temp, T°, °C, etc.)

Outputs:

Total containers

Found

Missing

Temperature mismatches

Export to Excel

7.2 CT Reefer Stowage Sorter

Inputs:

Full Reefer List (stowage + container ID)

CT Monitoring Sheet (multi-row blocks)

Tasks:

Extract stowage

Insert into CT block using injection rules

Sort CT blocks by BBRRTT

Export full formatted sheet

Stowage output format:
100876 (no dots)

7.3 DG Manifest Checker (PDF → Excel)

Inputs:

DG PDF Manifest

DG Stowage Excel

Parse from PDF:

Container #

UN #

Class

PSN

Flashpoint

Weight

Checks:

Missing in stowage

Extra in stowage (not in PDF)

UN/Class mismatch

Optional future: stowage rule validation

Export: DG_Report.xlsx

7.4 Generic 2-List Compare

Inputs:

Excel A

Excel B

Outputs:

Common containers

Only in A

Only in B

Export: Reconciliation_Report.xlsx

8. 📑 Local Logging System

Store all actions locally.

Log fields:

timestamp
username
module
fileA
fileB
result_summary
machine_id_hash
license_days_remaining


Stored in:

%LOCALAPPDATA%/SafemariCargoTools/logs.db  (SQLite)


UI:

Table of logs

Filters: date, module

Export logs

9. 🧵 Safemari Cargo Tools – Directory Structure (Main App)
safemari-cargo-tools/
  ├─ app/
  │   ├─ main.js                      # Electron bootstrap
  │   ├─ preload.js
  │   └─ verifier/                    # only public verifier here
  │        ├─ machine.js
  │        ├─ checkLicense.js
  │        └─ publicSalt.json
  ├─ modules/
  │        ├─ reefer.js
  │        ├─ ct.js
  │        ├─ dg.js
  │        └─ compare.js
  ├─ ui/
  │   ├─ index.html
  │   ├─ styles.css
  │   ├─ router.js
  │   ├─ views/…
  ├─ storage/
  │   ├─ logs.db
  │   └─ license.json
  ├─ build/                           # final EXE
  ├─ dist/
  └─ package.json
