const HMACSigner = require('./hmac_signer');
const fs = require('fs');
const path = require('path');

class LicenseGenerator {
    constructor() {
        this.signer = new HMACSigner();
        this.outputDir = path.join(__dirname, '..', 'output');
        this.ensureOutputDirectory();
    }

    ensureOutputDirectory() {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Generate license with expiry date
     * @param {string} machineId - Machine ID from ship
     * @param {string} expiry - Expiry date in YYYY-MM-DD format
     * @param {object} options - Optional metadata (ship name, notes)
     * @returns {object} Generated license information
     */
    generateLicense(machineId, expiry, options = {}) {
        try {
            // Validate inputs
            this.validateMachineId(machineId);
            this.validateExpiryDate(expiry);

            // Convert expiry to YYYYMMDD format
            const expiryFormatted = expiry.replace(/-/g, '');
            
            // Generate HMAC signature
            const signature = this.signer.signLicense(machineId, expiryFormatted);
            
            // Format final license
            const licenseCode = `LC-${machineId.toUpperCase()}-${expiryFormatted}-${signature}`;
            
            const result = {
                licenseCode: licenseCode,
                machineId: machineId.toUpperCase(),
                expiry: expiry,
                expiryFormatted: expiryFormatted,
                signature: signature,
                generatedAt: new Date().toISOString(),
                ...options
            };

            // Save to output directory
            this.saveToOutput(result);
            
            return result;
            
        } catch (error) {
            throw new Error(`License generation failed: ${error.message}`);
        }
    }

    /**
     * Generate license with days offset
     * @param {string} machineId - Machine ID from ship
     * @param {number} days - Number of days from today
     * @param {object} options - Optional metadata
     * @returns {object} Generated license information
     */
    generateLicenseWithDays(machineId, days, options = {}) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + days);
        
        const expiry = expiryDate.toISOString().split('T')[0];
        return this.generateLicense(machineId, expiry, options);
    }

    validateMachineId(machineId) {
        if (!machineId || typeof machineId !== 'string') {
            throw new Error('Machine ID is required and must be a string');
        }
        
        // Machine ID should be 12-16 hex characters
        if (!/^[A-F0-9]{12,16}$/i.test(machineId)) {
            throw new Error('Machine ID must be 12-16 hex characters');
        }
    }

    validateExpiryDate(expiry) {
        if (!expiry || typeof expiry !== 'string') {
            throw new Error('Expiry date is required and must be a string');
        }
        
        // Validate YYYY-MM-DD format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
            throw new Error('Expiry date must be in YYYY-MM-DD format');
        }
        
        const expiryDate = new Date(expiry);
        const today = new Date();
        
        if (expiryDate <= today) {
            throw new Error('Expiry date must be in the future');
        }
    }

    saveToOutput(licenseInfo) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `license_${licenseInfo.machineId}_${timestamp}.json`;
        const filepath = path.join(this.outputDir, filename);
        
        fs.writeFileSync(filepath, JSON.stringify(licenseInfo, null, 2));
        console.log(`License saved to: ${filepath}`);
    }
}

module.exports = LicenseGenerator;