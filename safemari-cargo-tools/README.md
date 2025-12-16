# SafeMari Cargo Tools

A standalone Windows offline desktop application for shipboard cargo validation.

## Overview

SafeMari Cargo Tools provides four automated cargo validation tools used by ship officers:

- **Reefer Temperature Checker** - Compare set temperatures with manifest temperatures
- **CT Stowage Sorter** - Sort reefer containers into CT monitoring blocks  
- **DG Manifest Checker** - Validate dangerous goods between PDF manifests and Excel stowage
- **Generic 2-List Reconciliation** - Compare two container lists for differences

## Features

- 🔒 **Offline Machine-Bound Licensing** - Secure licensing without internet connectivity
- 📱 **User-Friendly Interface** - Drag-and-drop file handling designed for maritime officers
- 📊 **Excel Export** - Export results to Excel for further analysis
- 📋 **Activity Logging** - Local SQLite database tracks all operations
- 🛡️ **Security** - No sensitive keys or license generation logic included
- 🖥️ **Windows Native** - Packaged as standalone EXE file

## Architecture

- **Build Platform**: macOS
- **Runtime Platform**: Windows PCs (ship office, bridge, cargo office)  
- **Framework**: Electron
- **Database**: SQLite for local logging
- **File Processing**: Excel (XLSX/XLS) and PDF parsing
- **Network**: 100% Offline operation

## Project Structure

```
safemari-cargo-tools/
├── app/                    # Main Electron application
│   ├── main.js            # Application bootstrap
│   ├── preload.js         # Security bridge
│   └── verifier/          # License verification (public only)
├── modules/               # Cargo validation logic
│   ├── reefer.js         # Temperature checking
│   ├── ct.js             # CT stowage sorting
│   ├── dg.js             # DG manifest validation
│   ├── compare.js        # List comparison
│   └── logging.js        # SQLite logging system
├── ui/                    # Frontend interface
│   ├── index.html        # Main interface
│   ├── styles.css        # Styling
│   ├── router.js         # Navigation
│   └── views/            # View components
└── storage/               # Local data storage
```

## Development Setup

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Windows development environment (for testing)

### Installation

1. **Clone and setup**
   ```bash
   cd safemari-cargo-tools
   npm install
   ```

2. **Development mode**
   ```bash
   npm start
   ```

3. **Build for production**
   ```bash
   npm run build
   ```

## Licensing System

### Machine ID Generation
- Combines Windows UUID, disk serial, username, and MAC address
- SHA256 hash truncated to 8 bytes uppercase
- Example: `4F2E9A88B1C7`

### License Format
```
LC-<MACHINE_ID>-<YYYYMMDD>-<SIGNATURE>
```

Where:
- `LC` = License prefix
- `MACHINE_ID` = 8-byte machine identifier
- `YYYYMMDD` = Expiry date
- `SIGNATURE` = HMAC-SHA256 signature (12-16 chars)

### License Storage
```
%LOCALAPPDATA%/SafemariCargoTools/license.json
```

### Activation Process
1. App generates machine ID on first run
2. User sends machine ID to license provider
3. License provider generates license code
4. User enters license code to activate
5. App verifies and stores license locally

## Module Specifications

### 1. Reefer Temperature Checker
- **Input**: CHECK Excel + MANIFEST Excel
- **Auto-detection**: Container ID and temperature columns
- **Output**: Temperature comparison report with matches/mismatches
- **Export**: Excel with summary and detailed results

### 2. CT Stowage Sorter  
- **Input**: Reefer list + CT monitoring sheet
- **Processing**: Extract stowage positions and inject into CT blocks
- **Sorting**: BBRRTT format (Bay-Row-Tier)
- **Output**: Organized CT sheet with sorted containers

### 3. DG Manifest Checker
- **Input**: PDF manifest + Excel stowage
- **Parsing**: Container#, UN#, Class, PSN, Flashpoint, Weight
- **Validation**: Missing containers, extra containers, UN/Class mismatches
- **Export**: Comprehensive validation report

### 4. Generic List Compare
- **Input**: Two Excel files
- **Analysis**: Common containers, unique to each list
- **Output**: Reconciliation report with differences

## Local Logging

All operations are logged to SQLite database with:
- Timestamp and username
- Module and file information  
- Operation results and duration
- Machine ID hash (privacy-safe)
- License status

**Database Location**: `%LOCALAPPDATA%/SafemariCargoTools/logs.db`

## Security Considerations

### What the App Contains (✅)
- Public license verification routine
- Machine ID generation logic
- Core cargo validation tools
- Local logging system

### What the App Does NOT Contain (❌)
- License generation secrets
- Private signing keys
- Network communication code
- Sensitive cryptographic material

## Building and Distribution

### Build Commands
```bash
# Development
npm start

# Build for Windows
npm run build-win

# Create installer
npm run dist
```

### Output Files
- `dist/` - Distribution packages
- `build/` - Build artifacts
- `*.exe` - Windows executable

## File Format Support

### Excel Files
- `.xlsx` (Excel 2007+)
- `.xls` (Excel 97-2003)
- Auto-detection of column headers
- Flexible naming conventions

### PDF Files
- Text-based PDF parsing
- Tabular data extraction
- Multiple layout formats supported

## Troubleshooting

### License Issues
- Verify machine ID matches
- Check expiry date
- Confirm signature validity
- Contact license provider if needed

### File Processing
- Ensure Excel files are not password protected
- Check PDF files are text-based (not scanned images)
- Verify column headers match expected patterns

### Performance
- Large files may take time to process
- Monitor memory usage with very large datasets
- Consider splitting large operations

## Support

For technical support and licensing inquiries, contact SafeMari support team.

## License

Proprietary - All rights reserved by SafeMari