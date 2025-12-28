/**
 * License Management Script
 * Handles license activation and validation UI
 */

async function initializeLicenseCheck() {
    const loadingScreen = document.getElementById('loadingScreen');
    const licenseModal = document.getElementById('licenseModal');
    const appContainer = document.getElementById('appContainer');

    try {
        // Get machine ID
        const machineIdResult = await window.safeMariAPI.getMachineId();
        if (machineIdResult.success) {
            document.getElementById('machineId').textContent = machineIdResult.machineId;
        }

        // Check license status
        const licenseResult = await window.safeMariAPI.checkLicense();
        
        if (licenseResult.success && licenseResult.isValid) {
            // License is valid - show main app
            await updateLicenseDisplay(licenseResult);
            showMainApp();
        } else {
            // License is not valid - show license modal
            hideLoadingScreen();
            showLicenseModal();
        }

        // Setup license modal handlers
        setupLicenseModalHandlers();
        
    } catch (error) {
        console.error('License check failed:', error);
        hideLoadingScreen();
        showError('Failed to check license: ' + error.message);
    }

    function showMainApp() {
        hideLoadingScreen();
        hideLicenseModal();
        appContainer.style.display = 'block';
    }

    function showLicenseModal() {
        licenseModal.style.display = 'flex';
    }

    function hideLicenseModal() {
        licenseModal.style.display = 'none';
    }

    function hideLoadingScreen() {
        loadingScreen.style.display = 'none';
    }
}

function setupLicenseModalHandlers() {
    // Close modal button
    const closeBtn = document.getElementById('closeLicenseModal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('licenseModal').style.display = 'none';
        });
    }

    // Copy Machine ID button
    const copyBtn = document.getElementById('copyMachineId');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            const machineId = document.getElementById('machineId').textContent;
            try {
                await navigator.clipboard.writeText(machineId);
                showTemporaryMessage(copyBtn, 'Copied!');
            } catch (error) {
                console.error('Failed to copy:', error);
                // Fallback for older browsers
                selectText(document.getElementById('machineId'));
            }
        });
    }

    // Activate License button
    const activateBtn = document.getElementById('activateLicense');
    const licenseInput = document.getElementById('licenseCodeInput');
    
    if (activateBtn && licenseInput) {
        activateBtn.addEventListener('click', async () => {
            await activateLicense();
        });

        licenseInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                await activateLicense();
            }
        });

        licenseInput.addEventListener('input', () => {
            clearMessages();
            activateBtn.disabled = licenseInput.value.trim().length < 10;
        });
    }
}

async function activateLicense() {
    const licenseInput = document.getElementById('licenseCodeInput');
    const activateBtn = document.getElementById('activateLicense');
    const licenseCode = licenseInput.value.trim();

    if (!licenseCode) {
        showLicenseError('Please enter a license code');
        return;
    }

    // Validate license format
    if (!licenseCode.match(/^LC-[A-F0-9]{12,16}-\d{8}-[A-F0-9]{12,16}$/i)) {
        showLicenseError('Invalid license format. Expected: LC-XXXXXXXX-YYYYMMDD-XXXXXXXXXXXX');
        return;
    }

    activateBtn.disabled = true;
    activateBtn.textContent = 'Activating...';
    clearMessages();

    try {
        const result = await window.safeMariAPI.activateLicense(licenseCode);
        
        if (result.success) {
            showLicenseSuccess(`License activated successfully! Valid until ${result.expiry}. (${result.daysRemaining} days remaining)`);
            
            // Wait a moment then switch to main app
            setTimeout(async () => {
                await updateLicenseDisplay(result);
                document.getElementById('appContainer').style.display = 'block';
                document.getElementById('licenseModal').style.display = 'none';
            }, 2000);
        } else {
            showLicenseError(result.reason || 'License activation failed');
        }
    } catch (error) {
        console.error('License activation error:', error);
        showLicenseError('License activation failed: ' + error.message);
    } finally {
        activateBtn.disabled = false;
        activateBtn.textContent = 'Activate';
    }
}

async function updateLicenseDisplay(licenseInfo) {
    const statusElement = document.getElementById('licenseStatus');
    const expiryElement = document.getElementById('licenseExpiry');

    if (statusElement) {
        if (licenseInfo.isValid || licenseInfo.success) {
            statusElement.textContent = 'Licensed';
            statusElement.className = 'license-indicator';
            
            if (expiryElement) {
                const expiry = licenseInfo.expiry || (licenseInfo.validation && licenseInfo.validation.expiry);
                const daysRemaining = licenseInfo.daysRemaining || (licenseInfo.validation && licenseInfo.validation.daysRemaining);
                
                if (expiry) {
                    expiryElement.textContent = `Expires: ${expiry}`;
                    
                    if (daysRemaining !== undefined) {
                        if (daysRemaining <= 7) {
                            expiryElement.style.color = '#dc3545'; // Red warning
                            expiryElement.textContent += ` (${daysRemaining} days left)`;
                        } else {
                            expiryElement.textContent += ` (${daysRemaining} days remaining)`;
                        }
                    }
                }
            }
        } else {
            statusElement.textContent = 'Unlicensed';
            statusElement.className = 'license-indicator expired';
            if (expiryElement) {
                expiryElement.textContent = 'License required';
            }
        }
    }
}

function showLicenseError(message) {
    const errorElement = document.getElementById('licenseError');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

function showLicenseSuccess(message) {
    const successElement = document.getElementById('licenseSuccess');
    if (successElement) {
        successElement.textContent = message;
        successElement.style.display = 'block';
    }
}

function clearMessages() {
    const errorElement = document.getElementById('licenseError');
    const successElement = document.getElementById('licenseSuccess');
    
    if (errorElement) {
        errorElement.style.display = 'none';
        errorElement.textContent = '';
    }
    
    if (successElement) {
        successElement.style.display = 'none';
        successElement.textContent = '';
    }
}

function showTemporaryMessage(element, message) {
    const originalText = element.textContent;
    element.textContent = message;
    element.disabled = true;
    
    setTimeout(() => {
        element.textContent = originalText;
        element.disabled = false;
    }, 2000);
}

function selectText(element) {
    if (document.body.createTextRange) {
        const range = document.body.createTextRange();
        range.moveToElementText(element);
        range.select();
    } else if (window.getSelection) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
    }
}

// Export functions for global access
window.licenseManager = {
    initializeLicenseCheck,
    setupLicenseModalHandlers,
    activateLicense,
    updateLicenseDisplay,
    showLicenseError,
    showLicenseSuccess,
    clearMessages
};