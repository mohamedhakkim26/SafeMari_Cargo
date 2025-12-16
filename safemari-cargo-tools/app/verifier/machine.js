const crypto = require('crypto');
const os = require('os');
const { execSync } = require('child_process');

class MachineID {
    constructor() {
        this.machineId = null;
    }

    /**
     * Generate a stable, non-sensitive hardware fingerprint
     * Combines Windows UUID, Disk serial, Username, MAC hash
     * Returns SHA256 -> first 8 bytes uppercase
     */
    generateMachineID() {
        try {
            const components = [];
            
            // Windows UUID
            try {
                const windowsUUID = execSync('wmic csproduct get uuid', { encoding: 'utf8' })
                    .split('\n')[1]
                    .trim();
                components.push(windowsUUID);
            } catch (error) {
                console.warn('Could not get Windows UUID:', error.message);
                components.push('UNKNOWN_UUID');
            }

            // Disk serial number
            try {
                const diskSerial = execSync('wmic diskdrive get serialnumber', { encoding: 'utf8' })
                    .split('\n')[1]
                    .trim();
                components.push(diskSerial);
            } catch (error) {
                console.warn('Could not get disk serial:', error.message);
                components.push('UNKNOWN_DISK');
            }

            // Username
            const username = os.userInfo().username;
            components.push(username);

            // MAC address hash
            const networkInterfaces = os.networkInterfaces();
            let macAddress = 'UNKNOWN_MAC';
            
            for (const interfaceName in networkInterfaces) {
                const interfaces = networkInterfaces[interfaceName];
                for (const iface of interfaces) {
                    if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
                        macAddress = iface.mac;
                        break;
                    }
                }
                if (macAddress !== 'UNKNOWN_MAC') break;
            }
            
            // Hash the MAC address for privacy
            const macHash = crypto.createHash('sha256').update(macAddress).digest('hex').substring(0, 12);
            components.push(macHash);

            // Combine all components and create final machine ID
            const combinedString = components.join('|');
            const hash = crypto.createHash('sha256').update(combinedString).digest('hex');
            
            // Take first 8 bytes and convert to uppercase
            this.machineId = hash.substring(0, 16).toUpperCase();
            
            return this.machineId;
        } catch (error) {
            console.error('Error generating machine ID:', error);
            // Fallback to a deterministic ID based on hostname and username
            const fallback = os.hostname() + '|' + os.userInfo().username;
            const fallbackHash = crypto.createHash('sha256').update(fallback).digest('hex');
            this.machineId = fallbackHash.substring(0, 16).toUpperCase();
            return this.machineId;
        }
    }

    /**
     * Get cached machine ID or generate if not exists
     */
    getMachineID() {
        if (!this.machineId) {
            this.generateMachineID();
        }
        return this.machineId;
    }

    /**
     * Validate that current machine matches stored machine ID
     */
    validateMachineID(storedMachineId) {
        const currentMachineId = this.getMachineID();
        return currentMachineId === storedMachineId;
    }
}

module.exports = MachineID;