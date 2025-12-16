LICENSE GENERATOR (SEPARATE APP)
You alone keep this.
This must NEVER be bundled with Safemari Cargo Tools.
🔥 “Safemari License Generator” – Separate Standalone Tool
Purpose:

Allow the product owner (you) to generate machine-bound activation keys.

Platform:

macOS

CLI or small GUI

Node.js OR Python

Secrets:

Contains PRIVATE HMAC SECRET KEY

This must never be included in the Safemari Cargo Tools app.

📐 1. Inputs (License Generator)

Machine ID (string)

Expiry date (YYYY-MM-DD)

Optional:

Ship name

Notes

🔐 2. HMAC Signing Logic
data = machineId + "|" + expiry
signature = HMAC_SHA256(private_secret, data)
shortSignature = signature.hex().substring(0, 12).toUpperCase()


License format output:

LC-<MACHINEID>-<YYYYMMDD>-<SHORTSIGNATURE>


Example:

LC-4F2E9A88B1C7-20260301-9D7C3FA1B2C4

🧰 3. License Generator CLI Example
CLI Usage:
$ safemari-gen --machine-id 4F2E9A88B1C7 --expiry 2026-03-01

Generated License:
LC-4F2E9A88B1C7-20260301-9D7C3FA1B2C4


OR:

$ safemari-gen --machine-id 4F2E9A88B1C7 --days 90


Outputs:

Final key

Expiry date

Machine ID

🗂️ 4. License Generator File Structure
safemari-license-generator/
  ├─ generator/
  │    ├─ main.py OR main.js
  │    ├─ hmac_signer.py
  │    ├─ config/
  │    │     └─ private_secret.json      # NEVER share
  │    └─ utils/
  ├─ cli/
  │    └─ safemari-gen
  ├─ output/
  └─ readme.md

🔒 5. Operational Flow Summary
Ship side:

Install Safemari Cargo Tools EXE

App shows:

Machine ID: 8A22-91F3-C72D
Please send to Safemari for activation.


Officer sends you the code.

Your side:

You run License Generator with:

Machine ID from ship

Expiry date (you choose 30/60/90 days)

You generate a license key.

You email/WhatsApp it back.

Ship side:

They enter key → app unlocks

After expiry → app re-locks

Ship must request new key.