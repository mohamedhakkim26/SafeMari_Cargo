# SafeMari License Generator

🔥 **CRITICAL SECURITY WARNING**: This application contains private HMAC secrets and must **NEVER** be bundled with SafeMari Cargo Tools or distributed to ships.

## Overview

The SafeMari License Generator is a standalone macOS tool that generates machine-bound activation keys for the SafeMari Cargo Tools application. It uses HMAC-SHA256 cryptographic signing to create tamper-proof licenses tied to specific hardware.

## Security Architecture

### Separation of Concerns
- **License Generator** (this app): Contains private HMAC secrets, generates licenses
- **SafeMari Cargo Tools**: Contains public verification only, cannot generate licenses

### Cryptographic Design
- **Algorithm**: HMAC-SHA256
- **Key Storage**: Private secret in `config/private_secret.json`
- **License Format**: `LC-<MACHINEID>-<YYYYMMDD>-<SIGNATURE>`
- **Signature**: First 12 characters of HMAC digest, uppercase

## Installation

### Prerequisites
- macOS system
- Node.js 14.0.0 or higher
- Terminal access

### Setup
```bash
# Clone or copy this directory to your macOS machine
cd safemari-license-generator

# Install dependencies
npm install

# Install CLI globally (optional)
npm link

# Verify installation
safemari-gen --help
```

## Usage

### Basic License Generation
```bash
# Generate license with expiry date
safemari-gen --machine-id 4F2E9A88B1C7 --expiry 2026-03-01

# Generate license for 90 days from today
safemari-gen --machine-id 4F2E9A88B1C7 --days 90

# Include ship name and notes
safemari-gen --machine-id 4F2E9A88B1C7 --days 60 --ship "MV CARGO STAR" --notes "Initial license"
```

### CLI Options
- `--machine-id` (required): Machine ID from ship (12-16 hex characters)
- `--expiry`: Expiry date in YYYY-MM-DD format
- `--days`: Number of days from today (alternative to --expiry)
- `--ship`: Ship name (optional metadata)
- `--notes`: Additional notes (optional metadata)
- `--verbose`: Enable verbose output

### Example Output
```
✅ License Generated Successfully!

═══════════════════════════════════════════════════════════
📋 Machine ID:     4F2E9A88B1C7
📅 Expiry Date:    2026-03-01
🔑 License Code:   LC-4F2E9A88B1C7-20260301-9D7C3FA1B2C4
═══════════════════════════════════════════════════════════
⏰ Generated:      12/3/2025, 2:30:15 PM
═══════════════════════════════════════════════════════════

📧 Send this license code to the ship officer:
   LC-4F2E9A88B1C7-20260301-9D7C3FA1B2C4
```

## Operational Workflow

### Ship Side
1. Officer installs SafeMari Cargo Tools EXE
2. App displays Machine ID (e.g., `8A22-91F3-C72D`)
3. Officer sends Machine ID via email/WhatsApp

### License Authority Side (You)
1. Receive Machine ID from ship
2. Run license generator:
   ```bash
   safemari-gen --machine-id 8A22-91F3-C72D --days 90
   ```
3. Send generated license code back to ship

### Ship Side (Activation)
1. Officer enters license code in SafeMari Cargo Tools
2. App verifies license and unlocks
3. App remains functional until expiry
4. After expiry, app locks and requires new license

## File Structure

```
safemari-license-generator/
├── generator/
│   ├── main.js                 # Core license generation logic
│   ├── hmac_signer.js          # HMAC-SHA256 signing module
│   └── config/
│       └── private_secret.json # 🔒 PRIVATE HMAC SECRET
├── cli/
│   └── safemari-gen           # Command-line interface
├── utils/
│   └── generate-secret.js     # Utility to generate new secrets
├── output/                    # Generated license files
├── package.json
└── README.md
```

## Security Guidelines

### 🔥 CRITICAL REQUIREMENTS

1. **NEVER distribute this app** with SafeMari Cargo Tools
2. **NEVER commit** `private_secret.json` to version control
3. **NEVER expose** the private secret in logs or error messages
4. **ALWAYS verify** machine ID format before generating licenses
5. **REGULARLY backup** the private secret to secure location

### Private Secret Management

```bash
# Generate new private secret (if needed)
npm run generate-secret

# Test license generation
npm run test-license
```

⚠️ **WARNING**: Changing the private secret will invalidate all existing licenses. Ships would need new license codes.

## Troubleshooting

### Common Issues

**Invalid Machine ID format**
- Machine ID must be 12-16 hexadecimal characters
- Example: `4F2E9A88B1C7` ✅
- Example: `4f2e9a88b1c7` ❌ (lowercase)
- Example: `4F2E-9A88-B1C7` ❌ (contains hyphens)

**Private secret not found**
- Ensure `generator/config/private_secret.json` exists
- Run `npm run generate-secret` to create new secret

**CLI command not found**
- Run `npm link` to install CLI globally
- Or use `node cli/safemari-gen` directly

### Log Files
Generated licenses are saved to `output/` directory with timestamps for record keeping.

## Integration with SafeMari Cargo Tools

The license format and cryptographic signatures are designed to work with the verification system in SafeMari Cargo Tools:

- **Public Salt**: Stored in cargo tools for verification
- **Private Secret**: Stored only in this generator for signing
- **Machine Binding**: Licenses tied to specific hardware fingerprints
- **Time Limits**: Built-in expiry dates prevent unlimited usage

## License

This is proprietary software for SafeMari license generation. Not for public distribution.

---

**Remember**: This tool controls access to valuable cargo validation software. Keep it secure! 🔒