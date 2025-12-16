const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class HMACSigner {
    constructor() {
        this.configPath = path.join(__dirname, 'config', 'private_secret.json');
        this.privateSecret = this.loadPrivateSecret();
    }

    loadPrivateSecret() {
        try {
            if (!fs.existsSync(this.configPath)) {
                throw new Error(`Private secret not found at: ${this.configPath}`);
            }
            
            const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
            
            if (!config.private_secret) {
                throw new Error('private_secret not found in configuration');
            }
            
            return config.private_secret;
            
        } catch (error) {
            throw new Error(`Failed to load private secret: ${error.message}`);
        }
    }

    /**
     * Sign license data using HMAC-SHA256
     * @param {string} machineId - Machine identifier
     * @param {string} expiry - Expiry date in YYYYMMDD format
     * @returns {string} HMAC signature (first 12 characters, uppercase)
     */
    signLicense(machineId, expiry) {
        try {
            // Create the data string: machineId|expiry
            const data = `${machineId.toUpperCase()}|${expiry}`;
            
            // Generate HMAC-SHA256 signature
            const signature = crypto
                .createHmac('sha256', this.privateSecret)
                .update(data)
                .digest('hex');
            
            // Return first 12 characters, uppercase
            const shortSignature = signature.substring(0, 12).toUpperCase();
            
            console.log(`Signing data: ${data}`);
            console.log(`Full signature: ${signature}`);
            console.log(`Short signature: ${shortSignature}`);
            
            return shortSignature;
            
        } catch (error) {
            throw new Error(`HMAC signing failed: ${error.message}`);
        }
    }

    /**
     * Verify a signature (for testing purposes)
     * @param {string} machineId - Machine identifier
     * @param {string} expiry - Expiry date in YYYYMMDD format
     * @param {string} signature - Signature to verify
     * @returns {boolean} True if signature is valid
     */
    verifySignature(machineId, expiry, signature) {
        const expectedSignature = this.signLicense(machineId, expiry);
        return signature.toUpperCase() === expectedSignature;
    }
}

module.exports = HMACSigner;