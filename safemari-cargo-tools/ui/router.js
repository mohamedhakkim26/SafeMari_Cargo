/**
 * UI Router for SafeMari Cargo Tools
 * Handles view navigation and content rendering
 */
class Router {
    constructor() {
        this.viewContainer = document.querySelector('.view-container');
        this.navLinks = document.querySelectorAll('.nav-link');
        this.currentView = 'welcome';
        this.selectedFiles = {};
        this.viewStates = {}; // Store view states
        
        this.initializeRouter();
    }

    initializeRouter() {
        // Bind navigation clicks
        this.navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const viewName = link.getAttribute('data-view');
                this.navigate(viewName);
            });
        });

        // Initialize with welcome view
        this.showWelcome();
    }

    async navigate(viewName) {
        // Check if view requires license
        if (this.requiresLicense(viewName)) {
            const licenseStatus = await window.safeMariAPI.checkLicenseForOperation();
            if (!licenseStatus.isLicensed) {
                alert('This feature requires a valid license. Please activate your license first.');
                return;
            }
        }

        // Save current view state before navigating
        if (this.currentView && this.currentView !== 'welcome') {
            this.saveViewState(this.currentView);
        }

        // Update navigation state
        this.updateNavigation(viewName);
        
        // Load and display view
        try {
            this.currentView = viewName;
            await this.loadView(viewName);
            
            // Restore view state if available
            if (this.viewStates[viewName]) {
                this.restoreViewState(viewName);
            }
        } catch (error) {
            console.error('Failed to load view:', error);
            this.showError('Failed to load view: ' + error.message);
        }
    }

    updateNavigation(viewName) {
        // Remove active class from all nav links
        this.navLinks.forEach(link => {
            link.classList.remove('active');
        });

        // Add active class to current nav link
        const activeLink = document.querySelector(`[data-view="${viewName}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }
    }

    async loadView(viewName) {
        const views = {
            'welcome': this.showWelcome,
            'reefer-temp': this.showReeferTemp,
            'ct-stowage': this.showCTStowage,
            'dg-checker': this.showDGChecker,
            'list-compare': this.showListCompare,
            'logs': this.showLogs,
            'settings': this.showSettings,
            'license-info': this.showLicenseInfo,
            'about': this.showAbout
        };

        const viewFunction = views[viewName];
        if (viewFunction) {
            await viewFunction.call(this);
        } else {
            this.showError('View not found: ' + viewName);
        }
    }

    requiresLicense(viewName) {
        const licensedViews = ['reefer-temp', 'ct-stowage', 'dg-checker', 'list-compare'];
        return licensedViews.includes(viewName);
    }

    async showWelcome() {
        this.viewContainer.innerHTML = `
            <div class="welcome-screen">
                <h2>Welcome to SafeMari Cargo Tools</h2>
                <p>Select a tool from the sidebar to get started.</p>
                
                <div class="feature-cards">
                    <div class="feature-card" data-view="reefer-temp">
                        <h3>Reefer Temperature Checker</h3>
                        <p>Compare set temperatures with manifest temperatures</p>
                    </div>
                    <div class="feature-card" data-view="ct-stowage">
                        <h3>CT Stowage Sorter</h3>
                        <p>Sort reefer containers into CT monitoring blocks</p>
                    </div>
                    <div class="feature-card" data-view="dg-checker">
                        <h3>DG Manifest Checker</h3>
                        <p>Validate dangerous goods between PDF and Excel</p>
                    </div>
                    <div class="feature-card" data-view="list-compare">
                        <h3>List Reconciliation</h3>
                        <p>Compare two container lists for differences</p>
                    </div>
                </div>
            </div>
        `;
        
        this.bindFeatureCards();
    }

    showReeferTemp() {
        this.viewContainer.innerHTML = `
            <div class="view-content">
                <h2>Reefer Temperature Checker</h2>
                <p>Compare set temperatures from check sheets with actual temperatures from manifests.</p>
                
                <div class="file-inputs">
                    <div class="form-group">
                        <label>CHECK File (Set Temperatures)</label>
                        <div class="drop-zone" data-file-type="check-file">
                            <div class="drop-zone-content">
                                <h4>Drop CHECK file here</h4>
                                <p>or <button type="button" class="btn-secondary">Browse Files</button></p>
                                <p>Supported formats: Excel (.xlsx, .xls), PDF (.pdf), Word (.docx, .doc)</p>
                                <p style="font-size: 12px; color: #64748b; margin-top: 8px;">Should contain container IDs and set temperatures</p>
                            </div>
                        </div>
                        <div class="file-info" id="checkFileInfo" style="display: none;"></div>
                    </div>

                    <div class="form-group">
                        <label>MANIFEST File (Actual Temperatures)</label>
                        <div class="drop-zone" data-file-type="manifest-file">
                            <div class="drop-zone-content">
                                <h4>Drop MANIFEST file here</h4>
                                <p>or <button type="button" class="btn-secondary">Browse Files</button></p>
                                <p>Supported formats: Excel (.xlsx, .xls), PDF (.pdf), Word (.docx, .doc)</p>
                                <p style="font-size: 12px; color: #64748b; margin-top: 8px;">Should contain container IDs and actual temperatures</p>
                            </div>
                        </div>
                        <div class="file-info" id="manifestFileInfo" style="display: none;"></div>
                    </div>
                </div>

                <div class="actions">
                    <button id="processReeferBtn" class="btn-primary" disabled>Process Temperature Check</button>
                </div>

                <div id="reeferResults" style="display: none;"></div>
            </div>
        `;
        
        this.initializeReeferTemp();
    }

    showCTStowage() {
        this.viewContainer.innerHTML = `
            <div class="view-content">
                <h2>CT Reefer Stowage Sorter</h2>
                <p>Sort reefer containers into CT monitoring blocks using injection rules.</p>
                
                <div class="file-inputs">
                    <div class="form-group">
                        <label>Full Reefer List (Stowage + Container ID)</label>
                        <div class="drop-zone" data-file-type="reefer-list">
                            <div class="drop-zone-content">
                                <h4>Drop Reefer List file here</h4>
                                <p>or <button type="button" class="btn-secondary">Browse Files</button></p>
                                <p>Supported formats: Excel (.xlsx, .xls), PDF (.pdf), Word (.docx, .doc)</p>
                                <p style="font-size: 12px; color: #64748b; margin-top: 8px;">Should contain container IDs and stowage positions</p>
                            </div>
                        </div>
                        <div class="file-info" id="reeferListFileInfo" style="display: none;"></div>
                    </div>

                    <div class="form-group">
                        <label>CT Monitoring Sheet (Multi-row blocks)</label>
                        <div class="drop-zone" data-file-type="ct-sheet">
                            <div class="drop-zone-content">
                                <h4>Drop CT Monitoring file here</h4>
                                <p>or <button type="button" class="btn-secondary">Browse Files</button></p>
                                <p>Supported formats: Excel (.xlsx, .xls), PDF (.pdf), Word (.docx, .doc)</p>
                                <p style="font-size: 12px; color: #64748b; margin-top: 8px;">Should contain CT monitoring blocks with container IDs</p>
                            </div>
                        </div>
                        <div class="file-info" id="ctSheetFileInfo" style="display: none;"></div>
                    </div>
                </div>

                <div class="actions">
                    <button id="processCTBtn" class="btn-primary" disabled>Process CT Stowage</button>
                </div>

                <div id="ctResults" style="display: none;"></div>
            </div>
        `;
        
        this.initializeCTStowage();
    }

    showDGChecker() {
        this.viewContainer.innerHTML = `
            <div class="view-content">
                <h2>DG Manifest Checker</h2>
                <p>Validate dangerous goods between manifest and stowage files.</p>
                
                <div class="file-inputs">
                    <div class="form-group">
                        <label>DG Manifest File</label>
                        <div class="drop-zone" data-file-type="dg-manifest">
                            <div class="drop-zone-content">
                                <h4>Drop DG Manifest file here</h4>
                                <p>or <button type="button" class="btn-secondary">Browse Files</button></p>
                                <p>Supported formats: Excel (.xlsx, .xls), PDF (.pdf), Word (.docx, .doc)</p>
                                <p style="font-size: 12px; color: #64748b; margin-top: 8px;">Should contain dangerous goods information with UN numbers and classes</p>
                            </div>
                        </div>
                        <div class="file-info" id="dgManifestFileInfo" style="display: none;"></div>
                    </div>

                    <div class="form-group">
                        <label>DG Stowage File</label>
                        <div class="drop-zone" data-file-type="dg-stowage">
                            <div class="drop-zone-content">
                                <h4>Drop DG Stowage file here</h4>
                                <p>or <button type="button" class="btn-secondary">Browse Files</button></p>
                                <p>Supported formats: Excel (.xlsx, .xls), PDF (.pdf), Word (.docx, .doc)</p>
                                <p style="font-size: 12px; color: #64748b; margin-top: 8px;">Should contain stowage positions and DG classifications</p>
                            </div>
                        </div>
                        <div class="file-info" id="dgStowageFileInfo" style="display: none;"></div>
                    </div>
                </div>

                <div class="actions">
                    <button id="processDGBtn" class="btn-primary" disabled>Process DG Check</button>
                </div>

                <div id="dgResults" style="display: none;"></div>
            </div>
        `;
        
        this.initializeDGChecker();
    }

    showListCompare() {
        this.viewContainer.innerHTML = `
            <div class="view-content">
                <h2>List Reconciliation</h2>
                <p>Compare two container lists to identify common containers, unique entries, and data differences.</p>
                
                <div class="file-inputs">
                    <div class="form-group">
                        <label>Container List A (Primary List)</label>
                        <div class="drop-zone" data-file-type="list-a">
                            <div class="drop-zone-content">
                                <h4>Drop first container list here</h4>
                                <p>or <button type="button" class="btn-secondary">Browse Files</button></p>
                                <p>Supported formats: Excel (.xlsx, .xls), PDF (.pdf), Word (.docx, .doc)</p>
                                <p style="font-size: 12px; color: #64748b; margin-top: 8px;">Should contain container IDs in columns like "Container ID", "CNTR", etc.</p>
                            </div>
                        </div>
                        <div class="file-info" id="listAFileInfo" style="display: none;"></div>
                    </div>

                    <div class="form-group">
                        <label>Container List B (Comparison List)</label>
                        <div class="drop-zone" data-file-type="list-b">
                            <div class="drop-zone-content">
                                <h4>Drop second container list here</h4>
                                <p>or <button type="button" class="btn-secondary">Browse Files</button></p>
                                <p>Supported formats: Excel (.xlsx, .xls), PDF (.pdf), Word (.docx, .doc)</p>
                                <p style="font-size: 12px; color: #64748b; margin-top: 8px;">Should contain container IDs in similar format to List A</p>
                            </div>
                        </div>
                        <div class="file-info" id="listBFileInfo" style="display: none;"></div>
                    </div>
                </div>

                <div class="actions">
                    <button id="processCompareBtn" class="btn-primary" disabled>Process List Reconciliation</button>
                </div>

                <div id="compareResults" style="display: none;"></div>
            </div>
        `;
        
        this.initializeListCompare();
    }

    async showLogs() {
        this.viewContainer.innerHTML = `
            <div class="view-content">
                <h2>Operation History</h2>
                <p>View logs of all cargo operations and export history data.</p>
                
                <div class="logs-controls">
                    <div class="filter-section">
                        <h3>Filter Logs</h3>
                        <div class="filter-controls">
                            <div class="filter-group">
                                <label>Module:</label>
                                <select id="moduleFilter">
                                    <option value="">All Modules</option>
                                    <option value="reefer">Temperature Checker</option>
                                    <option value="ct">CT Stowage</option>
                                    <option value="dg">DG Checker</option>
                                    <option value="compare">List Compare</option>
                                </select>
                            </div>
                            
                            <div class="filter-group">
                                <label>Start Date:</label>
                                <input type="date" id="startDate">
                            </div>
                            
                            <div class="filter-group">
                                <label>End Date:</label>
                                <input type="date" id="endDate">
                            </div>
                            
                            <button onclick="router.loadLogs()" class="btn-secondary">Apply Filters</button>
                            <button onclick="router.exportLogsData()" class="btn-primary">Export Logs</button>
                        </div>
                    </div>
                </div>

                <div class="logs-display">
                    <div id="logsTable">Loading logs...</div>
                </div>
            </div>
        `;
        
        await this.initializeLogs();
    }

    showSettings() {
        this.viewContainer.innerHTML = `
            <div class="view-content">
                <h2>Settings</h2>
                <p>Configure application preferences and settings.</p>
                
                <div class="settings-content">
                    <div class="setting-section">
                        <h3>Export Settings</h3>
                        <label>Default Export Format:</label>
                        <select id="exportFormat">
                            <option value="xlsx">Excel (.xlsx)</option>
                            <option value="csv">CSV (.csv)</option>
                        </select>
                    </div>
                    
                    <div class="setting-section">
                        <h3>Processing Settings</h3>
                        <label>
                            <input type="checkbox" id="verboseLogging"> Enable Verbose Logging
                        </label>
                        <label>
                            <input type="checkbox" id="autoSaveResults"> Auto-save Results
                        </label>
                    </div>
                    
                    <div class="setting-section">
                        <button id="saveSettings" class="btn-primary">Save Settings</button>
                        <button id="resetSettings" class="btn-secondary">Reset to Defaults</button>
                    </div>
                </div>
            </div>
        `;
        
        this.initializeSettings();
    }

    async showLicenseInfo() {
        this.viewContainer.innerHTML = `
            <div class="view-content">
                <div class="view-header">
                    <h2>License Information</h2>
                    <button id="closeLicenseInfo" class="btn-secondary">Close</button>
                </div>
                <p>View license details and activation status.</p>
                
                <div class="license-content">
                    <div class="info-section">
                        <h3>Current License Status</h3>
                        <div id="licenseStatusInfo">Loading...</div>
                        
                        <button id="showLicenseModal" class="btn-primary">Manage License</button>
                    </div>
                    
                    <div class="info-section">
                        <h3>Application Information</h3>
                        <div id="appInfoDetails">Loading...</div>
                    </div>
                </div>
            </div>
        `;
        
        await this.initializeLicenseInfo();
    }

    showAbout() {
        this.viewContainer.innerHTML = `
            <div class="view-content">
                <h2>About SafeMari Cargo Tools</h2>
                <div class="about-content">
                    <div class="info-section">
                        <h3>Application Details</h3>
                        <p><strong>Version:</strong> 1.0.0</p>
                        <p><strong>Description:</strong> Professional cargo operations management tools</p>
                        
                        <h3>Features</h3>
                        <ul>
                            <li>Reefer Temperature Validation</li>
                            <li>CT Stowage Optimization</li>
                            <li>DG Manifest Validation</li>
                            <li>List Reconciliation</li>
                            <li>Advanced Pattern Recognition</li>
                            <li>Comprehensive Logging</li>
                        </ul>
                        
                        <h3>Support & Contact</h3>
                        <div style="background: #f0f9ff; padding: 16px; border-radius: 8px; border-left: 4px solid #2563eb; margin: 16px 0;">
                            <div style="margin-bottom: 12px;">
                                <strong>WhatsApp Business Support:</strong>
                            </div>
                            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                                <span style="font-family: monospace; font-size: 16px; font-weight: bold; color: #2563eb;">+91 93450 05036</span>
                                <button onclick="window.safeMariAPI.openExternal('https://wa.me/919345005036')" style="background: #25D366; color: white; padding: 8px 16px; border: none; border-radius: 20px; cursor: pointer; font-size: 14px; font-weight: bold;">
                                    Chat on WhatsApp
                                </button>
                            </div>
                            <div style="font-size: 13px; color: #64748b;">
                                For technical support, licensing inquiries, and product assistance
                            </div>
                        </div>
                        
                        <p style="margin-top: 20px; color: #64748b; font-size: 14px;">
                            SafeMari Cargo Tools - Streamlining maritime cargo operations with intelligent automation
                        </p>
                    </div>
                </div>
            </div>
        `;
    }

    initializeReeferTemp() {
        console.log('Reefer Temp view initialized');
        
        // Initialize unified file upload handlers
        this.initializeFileUpload('check-file', ['xlsx', 'xls', 'pdf', 'docx', 'doc']);
        this.initializeFileUpload('manifest-file', ['xlsx', 'xls', 'pdf', 'docx', 'doc']);
        
        // Initialize process button
        const processBtn = document.getElementById('processReeferBtn');
        if (processBtn) {
            processBtn.addEventListener('click', () => this.processReeferCheck());
        }
        
        this.updateProcessButton();
    }

    initializeCTStowage() {
        console.log('CT Stowage view initialized');
        
        // Initialize unified file upload handlers
        this.initializeFileUpload('reefer-list', ['xlsx', 'xls', 'pdf', 'docx', 'doc']);
        this.initializeFileUpload('ct-sheet', ['xlsx', 'xls', 'pdf', 'docx', 'doc']);
        
        // Initialize process button
        const processBtn = document.getElementById('processCTBtn');
        if (processBtn) {
            processBtn.addEventListener('click', () => this.processCTStowage());
        }
    }

    initializeDGChecker() {
        console.log('DG Checker view initialized');
        
        // Initialize unified file upload handlers
        this.initializeFileUpload('dg-manifest', ['xlsx', 'xls', 'pdf', 'docx', 'doc']);
        this.initializeFileUpload('dg-stowage', ['xlsx', 'xls', 'pdf', 'docx', 'doc']);
        
        const processBtn = document.getElementById('processDGBtn');
        if (processBtn) {
            processBtn.addEventListener('click', () => this.processDGCheck());
        }
    }

    initializeListCompare() {
        console.log('List Compare view initialized');
        
        // Initialize unified file upload handlers
        this.initializeFileUpload('list-a', ['xlsx', 'xls', 'pdf', 'docx', 'doc']);
        this.initializeFileUpload('list-b', ['xlsx', 'xls', 'pdf', 'docx', 'doc']);
        
        const processBtn = document.getElementById('processCompareBtn');
        if (processBtn) {
            processBtn.addEventListener('click', () => this.processListCompare());
        }
    }

    async initializeLogs() {
        await this.loadLogs();
    }

    async initializeSettings() {
        console.log('Settings view initialized');
        
        // Load current settings
        try {
            const result = await window.safeMariAPI.getSettings();
            if (result.success) {
                const settings = result.settings;
                
                // Apply loaded settings to UI
                const exportFormat = document.getElementById('exportFormat');
                const verboseLogging = document.getElementById('verboseLogging');
                const autoSaveResults = document.getElementById('autoSaveResults');
                
                if (exportFormat) exportFormat.value = settings.exportFormat || 'xlsx';
                if (verboseLogging) verboseLogging.checked = settings.verboseLogging || false;
                if (autoSaveResults) autoSaveResults.checked = settings.autoSaveResults || false;
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
        
        // Setup save button
        const saveBtn = document.getElementById('saveSettings');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                await this.saveSettings();
            });
        }
        
        // Setup reset button
        const resetBtn = document.getElementById('resetSettings');
        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                await this.resetSettings();
            });
        }
    }
    
    async saveSettings() {
        try {
            const exportFormat = document.getElementById('exportFormat')?.value || 'xlsx';
            const verboseLogging = document.getElementById('verboseLogging')?.checked || false;
            const autoSaveResults = document.getElementById('autoSaveResults')?.checked || false;
            
            const newSettings = {
                exportFormat,
                verboseLogging,
                autoSaveResults
            };
            
            const result = await window.safeMariAPI.saveSettings(newSettings);
            
            if (result.success) {
                // Show success message
                const saveBtn = document.getElementById('saveSettings');
                const originalText = saveBtn.textContent;
                saveBtn.textContent = 'Settings Saved!';
                saveBtn.style.background = '#16a34a';
                
                setTimeout(() => {
                    saveBtn.textContent = originalText;
                    saveBtn.style.background = '';
                }, 2000);
            } else {
                alert('Failed to save settings: ' + result.error);
            }
        } catch (error) {
            console.error('Save settings error:', error);
            alert('Error saving settings: ' + error.message);
        }
    }
    
    async resetSettings() {
        if (confirm('Reset all settings to defaults?')) {
            try {
                const defaultSettings = {
                    exportFormat: 'xlsx',
                    verboseLogging: false,
                    autoSaveResults: false
                };
                
                const result = await window.safeMariAPI.saveSettings(defaultSettings);
                
                if (result.success) {
                    // Update UI
                    document.getElementById('exportFormat').value = 'xlsx';
                    document.getElementById('verboseLogging').checked = false;
                    document.getElementById('autoSaveResults').checked = false;
                    
                    alert('Settings reset to defaults');
                } else {
                    alert('Failed to reset settings: ' + result.error);
                }
            } catch (error) {
                console.error('Reset settings error:', error);
                alert('Error resetting settings: ' + error.message);
            }
        }
    }

    async initializeLicenseInfo() {
        // Setup close button
        const closeBtn = document.getElementById('closeLicenseInfo');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.navigate('welcome');
            });
        }
        
        // Setup show license modal button
        const showModalBtn = document.getElementById('showLicenseModal');
        if (showModalBtn) {
            showModalBtn.addEventListener('click', () => {
                document.getElementById('licenseModal').style.display = 'flex';
            });
        }
        
        // Load license information
        try {
            const licenseInfo = await window.safeMariAPI.getLicenseInfo();
            const appInfo = await window.safeMariAPI.getAppInfo();
            
            // Display license status
            const licenseStatusDiv = document.getElementById('licenseStatusInfo');
            if (licenseStatusDiv && licenseInfo.success) {
                const validation = licenseInfo.validation;
                const isValid = validation && validation.isValid;
                
                licenseStatusDiv.innerHTML = `
                    <div style="background: ${isValid ? '#f0f9ff' : '#fef2f2'}; padding: 16px; border-radius: 8px; border-left: 4px solid ${isValid ? '#2563eb' : '#dc2626'};">
                        <div style="font-weight: 600; color: ${isValid ? '#1e40af' : '#dc2626'}; margin-bottom: 8px;">
                            Status: ${isValid ? 'Licensed' : 'Unlicensed'}
                        </div>
                        ${isValid ? `
                            <div style="color: #374151; margin-bottom: 4px;">Expires: ${validation.expiry || 'Unknown'}</div>
                            <div style="color: #374151; margin-bottom: 4px;">Days Remaining: ${validation.daysRemaining || 'Unknown'}</div>
                            <div style="color: #374151; margin-bottom: 4px;">License Type: ${validation.licenseType || 'Standard'}</div>
                        ` : `
                            <div style="color: #991b1b;">License activation required to use cargo tools</div>
                        `}
                        <div style="color: #64748b; font-size: 12px; margin-top: 8px;">Machine ID: ${licenseInfo.machineId || 'Unknown'}</div>
                    </div>
                `;
            } else {
                licenseStatusDiv.innerHTML = '<div class="error-message">Failed to load license information</div>';
            }
            
            // Display app information
            const appInfoDiv = document.getElementById('appInfoDetails');
            if (appInfoDiv && appInfo.success) {
                appInfoDiv.innerHTML = `
                    <div style="background: #f8fafc; padding: 16px; border-radius: 8px;">
                        <div style="margin-bottom: 8px;"><strong>Application:</strong> ${appInfo.name}</div>
                        <div style="margin-bottom: 8px;"><strong>Version:</strong> ${appInfo.version}</div>
                        <div style="margin-bottom: 8px;"><strong>Description:</strong> ${appInfo.description}</div>
                        <div style="color: #64748b; font-size: 12px; margin-top: 12px;">SafeMari Cargo Tools - Professional maritime cargo operations</div>
                    </div>
                `;
            } else {
                appInfoDiv.innerHTML = '<div class="error-message">Failed to load application information</div>';
            }
            
        } catch (error) {
            console.error('Failed to load license info:', error);
            const licenseStatusDiv = document.getElementById('licenseStatusInfo');
            const appInfoDiv = document.getElementById('appInfoDetails');
            
            if (licenseStatusDiv) {
                licenseStatusDiv.innerHTML = '<div class="error-message">Error loading license information</div>';
            }
            if (appInfoDiv) {
                appInfoDiv.innerHTML = '<div class="error-message">Error loading application information</div>';
            }
        }
    }

    initializeFileUpload(fileType, allowedExtensions) {
        const dropZone = document.querySelector(`[data-file-type="${fileType}"]`);
        const browseBtn = dropZone?.querySelector('.btn-secondary');
        
        if (!dropZone || !browseBtn) return;

        // Browse button click handler
        browseBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const filters = [];
            if (allowedExtensions.includes('xlsx') || allowedExtensions.includes('xls')) {
                filters.push({ name: 'Excel Files', extensions: ['xlsx', 'xls'] });
            }
            if (allowedExtensions.includes('pdf')) {
                filters.push({ name: 'PDF Files', extensions: ['pdf'] });
            }
            if (allowedExtensions.includes('docx') || allowedExtensions.includes('doc')) {
                filters.push({ name: 'Word Documents', extensions: ['docx', 'doc'] });
            }
            filters.push({ name: 'All Files', extensions: ['*'] });

            const result = await window.safeMariAPI.selectFile({ filters });
            
            if (result.success && !result.cancelled) {
                this.handleFileSelection(fileType, result.filePath);
            }
        });

        // Enhanced drag and drop handlers
        dropZone.addEventListener('click', async (e) => {
            // Allow clicking anywhere in the drop zone to select file
            e.preventDefault();
            e.stopPropagation();
            
            const filters = [];
            if (allowedExtensions.includes('xlsx') || allowedExtensions.includes('xls')) {
                filters.push({ name: 'Excel Files', extensions: ['xlsx', 'xls'] });
            }
            if (allowedExtensions.includes('pdf')) {
                filters.push({ name: 'PDF Files', extensions: ['pdf'] });
            }
            if (allowedExtensions.includes('docx') || allowedExtensions.includes('doc')) {
                filters.push({ name: 'Word Documents', extensions: ['docx', 'doc'] });
            }
            filters.push({ name: 'All Files', extensions: ['*'] });

            const result = await window.safeMariAPI.selectFile({ filters });
            
            if (result.success && !result.cancelled) {
                this.handleFileSelection(fileType, result.filePath);
            }
        });
        
        dropZone.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!dropZone.contains(e.relatedTarget)) {
                dropZone.classList.remove('dragover');
            }
        });

        dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
            
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) {
                const file = files[0];
                const extension = file.name.split('.').pop().toLowerCase();
                
                if (allowedExtensions.includes(extension)) {
                    // Try different methods to get the file path
                    let filePath = null;
                    
                    // Method 1: Use file.path (works in some Electron versions)
                    if (file.path) {
                        filePath = file.path;
                        console.log('Using file.path:', filePath);
                        this.handleFileSelection(fileType, filePath, file);
                    } 
                    // Method 2: Use our file path resolver
                    else {
                        console.log('file.path not available, trying to resolve:', file.name);
                        try {
                            const result = await window.safeMariAPI.resolveFilePath(file.name);
                            if (result.success) {
                                console.log('Resolved file path:', result.filePath);
                                this.handleFileSelection(fileType, result.filePath, file);
                            } else {
                                console.log('Could not resolve file path:', result.error);
                                alert(`Could not locate "${file.name}". Please use the Browse button to select the file.`);
                            }
                        } catch (error) {
                            console.error('Error resolving file path:', error);
                            alert(`Error accessing "${file.name}". Please use the Browse button to select the file.`);
                        }
                    }
                } else {
                    alert(`Invalid file type. Please select: ${allowedExtensions.join(', ')}`);
                }
            }
        });
    }

    handleFileSelection(fileType, filePath, fileObject = null) {
        console.log(`File selection for ${fileType}:`, { filePath, fileObject: fileObject?.name });
        
        // Store the file path or object
        if (fileObject && fileObject.path) {
            // Electron environment with file.path
            filePath = fileObject.path;
            console.log(`Using file.path: ${filePath}`);
        }
        
        // Validate file path exists and is not just a filename
        if (!filePath || filePath === fileObject?.name) {
            console.error('Invalid file path - got filename instead of full path');
            alert('Could not access file path. Please use the Browse button instead.');
            return;
        }
        
        // Update the drop zone to show file is selected
        const dropZone = document.querySelector(`[data-file-type="${fileType}"]`);
        if (dropZone) {
            dropZone.classList.add('has-file');
            const content = dropZone.querySelector('.drop-zone-content');
            if (content) {
                const fileName = filePath.split(/[\\\/]/).pop();
                content.innerHTML = `
                    <h4>✓ File Selected</h4>
                    <p><strong>${fileName}</strong></p>
                    <p>Click to change file</p>
                `;
            }
        }

        // Store the file path for processing
        if (!this.selectedFiles) this.selectedFiles = {};
        this.selectedFiles[fileType] = filePath;
        
        console.log('Stored file paths:', this.selectedFiles);
        
        // Check if we can enable the process button
        this.updateProcessButton();
    }

    updateProcessButton() {
        // Handle different process buttons based on current view
        const reeferBtn = document.getElementById('processReeferBtn');
        const ctBtn = document.getElementById('processCTBtn');
        const dgBtn = document.getElementById('processDGBtn');
        const compareBtn = document.getElementById('processCompareBtn');
        
        if (!this.selectedFiles) return;

        // Reefer Temperature Checker
        if (reeferBtn) {
            const hasCheckFile = this.selectedFiles['check-file'];
            const hasManifestFile = this.selectedFiles['manifest-file'];
            const canProcess = hasCheckFile && hasManifestFile;
            
            reeferBtn.disabled = !canProcess;
            
            if (canProcess) {
                const checkFormat = this.getFileFormat(hasCheckFile);
                const manifestFormat = this.getFileFormat(hasManifestFile);
                reeferBtn.textContent = `Process Temperature Check (${checkFormat} + ${manifestFormat})`;
            } else {
                reeferBtn.textContent = 'Process Temperature Check';
            }
        }

        // CT Stowage Sorter
        if (ctBtn) {
            const hasReeferFile = this.selectedFiles['reefer-list'];
            const hasCTFile = this.selectedFiles['ct-sheet'];
            const canProcess = hasReeferFile && hasCTFile;
            
            ctBtn.disabled = !canProcess;
            
            if (canProcess) {
                const reeferFormat = this.getFileFormat(hasReeferFile);
                const ctFormat = this.getFileFormat(hasCTFile);
                ctBtn.textContent = `Process CT Stowage (${reeferFormat} + ${ctFormat})`;
            } else {
                ctBtn.textContent = 'Process CT Stowage';
            }
        }

        // DG Manifest Checker
        if (dgBtn) {
            const hasManifestFile = this.selectedFiles['dg-manifest'];
            const hasStowageFile = this.selectedFiles['dg-stowage'];
            const canProcess = hasManifestFile && hasStowageFile;
            
            dgBtn.disabled = !canProcess;
            
            if (canProcess) {
                const manifestFormat = this.getFileFormat(hasManifestFile);
                const stowageFormat = this.getFileFormat(hasStowageFile);
                dgBtn.textContent = `Process DG Check (${manifestFormat} + ${stowageFormat})`;
            } else {
                dgBtn.textContent = 'Process DG Check';
            }
        }

        // List Compare
        if (compareBtn) {
            const hasFileA = this.selectedFiles['list-a'];
            const hasFileB = this.selectedFiles['list-b'];
            const canProcess = hasFileA && hasFileB;
            
            compareBtn.disabled = !canProcess;
            
            if (canProcess) {
                const fileAName = this.getFileName(hasFileA);
                const fileBName = this.getFileName(hasFileB);
                compareBtn.textContent = `Process List Reconciliation (${fileAName} vs ${fileBName})`;
            } else {
                compareBtn.textContent = 'Process List Reconciliation';
            }
        }
    }
    
    getFileFormat(filePath) {
        if (!filePath) return 'Unknown';
        const ext = filePath.split('.').pop().toLowerCase();
        switch (ext) {
            case 'xlsx': case 'xls': return 'Excel';
            case 'pdf': return 'PDF';
            case 'docx': case 'doc': return 'Word';
            default: return ext.toUpperCase();
        }
    }
    
    getFileName(filePath) {
        if (!filePath) return 'Unknown';
        return filePath.split(/[\\\/]/).pop().replace(/\.[^/.]+$/, '') || 'File';
    }

    async processReeferCheck() {
        if (!this.selectedFiles) {
            alert('Please select files first');
            return;
        }

        const checkFile = this.selectedFiles['check-file'];
        const manifestFile = this.selectedFiles['manifest-file'];

        if (!checkFile || !manifestFile) {
            alert('Please select both CHECK and MANIFEST files');
            return;
        }

        // Show processing indicator
        const resultsDiv = document.getElementById('reeferResults');
        if (resultsDiv) {
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = `
                <div style="text-align: center; padding: 40px; background: #f8fafc; border-radius: 8px;">
                    <div style="font-size: 18px; color: #2563eb; margin-bottom: 12px;">🔄 Processing Files...</div>
                    <div style="color: #64748b; margin-bottom: 16px;">Analyzing document structure and comparing temperatures</div>
                    <div style="width: 200px; height: 4px; background: #e2e8f0; border-radius: 2px; margin: 0 auto; overflow: hidden;">
                        <div style="width: 100%; height: 100%; background: linear-gradient(90deg, #2563eb, #3b82f6); animation: slide 2s infinite;"></div>
                    </div>
                </div>
                <style>
                    @keyframes slide {
                        0% { transform: translateX(-100%); }
                        100% { transform: translateX(100%); }
                    }
                </style>
            `;
        }

        const startTime = Date.now();
        
        try {
            const result = await window.safeMariAPI.processReefer({
                checkFilePath: checkFile,
                manifestFilePath: manifestFile
            });

            // Log the operation
            const duration = Date.now() - startTime;
            await window.safeMariAPI.addLog({
                module: 'reefer',
                fileA: checkFile,
                fileB: manifestFile,
                resultSummary: result.success ? `Processed ${result.results?.totalCheck || 0} CHECK containers, ${result.results?.mismatches?.length || 0} mismatches` : 'Processing failed',
                operationDuration: duration,
                success: result.success,
                errorMessage: result.success ? null : result.error
            });

            // Always display results (success or failure)
            this.displayReeferResults(result);
            
        } catch (error) {
            console.error('Reefer processing error:', error);
            
            // Display error in results area
            this.displayReeferResults({
                success: false,
                error: `Unexpected error: ${error.message}`
            });
        }
    }

    async processCTStowage() {
        if (!this.selectedFiles) {
            alert('Please select files first');
            return;
        }

        const reeferFile = this.selectedFiles['reefer-list'];
        const ctFile = this.selectedFiles['ct-sheet'];

        if (!reeferFile || !ctFile) {
            alert('Please select both reefer list and CT sheet files');
            return;
        }

        const startTime = Date.now();
        
        try {
            const result = await window.safeMariAPI.processCT({
                reeferListPath: reeferFile,
                ctSheetPath: ctFile
            });

            // Log the operation
            const duration = Date.now() - startTime;
            await window.safeMariAPI.addLog({
                module: 'ct',
                fileA: reeferFile,
                fileB: ctFile,
                resultSummary: result.success ? `Processed ${result.results?.totalContainers || 0} containers, ${result.results?.matched || 0} matched with stowage` : 'Processing failed',
                operationDuration: duration,
                success: result.success,
                errorMessage: result.success ? null : result.error
            });

            if (result.success) {
                this.displayCTResults(result);
            } else {
                alert(`Processing failed: ${result.error}`);
            }
        } catch (error) {
            console.error('CT processing error:', error);
            alert(`Error: ${error.message}`);
        }
    }

    async processDGCheck() {
        if (!this.selectedFiles) {
            alert('Please select files first');
            return;
        }

        const manifestFile = this.selectedFiles['dg-manifest'];
        const stowageFile = this.selectedFiles['dg-stowage'];

        if (!manifestFile || !stowageFile) {
            alert('Please select both manifest and stowage files');
            return;
        }

        try {
            const result = await window.safeMariAPI.processDG({
                manifestPath: manifestFile,
                stowagePath: stowageFile
            });

            if (result.success) {
                this.displayDGResults(result);
            } else {
                alert(`Processing failed: ${result.error}`);
            }
        } catch (error) {
            console.error('DG processing error:', error);
            alert(`Error: ${error.message}`);
        }
    }

    async processListCompare() {
        if (!this.selectedFiles) {
            alert('Please select files first');
            return;
        }

        const fileA = this.selectedFiles['list-a'];
        const fileB = this.selectedFiles['list-b'];

        if (!fileA || !fileB) {
            alert('Please select both container list files');
            return;
        }

        const resultsDiv = document.getElementById('compareResults');
        if (resultsDiv) {
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = `
                <div style="text-align: center; padding: 40px; background: #f8fafc; border-radius: 8px;">
                    <div style="font-size: 18px; color: #2563eb; margin-bottom: 12px;">🔄 Comparing Lists...</div>
                    <div style="color: #64748b; margin-bottom: 16px;">Analyzing container lists and identifying differences</div>
                    <div style="width: 200px; height: 4px; background: #e2e8f0; border-radius: 2px; margin: 0 auto; overflow: hidden;">
                        <div style="width: 100%; height: 100%; background: linear-gradient(90deg, #2563eb, #3b82f6); animation: slide 2s infinite;"></div>
                    </div>
                </div>
            `;
        }

        const startTime = Date.now();
        
        try {
            const result = await window.safeMariAPI.processCompare({
                fileAPath: fileA,
                fileBPath: fileB
            });

            const duration = Date.now() - startTime;
            await window.safeMariAPI.addLog({
                module: 'compare',
                fileA: fileA,
                fileB: fileB,
                resultSummary: result.success ? `Compared ${result.results?.statistics?.totalA || 0} vs ${result.results?.statistics?.totalB || 0} containers, ${result.results?.statistics?.commonCount || 0} common` : 'Comparison failed',
                operationDuration: duration,
                success: result.success,
                errorMessage: result.success ? null : result.error
            });

            this.displayCompareResults(result);
            
        } catch (error) {
            console.error('Compare processing error:', error);
            this.displayCompareResults({
                success: false,
                error: `Unexpected error: ${error.message}`
            });
        }
    }

    displayReeferResults(result) {
        const resultsDiv = document.getElementById('reeferResults');
        if (!resultsDiv) return;
        
        resultsDiv.style.display = 'block';
        
        // Handle processing errors with detailed feedback
        if (!result.success) {
            resultsDiv.innerHTML = `
                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 16px 0;">
                    <h3 style="color: #dc2626; margin: 0 0 12px;">❌ Processing Failed</h3>
                    <div style="color: #991b1b; margin-bottom: 12px; font-weight: 500;">${result.error}</div>
                    
                    <div style="background: #fff; border-radius: 6px; padding: 12px; margin-top: 12px;">
                        <h4 style="margin: 0 0 8px; color: #374151;">💡 Troubleshooting Tips:</h4>
                        <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
                            <li>Ensure files contain container IDs (format: ABCD1234567)</li>
                            <li>Verify temperature columns have numeric values with °C or similar units</li>
                            <li>Check that files are not corrupted or password-protected</li>
                            <li>For DOCX files, ensure tables are properly formatted</li>
                            <li>Try using Excel format (.xlsx) if other formats fail</li>
                        </ul>
                    </div>
                </div>
            `;
            return;
        }
        
        const summary = result.summary || {};
        const mismatches = result.results?.mismatches || [];
        const missing = result.results?.missing || [];
        const processingPlan = result.processingPlan || {};
        
        window.reeferDownloadData = result.downloadData;
        
        let html = `
            <div class="compact-results">
                <h3>Temperature Check Results</h3>
                
                <!-- Processing Quality Indicator -->
                ${processingPlan.confidence ? `
                <div style="background: ${processingPlan.confidence >= 0.7 ? '#f0f9ff' : processingPlan.confidence >= 0.5 ? '#fffbeb' : '#fef2f2'}; 
                     border-radius: 6px; padding: 12px; margin-bottom: 16px; border-left: 4px solid ${processingPlan.confidence >= 0.7 ? '#0ea5e9' : processingPlan.confidence >= 0.5 ? '#f59e0b' : '#ef4444'};">
                    <div style="font-weight: 600; color: #374151; margin-bottom: 4px;">🎯 Detection Quality: ${this.getQualityLabel(processingPlan.confidence)} (${(processingPlan.confidence * 100).toFixed(0)}%)</div>
                    ${processingPlan.warnings && processingPlan.warnings.length > 0 ? `
                    <div style="font-size: 13px; color: #6b7280;">
                        ⚠️ ${processingPlan.warnings.join('; ')}
                    </div>
                    ` : ''}
                </div>
                ` : ''}
                
                <div class="results-grid">
                    <div class="result-item">
                        <span class="label">Total in CHECK:</span>
                        <span class="value">${summary.totalCheck || 0}</span>
                    </div>
                    <div class="result-item">
                        <span class="label">Detected with temps in MANIFEST:</span>
                        <span class="value">${summary.totalManifest || 0}</span>
                    </div>
                    <div class="result-item">
                        <span class="label">Found in MANIFEST (matching IDs):</span>
                        <span class="value ok">${summary.found || 0}</span>
                    </div>
                    <div class="result-item">
                        <span class="label">Missing (ID not found in MANIFEST):</span>
                        <span class="value ${summary.missing > 0 ? 'warn' : 'ok'}">${summary.missing || 0}</span>
                    </div>
                    <div class="result-item">
                        <span class="label">Temperature mismatches (> 0.1°C):</span>
                        <span class="value ${summary.mismatches > 0 ? 'warn' : 'ok'}">${summary.mismatches || 0}</span>
                    </div>
                </div>
                
                ${summary.debug ? `<div class="debug-info">${summary.debug}</div>` : ''}
                    
                    <!-- AI Summary Section -->
                    <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 16px 0; border-left: 4px solid #2563eb;">
                        <h3 style="margin: 0 0 12px; color: #1e40af; font-size: 16px;">ANALYSIS SUMMARY</h3>
                        <div style="color: #374151; line-height: 1.6; font-size: 14px;">
                            ${(() => {
                                const totalCheck = summary.totalCheck || 0;
                                const totalManifest = summary.totalManifest || 0;
                                const found = summary.found || 0;
                                const mismatches = summary.mismatches || 0;
                                const missing = summary.missing || 0;
                                const exactMatches = found - mismatches;
                                const matchRate = totalCheck > 0 ? ((found / totalCheck) * 100).toFixed(1) : 0;
                                
                                if (found === totalCheck && mismatches === 0) {
                                    return `Perfect validation achieved with all ${totalCheck} containers from CHECK file successfully matched in MANIFEST with exact temperature alignment. No discrepancies detected.`;
                                } else if (found === totalCheck && mismatches <= 5) {
                                    return `Excellent validation results with ${matchRate}% container matching success. All ${totalCheck} containers located in MANIFEST with ${exactMatches} exact temperature matches and only ${mismatches} minor temperature variations within acceptable tolerance.`;
                                } else if (found >= totalCheck * 0.95) {
                                    return `Good validation outcome with ${matchRate}% matching rate. Successfully located ${found} out of ${totalCheck} containers with ${exactMatches} exact temperature matches. ${mismatches} containers show temperature discrepancies and ${missing} containers require attention for missing MANIFEST entries.`;
                                } else {
                                    return `Validation requires attention with ${matchRate}% matching rate. Located ${found} containers out of ${totalCheck} total, with ${exactMatches} exact matches and ${mismatches} temperature discrepancies. ${missing} containers missing from MANIFEST need investigation.`;
                                }
                            })()} 
                        </div>
                    </div>
                    
                ${missing && missing.length > 0 ? `
                    <div class="section-title">Missing containers (in CHECK but not in MANIFEST):</div>
                    <div class="data-preview">${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ` ... and ${missing.length - 10} more` : ''}</div>
                ` : ''}
                
                ${mismatches && mismatches.length > 0 ? `
                    <div class="section-title">Temperature mismatches (Set vs Manifest):</div>
                    <div class="data-preview">
                        ${mismatches.slice(0, 5).map(m => 
                            `${m.id}: Set=${m.setT}°C, Man=${m.manT}°C, Diff=${m.diff.toFixed(2)}°C`
                        ).join('<br>')}
                        ${mismatches.length > 5 ? `<br>... and ${mismatches.length - 5} more mismatches` : ''}
                    </div>
                    <div class="download-section">
                        <button onclick="downloadReeferReport()" class="btn-primary">Download Excel Report (mismatches only)</button>
                    </div>
                ` : `
                    <div class="section-title">Temperature mismatches:</div>
                    <div class="data-preview">None – all matched within ±0.1°C tolerance.</div>
                `}
            </div>
        `;
        
        resultsDiv.innerHTML = html;
    }
    
    getQualityLabel(confidence) {
        if (confidence >= 0.8) return 'Excellent';
        if (confidence >= 0.7) return 'Very Good';
        if (confidence >= 0.6) return 'Good';
        if (confidence >= 0.5) return 'Fair';
        if (confidence >= 0.4) return 'Poor';
        return 'Very Poor';
    }

    displayCTResults(result) {
        const resultsDiv = document.getElementById('ctResults');
        if (!resultsDiv) return;

        resultsDiv.style.display = 'block';
        this.ctResultData = result;

        // Handle case where result.results might be undefined or have different structure
        if (!result || !result.results) {
            resultsDiv.innerHTML = `
                <h2 style="color: #dc2626; margin-bottom: 20px;">CT Stowage Processing Error</h2>
                <div style="background: #fef2f2; padding: 20px; border-radius: 8px; border-left: 4px solid #dc2626;">
                    <div style="color: #dc2626; font-size: 16px;">Error: Invalid result structure</div>
                    <div style="color: #64748b; margin-top: 10px;">Result object: ${JSON.stringify(result, null, 2)}</div>
                </div>
            `;
            return;
        }
        
        const matched = result.results.matched || 0;
        const missing = result.results.missing || 0;
        const totalContainers = result.results.totalContainers || 0;
        const blocksWithKey = result.results.blocksWithKey || [];
        const missingContainers = blocksWithKey.filter(block => !block.stow).map(block => block.id);
        
        resultsDiv.innerHTML = `
            <h2 style="color: #2563eb; margin-bottom: 20px;">CT Stowage Results</h2>
            
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 20px;">
                <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #2563eb;">
                    <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">TOTAL IN CT SHEET:</div>
                    <div style="font-size: 28px; font-weight: bold; color: #2563eb;">${totalContainers}</div>
                </div>
                
                <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #16a34a;">
                    <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">FOUND IN FULL LIST:</div>
                    <div style="font-size: 28px; font-weight: bold; color: #16a34a;">${matched}</div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px;">
                <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid ${missing > 0 ? '#dc2626' : '#16a34a'};">
                    <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">MISSING (NO STOWAGE):</div>
                    <div style="font-size: 28px; font-weight: bold; color: ${missing > 0 ? '#dc2626' : '#16a34a'};">${missing}</div>
                </div>
                
                <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #2563eb;">
                    <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">CONTAINERS SORTED:</div>
                    <div style="font-size: 28px; font-weight: bold; color: #2563eb;">${matched}</div>
                </div>
                
                <div style="background: #f8fafc; padding: 15px; border-radius: 8px;">
                    <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">STATUS:</div>
                    <div style="font-size: 20px; font-weight: bold; color: ${missing === 0 ? '#16a34a' : '#f59e0b'};">${missing === 0 ? 'COMPLETE' : 'PARTIAL'}</div>
                </div>
            </div>
            
            <div style="background: #f1f5f9; padding: 12px; border-radius: 6px; margin-bottom: 15px; font-family: 'Courier New', monospace; color: #475569; font-style: italic; font-size: 14px;">
                CT containers = ${totalContainers}, Found with stowage = ${matched}
            </div>
            
            ${missing > 0 && missingContainers.length > 0 ? `
            <h3 style="color: #2563eb; margin: 15px 0 10px 0; font-size: 18px;">Missing Containers (No stowage found):</h3>
            <div style="background: #fef2f2; padding: 12px; border-radius: 6px; max-height: 150px; overflow-y: auto;">
                ${missingContainers.slice(0, 10).map(container => 
                    `<div style="font-family: 'Courier New', monospace; color: #dc2626; margin-bottom: 3px; font-size: 13px;">${container}</div>`
                ).join('')}
                ${missingContainers.length > 10 ? `<div style="color: #64748b; font-style: italic; font-size: 13px;">... and ${missingContainers.length - 10} more missing</div>` : ''}
            </div>
            ` : ''}
            
            <div style="text-align: center; margin-top: 20px;">
                <button onclick="downloadCTReport()" style="background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; transition: background-color 0.2s;" onmouseover="this.style.background='#1d4ed8'" onmouseout="this.style.background='#2563eb'">
                    Download Sorted CT Excel
                </button>
            </div>
        `;
    }

    displayDGResults(result) {
        const resultsDiv = document.getElementById('dgResults');
        if (!resultsDiv) return;
        
        resultsDiv.style.display = 'block';
        
        if (!result.success) {
            resultsDiv.innerHTML = `
                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 16px 0;">
                    <h3 style="color: #dc2626; margin: 0 0 12px;">❌ DG Validation Failed</h3>
                    <div style="color: #991b1b; margin-bottom: 12px; font-weight: 500;">${result.error}</div>
                    <div style="background: #fff; border-radius: 6px; padding: 12px; margin-top: 12px;">
                        <h4 style="margin: 0 0 8px; color: #374151;">💡 Troubleshooting Tips:</h4>
                        <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
                            <li>Ensure files contain dangerous goods information with UN numbers</li>
                            <li>Check that container IDs are in standard format (ABCD1234567)</li>
                            <li>Verify files contain DG class information</li>
                            <li>Make sure files are not corrupted or password-protected</li>
                        </ul>
                    </div>
                </div>
            `;
            return;
        }
        
        const summary = result.summary || {};
        const results = result.results || {};
        
        window.dgDownloadData = result;
        
        resultsDiv.innerHTML = `
            <div class="compact-results">
                <h3>DG Validation Results</h3>
                
                <div class="results-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px;">
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #2563eb;">
                        <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">MANIFEST CONTAINERS:</div>
                        <div style="font-size: 28px; font-weight: bold; color: #2563eb;">${summary.manifestContainers || 0}</div>
                    </div>
                    
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #16a34a;">
                        <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">STOWAGE CONTAINERS:</div>
                        <div style="font-size: 28px; font-weight: bold; color: #16a34a;">${summary.stowageContainers || 0}</div>
                    </div>
                    
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b;">
                        <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">MATCHES:</div>
                        <div style="font-size: 28px; font-weight: bold; color: #f59e0b;">${summary.matches || 0}</div>
                    </div>
                </div>
                
                <div class="results-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px;">
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid ${summary.missingInStowage > 0 ? '#dc2626' : '#16a34a'};">
                        <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">MISSING IN STOWAGE:</div>
                        <div style="font-size: 28px; font-weight: bold; color: ${summary.missingInStowage > 0 ? '#dc2626' : '#16a34a'};">${summary.missingInStowage || 0}</div>
                    </div>
                    
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid ${summary.extraInStowage > 0 ? '#f59e0b' : '#16a34a'};">
                        <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">EXTRA IN STOWAGE:</div>
                        <div style="font-size: 28px; font-weight: bold; color: ${summary.extraInStowage > 0 ? '#f59e0b' : '#16a34a'};">${summary.extraInStowage || 0}</div>
                    </div>
                    
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid ${summary.unClassMismatches > 0 ? '#dc2626' : '#16a34a'};">
                        <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">UN/CLASS MISMATCHES:</div>
                        <div style="font-size: 28px; font-weight: bold; color: ${summary.unClassMismatches > 0 ? '#dc2626' : '#16a34a'};">${summary.unClassMismatches || 0}</div>
                    </div>
                </div>
                
                <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 16px 0; border-left: 4px solid #2563eb;">
                    <h3 style="margin: 0 0 12px; color: #1e40af; font-size: 16px;">📊 DG VALIDATION SUMMARY</h3>
                    <div style="color: #374151; line-height: 1.6; font-size: 14px;">
                        ${(() => {
                            const manifestCount = summary.manifestContainers || 0;
                            const matches = summary.matches || 0;
                            const missingCount = summary.missingInStowage || 0;
                            const mismatchCount = summary.unClassMismatches || 0;
                            const matchRate = parseFloat(summary.matchRate || 0);
                            
                            if (matchRate >= 95 && mismatchCount === 0) {
                                return `Excellent DG validation with ${matchRate}% match rate. All ${matches} dangerous goods containers properly validated between manifest and stowage with no classification discrepancies.`;
                            } else if (matchRate >= 85) {
                                return `Good DG validation with ${matchRate}% match rate. Found ${matches} matching containers with ${mismatchCount} classification mismatches and ${missingCount} containers missing from stowage requiring attention.`;
                            } else if (matchRate >= 70) {
                                return `Fair DG validation with ${matchRate}% match rate. Validated ${matches} containers but ${missingCount + mismatchCount} containers need review for missing entries or classification discrepancies.`;
                            } else {
                                return `DG validation requires attention with ${matchRate}% match rate. Significant discrepancies found: ${missingCount} missing containers and ${mismatchCount} classification mismatches need immediate review.`;
                            }
                        })()} 
                    </div>
                </div>
                
                ${results.missingInStowage && results.missingInStowage.length > 0 ? `
                    <div class="section-title">Missing in Stowage (in manifest but not in stowage):</div>
                    <div class="data-preview" style="background: #fef2f2; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; color: #dc2626;">
                        ${results.missingInStowage.slice(0, 10).map(item => `${item.containerId} (UN${item.unNumber || '????'}, Class ${item.class || '?'})`).join(', ')}${results.missingInStowage.length > 10 ? ` ... and ${results.missingInStowage.length - 10} more` : ''}
                    </div>
                ` : ''}
                
                ${results.unClassMismatches && results.unClassMismatches.length > 0 ? `
                    <div class="section-title">UN/Class Mismatches:</div>
                    <div class="data-preview" style="background: #fef2f2; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; color: #dc2626;">
                        ${results.unClassMismatches.slice(0, 5).map(item => 
                            `${item.containerId}: ${item.mismatches.map(m => `${m.field} (M:${m.manifest} vs S:${m.stowage})`).join(', ')}`
                        ).join('<br>')}${results.unClassMismatches.length > 5 ? `<br>... and ${results.unClassMismatches.length - 5} more mismatches` : ''}
                    </div>
                ` : ''}
                
                <div class="download-section" style="text-align: center; margin-top: 20px;">
                    <button onclick="downloadDGReport()" class="btn-primary" style="background: #2563eb; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; cursor: pointer;">Download DG Validation Report</button>
                </div>
            </div>
        `;
    }

    displayCompareResults(result) {
        const resultsDiv = document.getElementById('compareResults');
        if (!resultsDiv) return;
        
        resultsDiv.style.display = 'block';
        
        if (!result.success) {
            resultsDiv.innerHTML = `
                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 16px 0;">
                    <h3 style="color: #dc2626; margin: 0 0 12px;">❌ Comparison Failed</h3>
                    <div style="color: #991b1b; margin-bottom: 12px; font-weight: 500;">${result.error}</div>
                    <div style="background: #fff; border-radius: 6px; padding: 12px; margin-top: 12px;">
                        <h4 style="margin: 0 0 8px; color: #374151;">💡 Troubleshooting Tips:</h4>
                        <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
                            <li>Ensure both files contain container ID columns</li>
                            <li>Check that files are valid Excel format (.xlsx, .xls)</li>
                            <li>Verify files are not corrupted or password-protected</li>
                            <li>Make sure container IDs follow standard format (ABCD1234567)</li>
                        </ul>
                    </div>
                </div>
            `;
            return;
        }
        
        const summary = result.summary || {};
        const stats = result.results?.statistics || {};
        const common = result.results?.common || [];
        const onlyInA = result.results?.onlyInA || [];
        const onlyInB = result.results?.onlyInB || [];
        
        window.compareDownloadData = result;
        
        resultsDiv.innerHTML = `
            <div class="compact-results">
                <h3>List Reconciliation Results</h3>
                
                <div class="results-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px;">
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #2563eb;">
                        <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">LIST A CONTAINERS:</div>
                        <div style="font-size: 28px; font-weight: bold; color: #2563eb;">${stats.totalA || 0}</div>
                        <div style="font-size: 11px; color: #64748b; margin-top: 4px;">${summary.listAFileName || 'File A'}</div>
                    </div>
                    
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #16a34a;">
                        <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">LIST B CONTAINERS:</div>
                        <div style="font-size: 28px; font-weight: bold; color: #16a34a;">${stats.totalB || 0}</div>
                        <div style="font-size: 11px; color: #64748b; margin-top: 4px;">${summary.listBFileName || 'File B'}</div>
                    </div>
                    
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b;">
                        <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">COMMON CONTAINERS:</div>
                        <div style="font-size: 28px; font-weight: bold; color: #f59e0b;">${stats.commonCount || 0}</div>
                        <div style="font-size: 11px; color: #64748b; margin-top: 4px;">${summary.commonPercentageA || 0}% of List A</div>
                    </div>
                </div>
                
                <div class="results-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px;">
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid ${stats.onlyInACount > 0 ? '#dc2626' : '#16a34a'};">
                        <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">ONLY IN LIST A:</div>
                        <div style="font-size: 28px; font-weight: bold; color: ${stats.onlyInACount > 0 ? '#dc2626' : '#16a34a'};">${stats.onlyInACount || 0}</div>
                        <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Missing from List B</div>
                    </div>
                    
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid ${stats.onlyInBCount > 0 ? '#dc2626' : '#16a34a'};">
                        <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">ONLY IN LIST B:</div>
                        <div style="font-size: 28px; font-weight: bold; color: ${stats.onlyInBCount > 0 ? '#dc2626' : '#16a34a'};">${stats.onlyInBCount || 0}</div>
                        <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Missing from List A</div>
                    </div>
                    
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px;">
                        <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">MATCH RATE:</div>
                        <div style="font-size: 28px; font-weight: bold; color: ${(summary.commonPercentageA || 0) >= 90 ? '#16a34a' : (summary.commonPercentageA || 0) >= 70 ? '#f59e0b' : '#dc2626'};">${summary.commonPercentageA || 0}%</div>
                        <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Overall Alignment</div>
                    </div>
                </div>
                
                <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 16px 0; border-left: 4px solid #2563eb;">
                    <h3 style="margin: 0 0 12px; color: #1e40af; font-size: 16px;">📊 RECONCILIATION SUMMARY</h3>
                    <div style="color: #374151; line-height: 1.6; font-size: 14px;">
                        ${(() => {
                            const totalA = stats.totalA || 0;
                            const totalB = stats.totalB || 0;
                            const commonCount = stats.commonCount || 0;
                            const onlyA = stats.onlyInACount || 0;
                            const onlyB = stats.onlyInBCount || 0;
                            const matchRate = parseFloat(summary.commonPercentageA || 0);
                            
                            if (matchRate >= 95 && onlyA === 0 && onlyB === 0) {
                                return `Perfect reconciliation achieved with ${commonCount} containers matched between both lists. No discrepancies detected - both files contain identical container sets.`;
                            } else if (matchRate >= 90) {
                                return `Excellent reconciliation with ${matchRate}% match rate. Found ${commonCount} common containers with ${onlyA} unique to List A and ${onlyB} unique to List B requiring attention.`;
                            } else if (matchRate >= 70) {
                                return `Good reconciliation outcome with ${matchRate}% alignment. Successfully matched ${commonCount} containers, but ${onlyA + onlyB} containers need investigation for missing entries.`;
                            } else {
                                return `Reconciliation requires attention with ${matchRate}% match rate. Significant differences found: ${onlyA} containers missing from List B, ${onlyB} containers missing from List A.`;
                            }
                        })()} 
                    </div>
                </div>
                
                ${onlyInA.length > 0 ? `
                    <div class="section-title">Containers only in List A (missing from List B):</div>
                    <div class="data-preview" style="background: #fef2f2; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; color: #dc2626;">
                        ${onlyInA.slice(0, 10).map(c => c.containerId).join(', ')}${onlyInA.length > 10 ? ` ... and ${onlyInA.length - 10} more` : ''}
                    </div>
                ` : ''}
                
                ${onlyInB.length > 0 ? `
                    <div class="section-title">Containers only in List B (missing from List A):</div>
                    <div class="data-preview" style="background: #fef2f2; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; color: #dc2626;">
                        ${onlyInB.slice(0, 10).map(c => c.containerId).join(', ')}${onlyInB.length > 10 ? ` ... and ${onlyInB.length - 10} more` : ''}
                    </div>
                ` : ''}
                
                ${common.length > 0 ? `
                    <div class="section-title">Common containers (present in both lists):</div>
                    <div class="data-preview" style="background: #f0f9ff; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; color: #2563eb;">
                        ${common.slice(0, 15).map(c => c.containerId).join(', ')}${common.length > 15 ? ` ... and ${common.length - 15} more` : ''}
                    </div>
                ` : ''}
                
                <div class="download-section" style="text-align: center; margin-top: 20px;">
                    <button onclick="downloadCompareReport()" class="btn-primary" style="background: #2563eb; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; cursor: pointer;">Download Reconciliation Report</button>
                </div>
            </div>
        `;
    }

    async loadLogs() {
        try {
            const filters = {
                module: document.getElementById('moduleFilter')?.value || '',
                startDate: document.getElementById('startDate')?.value || '',
                endDate: document.getElementById('endDate')?.value || ''
            };
            
            const result = await window.safeMariAPI.getLogs(filters);
            
            if (result.success) {
                this.displayLogs(result.logs);
            } else {
                const logsTable = document.getElementById('logsTable');
                if (logsTable) {
                    logsTable.innerHTML = `<div class="error-message">Failed to load logs: ${result.error}</div>`;
                }
            }
        } catch (error) {
            console.error('Error loading logs:', error);
            const logsTable = document.getElementById('logsTable');
            if (logsTable) {
                logsTable.innerHTML = `<div class="error-message">Failed to load logs: ${error.message}</div>`;
            }
        }
    }

    displayLogs(logs) {
        const logsTable = document.getElementById('logsTable');
        if (!logsTable) return;
        
        if (!logs || logs.length === 0) {
            logsTable.innerHTML = '<div class="no-logs">No logs found for the selected filters.</div>';
            return;
        }
        
        let html = `
            <table class="logs-table">
                <thead>
                    <tr>
                        <th>Date/Time</th>
                        <th>Module</th>
                        <th>Operation</th>
                        <th>Status</th>
                        <th>Details</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        logs.forEach(log => {
            const date = new Date(log.timestamp).toLocaleString();
            const status = log.success ? 'success' : 'error';
            const operation = log.module === 'reefer' ? 'Temperature Check' : 
                            log.module === 'ct' ? 'CT Stowage Sort' :
                            log.module === 'dg' ? 'DG Check' :
                            log.module === 'compare' ? 'Document Compare' : 
                            'Processing';
            const details = log.result_summary || log.error_message || 'N/A';
            
            html += `
                <tr class="${status}">
                    <td>${date}</td>
                    <td>${log.module}</td>
                    <td>${operation}</td>
                    <td><span class="status-badge ${status}">${log.success ? 'Success' : 'Error'}</span></td>
                    <td>${details}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        logsTable.innerHTML = html;
    }

    formatLogDetails(log) {
        let details = '';
        
        if (log.files) {
            const fileCount = Array.isArray(log.files) ? log.files.length : Object.keys(log.files).length;
            details += `Files: ${fileCount} | `;
        }
        
        if (log.duration) {
            details += `Duration: ${log.duration}ms | `;
        }
        
        if (log.results) {
            details += `Results: ${JSON.stringify(log.results).substring(0, 50)}... | `;
        }
        
        return details.replace(/ \| $/, '') || 'N/A';
    }

    async exportLogsData() {
        try {
            const filters = {
                module: document.getElementById('moduleFilter')?.value || '',
                startDate: document.getElementById('startDate')?.value || '',
                endDate: document.getElementById('endDate')?.value || ''
            };
            
            const result = await window.safeMariAPI.exportLogs({ filters });
            
            if (result.success) {
                alert('Logs exported successfully!');
            } else if (result.cancelled) {
                console.log('Export cancelled by user');
            } else {
                alert(`Export failed: ${result.error}`);
            }
        } catch (error) {
            console.error('Export error:', error);
            alert(`Error: ${error.message}`);
        }
    }

    bindFeatureCards() {
        const featureCards = document.querySelectorAll('.feature-card');
        featureCards.forEach(card => {
            card.addEventListener('click', () => {
                const viewName = card.getAttribute('data-view');
                this.navigate(viewName);
            });
        });
    }

    showError(message) {
        console.error('Router Error:', message);
        alert(message);
    }
    
    saveViewState(viewName) {
        // Save selected files and other view-specific state
        this.viewStates[viewName] = {
            selectedFiles: { ...this.selectedFiles },
            timestamp: Date.now()
        };
        
        // Also save results if they exist
        if (viewName === 'reefer-temp' && window.reeferDownloadData) {
            this.viewStates[viewName].results = window.reeferDownloadData;
        }
        if (viewName === 'ct-stowage' && this.ctResultData) {
            this.viewStates[viewName].results = this.ctResultData;
        }
        if (viewName === 'dg-checker' && window.dgDownloadData) {
            this.viewStates[viewName].results = window.dgDownloadData;
        }
        if (viewName === 'list-compare' && window.compareDownloadData) {
            this.viewStates[viewName].results = window.compareDownloadData;
        }
    }
    
    restoreViewState(viewName) {
        const state = this.viewStates[viewName];
        if (!state) return;
        
        // Restore selected files
        if (state.selectedFiles) {
            this.selectedFiles = { ...state.selectedFiles };
            
            // Update UI to show selected files
            Object.keys(state.selectedFiles).forEach(fileType => {
                const filePath = state.selectedFiles[fileType];
                if (filePath) {
                    this.updateDropZoneUI(fileType, filePath);
                }
            });
            
            // Update process button
            setTimeout(() => this.updateProcessButton(), 100);
        }
        
        // Restore results if they exist
        if (state.results) {
            if (viewName === 'reefer-temp') {
                window.reeferDownloadData = state.results;
                this.displayReeferResults({ success: true, ...state.results });
            } else if (viewName === 'ct-stowage') {
                this.ctResultData = state.results;
                this.displayCTResults(state.results);
            } else if (viewName === 'dg-checker') {
                window.dgDownloadData = state.results;
                this.displayDGResults({ success: true, ...state.results });
            } else if (viewName === 'list-compare') {
                window.compareDownloadData = state.results;
                this.displayCompareResults({ success: true, ...state.results });
            }
        }
    }
    
    updateDropZoneUI(fileType, filePath) {
        const dropZone = document.querySelector(`[data-file-type="${fileType}"]`);
        if (dropZone) {
            dropZone.classList.add('has-file');
            const content = dropZone.querySelector('.drop-zone-content');
            if (content) {
                const fileName = filePath.split(/[\\\/]/).pop();
                content.innerHTML = `
                    <h4>✓ File Selected</h4>
                    <p><strong>${fileName}</strong></p>
                    <p>Click to change file</p>
                `;
            }
        }
    }

    async downloadReeferReportGlobal() {
        if (!window.reeferDownloadData) {
            alert('No mismatches to export.');
            return;
        }
        
        try {
            // Extract the actual rows data from the download data object
            const rows = window.reeferDownloadData.data || window.reeferDownloadData;
            const filename = window.reeferDownloadData.filename || 'reefer_mismatches_report.xlsx';
            
            // Validate that rows is an array
            if (!Array.isArray(rows)) {
                throw new Error('Invalid data format for Excel export');
            }
            
            const result = await window.safeMariAPI.downloadExcelReport({
                rows: rows,
                filename: filename
            });
            
            if (result.success && !result.cancelled) {
                alert('Report exported successfully!');
            } else if (result.cancelled) {
                console.log('Export cancelled by user');
            } else {
                alert(`Export failed: ${result.error}`);
            }
        } catch (error) {
            console.error('Download error:', error);
            alert(`Error: ${error.message}`);
        }
    }

    async downloadCTReportGlobal() {
        if (!this.ctResultData || !this.ctResultData.sortedCtRows) {
            alert('No sorted CT sheet to export yet.');
            return;
        }
        
        try {
            const result = await window.safeMariAPI.downloadCTReport({
                sortedCtRows: this.ctResultData.sortedCtRows,
                filename: 'CT_Sorted_By_Stowage.xlsx'
            });
            
            if (result.success && !result.cancelled) {
                alert('CT Report exported successfully!');
            } else if (result.cancelled) {
                console.log('Export cancelled by user');
            } else {
                alert(`Export failed: ${result.error}`);
            }
        } catch (error) {
            console.error('CT Download error:', error);
            alert(`Error: ${error.message}`);
        }
    }

    async downloadCompareReportGlobal() {
        if (!window.compareDownloadData) {
            alert('No comparison results to export.');
            return;
        }
        
        try {
            const result = await window.safeMariAPI.downloadCompareReport({
                compareData: window.compareDownloadData,
                filename: 'container_list_reconciliation.xlsx'
            });
            
            if (result.success && !result.cancelled) {
                alert('Reconciliation report exported successfully!');
            } else if (result.cancelled) {
                console.log('Export cancelled by user');
            } else {
                alert(`Export failed: ${result.error}`);
            }
        } catch (error) {
            console.error('Compare download error:', error);
            alert(`Error: ${error.message}`);
        }
    }

    async downloadDGReportGlobal() {
        if (!window.dgDownloadData) {
            alert('No DG validation results to export.');
            return;
        }
        
        try {
            const result = await window.safeMariAPI.downloadDGReport({
                dgData: window.dgDownloadData,
                filename: 'dg_validation_report.xlsx'
            });
            
            if (result.success && !result.cancelled) {
                alert('DG validation report exported successfully!');
            } else if (result.cancelled) {
                console.log('Export cancelled by user');
            } else {
                alert(`Export failed: ${result.error}`);
            }
        } catch (error) {
            console.error('DG download error:', error);
            alert(`Error: ${error.message}`);
        }
    }
}

// Global functions for button onClick handlers
function downloadReeferReport() {
    if (window.router) {
        window.router.downloadReeferReportGlobal();
    }
}

function downloadCTReport() {
    if (window.router) {
        window.router.downloadCTReportGlobal();
    }
}

function downloadCompareReport() {
    if (window.router) {
        window.router.downloadCompareReportGlobal();
    }
}

function downloadDGReport() {
    if (window.router) {
        window.router.downloadDGReportGlobal();
    }
}