const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const MachineID = require('./machine.js');
const publicSalt = require('./publicSalt.json');

class LicenseChecker {
    constructor() {
        this.machineIdGenerator = new MachineID();
        this.licenseDir = path.join(os.homedir(), 'AppData', 'Local', 'SafemariCargoTools');
        this.licensePath = path.join(this.licenseDir, 'license.json');
        this.isLicensed = false;
        this.licenseData = null;
        
        // Auto-restore license state on initialization
        this.restoreLicenseState();
    }

    /**
     * Ensure license directory exists
     */
    ensureLicenseDirectory() {
        if (!fs.existsSync(this.licenseDir)) {
            fs.mkdirSync(this.licenseDir, { recursive: true });
        }
    }

    /**
     * Parse license code in format: LC-<MID>-<YYYYMMDD>-<SIG>
     */
    parseLicenseCode(licenseCode) {
        const parts = licenseCode.split('-');
        if (parts.length !== 4 || parts[0] !== 'LC') {
            throw new Error('Invalid license format. Expected: LC-<MID>-<YYYYMMDD>-<SIG>');
        }

        return {
            prefix: parts[0],
            machineId: parts[1],
            expiry: parts[2],
            signature: parts[3]
        };
    }

    /**
     * Verify license signature using public salt
     */
    verifyLicenseSignature(machineId, expiry, signature) {
        try {
            const message = `${machineId}|${expiry}`;
            const expectedSignature = crypto
                .createHmac('sha256', publicSalt.salt)
                .update(message)
                .digest('hex')
                .substring(0, signature.length)
                .toUpperCase();

            return signature.toUpperCase() === expectedSignature;
        } catch (error) {
            console.error('Error verifying signature:', error);
            return false;
        }
    }

    /**
     * Validate expiry date
     */
    isLicenseExpired(expiryString) {
        try {
            const year = parseInt(expiryString.substring(0, 4));
            const month = parseInt(expiryString.substring(4, 6)) - 1; // JS months are 0-indexed
            const day = parseInt(expiryString.substring(6, 8));
            
            const expiryDate = new Date(year, month, day, 23, 59, 59); // End of expiry day
            const currentDate = new Date();
            
            return currentDate > expiryDate;
        } catch (error) {
            console.error('Error parsing expiry date:', error);
            return true; // Assume expired if can't parse
        }
    }

    /**
     * Get days remaining until expiry
     */
    getDaysRemaining(expiryString) {
        try {
            const year = parseInt(expiryString.substring(0, 4));
            const month = parseInt(expiryString.substring(4, 6)) - 1;
            const day = parseInt(expiryString.substring(6, 8));
            
            const expiryDate = new Date(year, month, day, 23, 59, 59);
            const currentDate = new Date();
            
            const diffTime = expiryDate - currentDate;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            return Math.max(0, diffDays);
        } catch (error) {
            console.error('Error calculating days remaining:', error);
            return 0;
        }
    }

    /**
     * Save license to local storage
     */
    saveLicense(licenseCode) {
        try {
            const parsed = this.parseLicenseCode(licenseCode);
            
            this.ensureLicenseDirectory();
            
            const licenseData = {
                machine_id: parsed.machineId,
                expiry: `${parsed.expiry.substring(0, 4)}-${parsed.expiry.substring(4, 6)}-${parsed.expiry.substring(6, 8)}`,
                signature: parsed.signature,
                activated_date: new Date().toISOString().split('T')[0],
                license_code: licenseCode
            };

            fs.writeFileSync(this.licensePath, JSON.stringify(licenseData, null, 2));
            
            // Immediately update in-memory state
            this.isLicensed = true;
            this.licenseData = licenseData;
            
            console.log('License saved and state updated successfully');
            
            return true;
        } catch (error) {
            console.error('Error saving license:', error);
            return false;
        }
    }

    /**
     * Load license from local storage
     */
    loadLicense() {
        try {
            if (!fs.existsSync(this.licensePath)) {
                return null;
            }

            const licenseJson = fs.readFileSync(this.licensePath, 'utf8');
            return JSON.parse(licenseJson);
        } catch (error) {
            console.error('Error loading license:', error);
            return null;
        }
    }

