# SafeMari License Generator UI

Simple web-based interface for generating encrypted machine-bound licenses.

## Features

- 🔐 **Encrypted Configuration**: JSON config encrypted with master password
- 🎯 **Machine-Bound Licenses**: Licenses tied to specific machine IDs
- 📅 **Flexible Expiry**: Set days from today or specific date
- 💾 **Local Storage**: All data stored locally in browser
- 📋 **Easy Copy**: One-click license code copying
- 📄 **JSON Export**: Download license details as JSON

## Usage

1. **Open `index.html`** in any modern web browser
2. **Enter Master Password** to unlock the generator
3. **Enter Machine ID** from the target cargo tools app
4. **Set License Duration** (days or specific date)
5. **Add Optional Info** (ship name, notes)
6. **Generate License** and copy the code
7. **Provide License Code** to the end user

## Security

- Configuration encrypted with XOR + key derivation
- Master password required for access
- No network access - fully offline
- Local browser storage only
- Machine-bound license validation

## License Format

```
LC-{MACHINE_ID}-{YYYYMMDD}-{SIGNATURE}
```

Example: `LC-4F2E9A88B1C7D5E9-20251215-A1B2C3D4E5F6G7H8`

## Configuration

The generator creates an encrypted configuration automatically:

```json
{
  "privateKey": "generated-64-char-key",
  "publicSalt": "generated-64-char-salt", 
  "generatedLicenses": [],
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

## Files

- `index.html` - Main UI interface
- `generator.js` - License generation logic
- `config.json.example` - Configuration documentation
- `README.md` - This documentation