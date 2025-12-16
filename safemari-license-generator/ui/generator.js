// Simple encryption/decryption for config
class SimpleEncryption {
    static encrypt(text, password) {
        const key = this.generateKey(password);
        let encrypted = '';
        for (let i = 0; i < text.length; i++) {
            encrypted += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return btoa(encrypted);
    }

    static decrypt(encryptedText, password) {
        const key = this.generateKey(password);
        const encrypted = atob(encryptedText);
        let decrypted = '';
        for (let i = 0; i < encrypted.length; i++) {
            decrypted += String.fromCharCode(encrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return decrypted;
    }

    static generateKey(password) {
        let key = '';
        for (let i = 0; i < 256; i++) {
            key += String.fromCharCode((password.charCodeAt(i % password.length) + i) % 256);
        }
        return key;
    }
}

// Configuration management
let config = null;

function loadConfig() {
    const password = document.getElementById('configPassword').value;
    if (!password) {
        showStatus('Please enter master password', 'error');
        return;
    }

    try {
        // Try to load encrypted config from localStorage or create default
        let encryptedConfig = localStorage.getItem('safemari_generator_config');
        
        if (!encryptedConfig) {
            // Create default config
            const defaultConfig = {
                privateKey: generateRandomKey(),
                publicSalt: generateRandomKey(),
                generatedLicenses: [],
                createdAt: new Date().toISOString()
            };
            
            const configJson = JSON.stringify(defaultConfig);
            encryptedConfig = SimpleEncryption.encrypt(configJson, password);
            localStorage.setItem('safemari_generator_config', encryptedConfig);
            
            showStatus('New configuration created successfully', 'success');
        }

        // Decrypt and parse config
        const configJson = SimpleEncryption.decrypt(encryptedConfig, password);
        config = JSON.parse(configJson);
        
        document.getElementById('generatorForm').style.display = 'block';
        showStatus('Configuration loaded successfully', 'success');
        
    } catch (error) {
        showStatus('Invalid password or corrupted configuration', 'error');
        config = null;
    }
}

function generateRandomKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 64; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function toggleDateInput() {
    const type = document.getElementById('licenseType').value;
    const daysGroup = document.getElementById('daysGroup');
    const dateGroup = document.getElementById('dateGroup');
    
    if (type === 'days') {
        daysGroup.style.display = 'block';
        dateGroup.style.display = 'none';
    } else {
        daysGroup.style.display = 'none';
        dateGroup.style.display = 'block';
        
        // Set minimum date to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        document.getElementById('expiryDate').min = tomorrow.toISOString().split('T')[0];
    }
}

function generateLicense() {
    if (!config) {
        showStatus('Please load configuration first', 'error');
        return;
    }

    const machineId = document.getElementById('machineId').value.trim().toUpperCase();
    const licenseType = document.getElementById('licenseType').value;
    const shipName = document.getElementById('shipName').value.trim();
    const notes = document.getElementById('notes').value.trim();

    // Validate machine ID
    if (!machineId || !/^[A-F0-9]{12,16}$/.test(machineId)) {
        showStatus('Machine ID must be 12-16 hex characters', 'error');
        return;
    }

    // Calculate expiry date
    let expiryDate;
    if (licenseType === 'days') {
        const days = parseInt(document.getElementById('days').value);
        if (!days || days < 1) {
            showStatus('Days must be a positive number', 'error');
            return;
        }
        expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + days);
    } else {
        const dateInput = document.getElementById('expiryDate').value;
        if (!dateInput) {
            showStatus('Please select an expiry date', 'error');
            return;
        }
        expiryDate = new Date(dateInput);
        if (expiryDate <= new Date()) {
            showStatus('Expiry date must be in the future', 'error');
            return;
        }
    }

    try {
        // Generate license
        const license = createLicense(machineId, expiryDate, { shipName, notes });
        
        // Save to config
        config.generatedLicenses.push(license);
        saveConfig();
        
        // Display result
        displayLicenseResult(license);
        
    } catch (error) {
        showStatus('License generation failed: ' + error.message, 'error');
    }
}

function createLicense(machineId, expiryDate, metadata) {
    const expiryFormatted = expiryDate.toISOString().split('T')[0].replace(/-/g, '');
    
    // Create HMAC signature using config's private key
    const message = `${machineId}|${expiryFormatted}`;
    const signature = createHMAC(message, config.privateKey).substring(0, 16).toUpperCase();
    
    const licenseCode = `LC-${machineId}-${expiryFormatted}-${signature}`;
    
    return {
        licenseCode,
        machineId,
        expiry: expiryDate.toISOString().split('T')[0],
        expiryFormatted,
        signature,
        generatedAt: new Date().toISOString(),
        ...metadata
    };
}

// Simple HMAC implementation
function createHMAC(message, key) {
    // Simple hash function for demo - in production use crypto.subtle
    let hash = 0;
    const combined = key + message + key;
    for (let i = 0; i < combined.length; i++) {
        const char = combined.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
}

function displayLicenseResult(license) {
    const resultsDiv = document.getElementById('results');
    
    resultsDiv.innerHTML = `
        <div class="result">
            <h3>✅ License Generated Successfully</h3>
            
            <div class="form-group">
                <label>License Code:</label>
                <div class="license-code">
                    ${license.licenseCode}
                    <button class="btn copy-btn" onclick="copyToClipboard('${license.licenseCode}')">Copy</button>
                </div>
            </div>
            
            <div class="form-group">
                <label>Details:</label>
                <ul>
                    <li><strong>Machine ID:</strong> ${license.machineId}</li>
                    <li><strong>Expires:</strong> ${license.expiry}</li>
                    <li><strong>Generated:</strong> ${new Date(license.generatedAt).toLocaleString()}</li>
                    ${license.shipName ? `<li><strong>Ship:</strong> ${license.shipName}</li>` : ''}
                    ${license.notes ? `<li><strong>Notes:</strong> ${license.notes}</li>` : ''}
                </ul>
            </div>
            
            <button class="btn" onclick="downloadLicense('${license.licenseCode}')">📄 Download JSON</button>
        </div>
    `;
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showStatus('License code copied to clipboard', 'success');
    }).catch(() => {
        showStatus('Failed to copy to clipboard', 'error');
    });
}

function downloadLicense(licenseCode) {
    const license = config.generatedLicenses.find(l => l.licenseCode === licenseCode);
    if (!license) return;
    
    const blob = new Blob([JSON.stringify(license, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `license_${license.machineId}_${license.expiryFormatted}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function saveConfig() {
    if (!config) return;
    
    const password = document.getElementById('configPassword').value;
    const configJson = JSON.stringify(config);
    const encryptedConfig = SimpleEncryption.encrypt(configJson, password);
    localStorage.setItem('safemari_generator_config', encryptedConfig);
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('configStatus');
    statusDiv.innerHTML = `<div class="${type}">${message}</div>`;
    setTimeout(() => {
        statusDiv.innerHTML = '';
    }, 3000);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    toggleDateInput();
});