    /**
     * Validate current license
     */
    validateLicense() {
        try {
            const licenseData = this.loadLicense();
            
            if (!licenseData) {
                return { isValid: false, reason: 'No license found' };
            }

            const currentMachineId = this.machineIdGenerator.getMachineID();
            
            // Check machine ID matches
            if (licenseData.machine_id !== currentMachineId) {
                return { 
                    isValid: false, 
                    reason: 'License not valid for this machine',
                    currentMachineId: currentMachineId,
                    licenseMachineId: licenseData.machine_id
                };
            }

            // Convert date format for expiry check
            const expiryForCheck = licenseData.expiry.replace(/-/g, '');
            
            // Check expiry
            if (this.isLicenseExpired(expiryForCheck)) {
                return { 
                    isValid: false, 
                    reason: 'License expired',
                    expiry: licenseData.expiry
                };
            }

            // Verify signature
            if (!this.verifyLicenseSignature(currentMachineId, expiryForCheck, licenseData.signature)) {
                return { 
                    isValid: false, 
                    reason: 'Invalid license signature'
                };
            }

            const daysRemaining = this.getDaysRemaining(expiryForCheck);
            
            this.isLicensed = true;
            this.licenseData = licenseData;
            
            return { 
                isValid: true, 
                daysRemaining: daysRemaining,
                expiry: licenseData.expiry,
                machineId: currentMachineId
            };

        } catch (error) {
            console.error('Error validating license:', error);
            return { 
                isValid: false, 
                reason: 'License validation error: ' + error.message
            };
        }
    }

    /**
     * Activate license with provided license code
     */
    activateLicense(licenseCode) {
        try {
            const parsed = this.parseLicenseCode(licenseCode);
            const currentMachineId = this.machineIdGenerator.getMachineID();
            
            // Verify machine ID in license matches current machine
            if (parsed.machineId !== currentMachineId) {
                return {
                    success: false,
                    reason: 'License not valid for this machine',
                    currentMachineId: currentMachineId,
                    licenseMachineId: parsed.machineId
                };
            }

            // Check expiry
            if (this.isLicenseExpired(parsed.expiry)) {
                return {
                    success: false,
                    reason: 'License is expired',
                    expiry: parsed.expiry
                };
            }

            // Verify signature
            if (!this.verifyLicenseSignature(parsed.machineId, parsed.expiry, parsed.signature)) {
                return {
                    success: false,
                    reason: 'Invalid license signature'
                };
            }

            // Save license
            if (this.saveLicense(licenseCode)) {
                this.isLicensed = true;
                return {
                    success: true,
                    daysRemaining: this.getDaysRemaining(parsed.expiry),
                    expiry: `${parsed.expiry.substring(0, 4)}-${parsed.expiry.substring(4, 6)}-${parsed.expiry.substring(6, 8)}`
                };
            } else {
                return {
                    success: false,
                    reason: 'Failed to save license'
                };
            }

        } catch (error) {
            console.error('Error activating license:', error);
            return {
                success: false,
                reason: 'License activation error: ' + error.message
            };
        }
    }

    /**
     * Get current license status
     */
    getLicenseStatus() {
        return {
            isLicensed: this.isLicensed,
            machineId: this.machineIdGenerator.getMachineID(),
            licenseData: this.licenseData
        };
    }

    /**
     * Restore license state from saved file on startup
     */
    restoreLicenseState() {
        try {
            const savedLicense = this.loadLicense();
            
            if (savedLicense) {
                const validation = this.validateLicense();
                
                if (validation.isValid) {
                    this.isLicensed = true;
                    this.licenseData = savedLicense;
                    console.log('License state restored successfully');
                } else {
                    console.log('Saved license is invalid, clearing state');
                    this.isLicensed = false;
                    this.licenseData = null;
                }
            } else {
                this.isLicensed = false;
                this.licenseData = null;
            }
        } catch (error) {
            console.error('Error restoring license state:', error);
            this.isLicensed = false;
            this.licenseData = null;
        }
    }

    /**
     * Remove license (for testing or license reset)
     */
    removeLicense() {
        try {
            if (fs.existsSync(this.licensePath)) {
                fs.unlinkSync(this.licensePath);
                this.isLicensed = false;
                this.licenseData = null;
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error removing license:', error);
            return false;
        }
    }
}

module.exports = LicenseChecker;