/**
 * SafeMari Cargo Tools - Router
 * Handles navigation and view loading
 */

class Router {
    constructor() {
        this.currentView = 'welcome';
        this.viewContainer = document.getElementById('viewContainer');
        this.navLinks = document.querySelectorAll('.nav-link');
        this.featureCards = document.querySelectorAll('.feature-card');
        this.selectedFiles = {};
        
        this.init();
    }

    init() {
        // Bind navigation events
        this.navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const view = link.getAttribute('data-view');
                if (view) {
                    this.navigateTo(view);
                }
            });
        });

        // Bind feature card events
        this.featureCards.forEach(card => {
            card.addEventListener('click', () => {
                const view = card.getAttribute('data-view');
                if (view) {
                    this.navigateTo(view);
                }
            });
        });

        // Load default view
        this.showWelcome();
    }

    async navigateTo(viewName) {
        // Check license for operations
        const licenseCheck = await window.safeMariAPI.checkLicenseForOperation();
        if (!licenseCheck.isLicensed && this.requiresLicense(viewName)) {
            this.showError('License required to use this feature');
            return;
        }

        // Update navigation state
        this.updateNavigation(viewName);
        
        // Load and display view
        try {
            this.currentView = viewName;
            await this.loadView(viewName);
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

    showWelcome() {
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
        
        // Re-bind feature card events
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
                        
                        <div class="file-type-sections">
                            <div class="file-type-section">
                                <h4>Excel Files</h4>
                                <div class="drop-zone" data-file-type="check-excel">
                                    <div class="drop-zone-content">
                                        <h4>Drop Excel CHECK file here</h4>
                                        <p>or <button type="button" class="btn-secondary">Browse Files</button></p>
                                        <p>Accepted formats: .xlsx, .xls</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="file-type-section">
                                <h4>PDF Files</h4>
                                <div class="drop-zone" data-file-type="check-pdf">
                                    <div class="drop-zone-content">
                                        <h4>Drop PDF CHECK file here</h4>
                                        <p>or <button type="button" class="btn-secondary">Browse Files</button></p>
                                        <p>Accepted formats: .pdf</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="file-info" id="checkFileInfo" style="display: none;"></div>
                    </div>

                    <div class="form-group">
                        <label>MANIFEST File (Actual Temperatures)</label>
                        
                        <div class="file-type-sections">
                            <div class="file-type-section">
                                <h4>Excel Files</h4>
                                <div class="drop-zone" data-file-type="manifest-excel">
                                    <div class="drop-zone-content">
                                        <h4>Drop Excel MANIFEST file here</h4>
                                        <p>or <button type="button" class="btn-secondary">Browse Files</button></p>
                                        <p>Accepted formats: .xlsx, .xls</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="file-type-section">
                                <h4>PDF Files</h4>
                                <div class="drop-zone" data-file-type="manifest-pdf">
                                    <div class="drop-zone-content">
                                        <h4>Drop PDF MANIFEST file here</h4>
                                        <p>or <button type="button" class="btn-secondary">Browse Files</button></p>
                                        <p>Accepted formats: .pdf</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="file-info" id="manifestFileInfo" style="display: none;"></div>
                    </div>
                </div>

                <div class="actions" style="margin: 20px 0; padding: 20px; text-align: center;">
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
                        
                        <div class="file-type-sections">
                            <div class="file-type-section">
                                <h4>Excel Files</h4>
                                <div class="drop-zone" data-file-type="reefer-list-excel">
                                    <div class="drop-zone-content">
                                        <h4>Drop Excel Reefer List file here</h4>
                                        <p>or <button type="button" class="btn-secondary">Browse Files</button></p>
                                        <p>Accepted formats: .xlsx, .xls</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="file-type-section">
                                <h4>PDF Files</h4>
                                <div class="drop-zone" data-file-type="reefer-list-pdf">
                                    <div class="drop-zone-content">
                                        <h4>Drop PDF Reefer List file here</h4>
                                        <p>or <button type="button" class="btn-secondary">Browse Files</button></p>
                                        <p>Accepted formats: .pdf</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="form-group">
                        <label>CT Monitoring Sheet (Multi-row blocks)</label>
                        
                        <div class="file-type-sections">
                            <div class="file-type-section">
                                <h4>Excel Files</h4>
                                <div class="drop-zone" data-file-type="ct-sheet-excel">
                                    <div class="drop-zone-content">
                                        <h4>Drop Excel CT Monitoring file here</h4>
                                        <p>or <button type="button" class="btn-secondary">Browse Files</button></p>
                                        <p>Accepted formats: .xlsx, .xls</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="file-type-section">
                                <h4>PDF Files</h4>
                                <div class="drop-zone" data-file-type="ct-sheet-pdf">
                                    <div class="drop-zone-content">
                                        <h4>Drop PDF CT Monitoring file here</h4>
                                        <p>or <button type="button" class="btn-secondary">Browse Files</button></p>
                                        <p>Accepted formats: .pdf</p>
                                    </div>
                                </div>
                            </div>
                        </div>
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

    initializeCTStowage() {
        console.log('CT Stowage view initialized');
        
        // Initialize file upload handlers for both Excel and PDF sections
        this.initializeFileUpload('reefer-list-excel', ['xlsx', 'xls']);
        this.initializeFileUpload('reefer-list-pdf', ['pdf']);
        this.initializeFileUpload('ct-sheet-excel', ['xlsx', 'xls']);
        this.initializeFileUpload('ct-sheet-pdf', ['pdf']);
        
        // Initialize process button
        const processBtn = document.getElementById('processCTBtn');
        if (processBtn) {
            processBtn.addEventListener('click', () => this.processCTStowage());
        }
        
        // Update button state
        this.updateProcessButton();
    }

    async processCTStowage() {
        if (!this.selectedFiles) {
            alert('Please select files first');
            return;
        }

        const reeferFile = this.selectedFiles['reefer-list-excel'] || this.selectedFiles['reefer-list-pdf'];
        const ctFile = this.selectedFiles['ct-sheet-excel'] || this.selectedFiles['ct-sheet-pdf'];

        if (!reeferFile || !ctFile) {
            alert('Please select both reefer list and CT sheet files');
            return;
        }

        try {
            const result = await window.safeMariAPI.processCT({
                reeferListPath: reeferFile,
                ctSheetPath: ctFile
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

    displayCTResults(result) {
        const resultsDiv = document.getElementById('ctResults');
        if (resultsDiv && result.results) {
            // Store result data for download
            this.ctResultData = result;
            
            const { totalContainers, matched, missing, preview } = result.results;
            
            let html = `
                <div class="results-section compact">
                    <h3>CT Stowage Results</h3>
                    <div class="results-summary inline">
                        <span><strong>Total:</strong> ${totalContainers}</span>
                        <span><strong>Matched:</strong> <span class="ok">${matched}</span></span>
                        <span><strong>Missing:</strong> <span class="${missing > 0 ? 'warn' : 'ok'}">${missing}</span></span>
                        <button id="downloadCTBtn" class="btn-primary compact-btn" onclick="downloadCTReport()" 
                                ${result.sortedCtRows ? '' : 'disabled'}>
                            Download Excel
                        </button>
                    </div>
                </div>
            `;
            
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = html;
        }
    }

    // Helper function for stowage formatting
    prettyStow(stow) {
        if (stow == null) return "";
        let digits = stow.toString().replace(/[^\d]/g, "");
        if (digits.length < 6) digits = digits.padStart(6, "0");
        return digits;
    }

    showDGChecker() {
        this.viewContainer.innerHTML = `
            <div class="view-content">
                <h2>DG Manifest Checker</h2>
                <p>Validate dangerous goods between PDF manifests and Excel stowage files.</p>
                
                <div class="file-inputs">
                    <div class="form-group">
                        <label>DG PDF Manifest</label>
                        <div class="drop-zone" data-file-type="dg-pdf">
                            <div class="drop-zone-content">
                                <h4>Drop DG PDF Manifest here</h4>
                                <p>or <button type="button" class="btn-secondary">Browse Files</button></p>
                                <p>Accepted formats: .pdf</p>
                            </div>
                        </div>
                        <div class="file-info" id="dgPdfFileInfo" style="display: none;"></div>
                    </div>

                    <div class="form-group">
                        <label>DG Stowage Excel</label>
                        <div class="drop-zone" data-file-type="dg-excel">
                            <div class="drop-zone-content">
                                <h4>Drop DG Stowage Excel file here</h4>
                                <p>or <button type="button" class="btn-secondary">Browse Files</button></p>
                                <p>Accepted formats: .xlsx, .xls</p>
                            </div>
                        </div>
                        <div class="file-info" id="dgExcelFileInfo" style="display: none;"></div>
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
                <h2>Generic 2-List Reconciliation</h2>
                <p>Compare two container lists to find common containers, unique to each list.</p>
                
                <div class="file-inputs">
                    <div class="form-group">
                        <label>File A</label>
                        <div class="drop-zone" data-file-type="excel-a">
                            <div class="drop-zone-content">
                                <h4>Drop File A here</h4>
                                <p>or <button type="button" class="btn-secondary">Browse Files</button></p>
                                <p>Accepted formats: .xlsx, .xls, .pdf</p>
                            </div>
                        </div>
                        <div class="file-info" id="excelAFileInfo" style="display: none;"></div>
                    </div>

                    <div class="form-group">
                        <label>File B</label>
                        <div class="drop-zone" data-file-type="excel-b">
                            <div class="drop-zone-content">
                                <h4>Drop File B here</h4>
                                <p>or <button type="button" class="btn-secondary">Browse Files</button></p>
                                <p>Accepted formats: .xlsx, .xls, .pdf</p>
                            </div>
                        </div>
                        <div class="file-info" id="excelBFileInfo" style="display: none;"></div>
                    </div>
                </div>

                <div class="actions">
                    <button id="processCompareBtn" class="btn-primary" disabled>Process List Comparison</button>
                </div>

                <div id="compareResults" style="display: none;"></div>
            </div>
        `;
        
        this.initializeListCompare();
    }

    showLogs() {
        this.viewContainer.innerHTML = `
            <div class="view-content">
                <h2>Activity History</h2>
                <p>View your processing history and export activity logs.</p>
                
                <div class="logs-controls">
                    <button id="refreshLogsBtn" class="btn-secondary">Refresh</button>
                    <button id="exportLogsBtn" class="btn-primary">Export History</button>
                </div>

                <div id="logsContainer" class="logs-container">
                    <p>Loading activity history...</p>
                </div>
            </div>
        `;
        
        this.initializeLogs();
    }

    async showSettings() {
        this.viewContainer.innerHTML = `
            <div class="view-content">
                <h2>Settings</h2>
                <p>Configure application preferences and manage data.</p>
                
                <div class="settings-sections">
                    <div class="settings-section">
                        <h3>User Information</h3>
                        <div class="form-group">
                            <label>Username</label>
                            <input type="text" id="username" class="form-control" placeholder="Enter your username">
                        </div>
                        <button id="saveUsername" class="btn-primary">Save Username</button>
                    </div>
                    
                    <div class="settings-section">
                        <h3>Data Management</h3>
                        <button id="clearCache" class="btn-secondary">Clear Application Cache</button>
                        <p class="help-text">This will clear temporary files and reset application cache.</p>
                    </div>
                    
                    <div class="settings-section">
                        <h3>Export Preferences</h3>
                        <div class="form-group">
                            <label>Default Export Format</label>
                            <select id="exportFormat" class="form-control">
                                <option value="xlsx">Excel (.xlsx)</option>
                                <option value="csv">CSV (.csv)</option>
                            </select>
                        </div>
                        <button id="saveExportFormat" class="btn-primary">Save Preferences</button>
                    </div>
                </div>
            </div>
        `;
        
        this.initializeSettings();
    }

    async showLicenseInfo() {
        const licenseInfo = await window.safeMariAPI.getLicenseInfo();
        
        this.viewContainer.innerHTML = `
            <div class="view-content">
                <h2>License Information</h2>
                <p>View current license status and machine information.</p>
                
                <div class="license-info-sections">
                    <div class="info-section">
                        <h3>Machine Information</h3>
                        <div class="info-grid">
                            <div class="info-item">
                                <label>Machine ID</label>
                                <code>${licenseInfo.machineId || 'Unknown'}</code>
                            </div>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h3>License Status</h3>
                        <div class="info-grid">
                            <div class="info-item">
                                <label>Status</label>
                                <span class="status ${licenseInfo.isLicensed ? 'licensed' : 'unlicensed'}">
                                    ${licenseInfo.isLicensed ? 'Licensed' : 'Not Licensed'}
                                </span>
                            </div>
                            ${licenseInfo.licenseData ? `
                                <div class="info-item">
                                    <label>Expiry Date</label>
                                    <span>${licenseInfo.licenseData.expiry}</span>
                                </div>
                                <div class="info-item">
                                    <label>Activated Date</label>
                                    <span>${licenseInfo.licenseData.activated_date}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    
                    ${!licenseInfo.isLicensed ? `
                        <div class="info-section">
                            <h3>Activate License</h3>
                            <button id="showLicenseModal" class="btn-primary">Enter License Code</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        this.initializeLicenseInfo();
    }

    async showAbout() {
        const appInfo = await window.safeMariAPI.getAppInfo();
        
        this.viewContainer.innerHTML = `
            <div class="view-content">
                <h2>About SafeMari Cargo Tools</h2>
                
                <div class="about-sections">
                    <div class="about-section">
                        <h3>Application Information</h3>
                        <div class="info-grid">
                            <div class="info-item">
                                <label>Version</label>
                                <span>${appInfo.version}</span>
                            </div>
                            <div class="info-item">
                                <label>Name</label>
                                <span>${appInfo.name}</span>
                            </div>
                            <div class="info-item">
                                <label>Description</label>
                                <span>${appInfo.description}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="about-section">
                        <h3>Features</h3>
                        <ul class="feature-list">
                            <li>Reefer Temperature Validation</li>
                            <li>CT Stowage Organization</li>
                            <li>DG Manifest Checking</li>
                            <li>Container List Reconciliation</li>
                            <li>Local Activity Logging</li>
                            <li>Offline Operation</li>
                        </ul>
                    </div>
                    
                    <div class="about-section">
                        <h3>Contact Information</h3>
                        <p>For support and licensing inquiries, please contact SafeMari support.</p>
                    </div>
                </div>
            </div>
        `;
    }

    // Placeholder methods for view initialization
    initializeReeferTemp() { 
        console.log('Reefer Temp view initialized');
        
        // Initialize file upload handlers for both Excel and PDF sections
        this.initializeFileUpload('check-excel', ['xlsx', 'xls']);
        this.initializeFileUpload('check-pdf', ['pdf']);
        this.initializeFileUpload('manifest-excel', ['xlsx', 'xls']);
        this.initializeFileUpload('manifest-pdf', ['pdf']);
        
        // Initialize process button
        const processBtn = document.getElementById('processReeferBtn');
        if (processBtn) {
            processBtn.addEventListener('click', () => this.processReeferCheck());
        }
        
        // Update button state after file initialization
        this.updateProcessButton();
    }

    initializeFileUpload(fileType, allowedExtensions) {
        const dropZone = document.querySelector(`[data-file-type="${fileType}"]`);
        const browseBtn = dropZone?.querySelector('.btn-secondary');
        
        if (!dropZone || !browseBtn) {
            console.warn(`Drop zone or browse button not found for ${fileType}`);
            return;
        }

        console.log(`Initializing file upload for ${fileType}`);

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
            filters.push({ name: 'All Files', extensions: ['*'] });

            const result = await window.safeMariAPI.selectFile({ filters });
            
            if (result.success && !result.cancelled) {
                this.handleFileSelection(fileType, result.filePath);
            }
        });

        // Drag and drop handlers
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
            
            console.log(`Drop event for ${fileType}:`, e.dataTransfer.files);
            
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) {
                const file = files[0];
                const extension = file.name.split('.').pop().toLowerCase();
                
                if (allowedExtensions.includes(extension)) {
                    // Use file path for Electron
                    this.handleFileSelection(fileType, file.path || file.name);
                } else {
                    alert(`Invalid file type. Please select: ${allowedExtensions.join(', ')}`);
                }
            }
        });

        console.log(`File upload initialized for ${fileType} with extensions:`, allowedExtensions);
    }

    handleFileSelection(fileType, filePath) {
        console.log(`File selected for ${fileType}:`, filePath);
        
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
            const hasCheckFile = this.selectedFiles['check-excel'] || this.selectedFiles['check-pdf'];
            const hasManifestFile = this.selectedFiles['manifest-excel'] || this.selectedFiles['manifest-pdf'];
            reeferBtn.disabled = !(hasCheckFile && hasManifestFile);
        }

        // CT Stowage Sorter
        if (ctBtn) {
            const hasReeferFile = this.selectedFiles['reefer-list-excel'] || this.selectedFiles['reefer-list-pdf'];
            const hasCTFile = this.selectedFiles['ct-sheet-excel'] || this.selectedFiles['ct-sheet-pdf'];
            ctBtn.disabled = !(hasReeferFile && hasCTFile);
        }

        // DG Manifest Checker
        if (dgBtn) {
            const hasPDFFile = this.selectedFiles['dg-pdf'];
            const hasExcelFile = this.selectedFiles['dg-excel'];
            dgBtn.disabled = !(hasPDFFile && hasExcelFile);
        }

        // List Compare
        if (compareBtn) {
            const hasFileA = this.selectedFiles['excel-a'];
            const hasFileB = this.selectedFiles['excel-b'];
            compareBtn.disabled = !(hasFileA && hasFileB);
        }
    }

    async processReeferCheck() {
        if (!this.selectedFiles) {
            alert('Please select files first');
            return;
        }

        const checkFile = this.selectedFiles['check-excel'] || this.selectedFiles['check-pdf'];
        const manifestFile = this.selectedFiles['manifest-excel'] || this.selectedFiles['manifest-pdf'];

        if (!checkFile || !manifestFile) {
            alert('Please select both CHECK and MANIFEST files');
            return;
        }

        try {
            const result = await window.safeMariAPI.processReefer({
                checkFilePath: checkFile,
                manifestFilePath: manifestFile
            });

            if (result.success) {
                this.displayReeferResults(result);
            } else {
                alert(`Processing failed: ${result.error}`);
            }
        } catch (error) {
            console.error('Reefer processing error:', error);
            alert(`Error: ${error.message}`);
        }
    }

    displayReeferResults(result) {
        const resultsDiv = document.getElementById('reeferResults');
        if (resultsDiv) {
            resultsDiv.style.display = 'block';
            
            const summary = result.summary;
            const hasResults = summary && typeof summary === 'object';
            
            let html = `
                <div class="results-section compact">
                    <h3>Temperature Check Results</h3>
                    <div class="results-summary inline">
            `;
            
            if (hasResults) {
                // Compact summary display
                html += `
                    <span><strong>Total:</strong> ${summary.totalCheck || 0}</span>
                    <span><strong>Found:</strong> <span class="ok">${summary.found || 0}</span></span>
                    <span><strong>Missing:</strong> <span class="${(summary.missing > 0) ? 'warn' : 'ok'}">${summary.missing || 0}</span></span>
                    <span><strong>Mismatches:</strong> <span class="${(summary.mismatches > 0) ? 'warn' : 'ok'}">${summary.mismatches || 0}</span></span>
                `;
                
                // Add download button if there are mismatches
                if (summary.mismatchList && summary.mismatchList.length > 0) {
                    html += `
                        <button id="downloadReeferBtn" class="btn-primary compact-btn" onclick="downloadReeferReport()">
                            Download Excel Report
                        </button>
                    `;
                }
            } else {
                html += `<p><strong>Processing completed successfully!</strong></p>`;
                html += `<p>Summary: ${typeof summary === 'string' ? summary : 'Processing complete'}</p>`;
            }
            
            html += `
                    </div>
                </div>
            `;
            
            resultsDiv.innerHTML = html;
            
            // Store download data globally for download function
            if (result.downloadData) {
                window.reeferDownloadData = result.downloadData;
            }
        }
    }

    // Download reefer Excel report
    async downloadReeferReport() {
        if (!window.reeferDownloadData) {
            alert('No mismatches to export.');
            return;
        }
        
        try {
            const result = await window.safeMariAPI.downloadExcelReport({
                rows: window.reeferDownloadData,
                filename: 'reefer_mismatches_report.xlsx'
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

    // Placeholder methods for view initialization
    initializeDGChecker() { 
        console.log('DG Checker view initialized');
        
        // Initialize file upload handlers
        this.initializeFileUpload('dg-pdf', ['pdf']);
        this.initializeFileUpload('dg-excel', ['xlsx', 'xls']);
        
        // Initialize process button
        const processBtn = document.getElementById('processDGBtn');
        if (processBtn) {
            processBtn.addEventListener('click', () => this.processDGCheck());
        }
    }

    async processDGCheck() {
        if (!this.selectedFiles) {
            alert('Please select files first');
            return;
        }

        const pdfFile = this.selectedFiles['dg-pdf'];
        const excelFile = this.selectedFiles['dg-excel'];

        if (!pdfFile || !excelFile) {
            alert('Please select both PDF manifest and Excel stowage files');
            return;
        }

        try {
            const result = await window.safeMariAPI.processDG({
                pdfPath: pdfFile,
                excelPath: excelFile
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

    displayDGResults(result) {
        const resultsDiv = document.getElementById('dgResults');
        if (resultsDiv) {
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = `
                <div class="results-section">
                    <h3>DG Manifest Check Results</h3>
                    <div class="results-summary">
                        <p><strong>Processing completed successfully!</strong></p>
                        <p>Summary: ${result.summary || 'Processing complete'}</p>
                    </div>
                    <div class="results-data">
                        <pre>${JSON.stringify(result.results, null, 2)}</pre>
                    </div>
                </div>
            `;
        }
    }

    initializeListCompare() { 
        console.log('List Compare view initialized');
        
        // Initialize file upload handlers
        this.initializeFileUpload('excel-a', ['xlsx', 'xls', 'pdf']);
        this.initializeFileUpload('excel-b', ['xlsx', 'xls', 'pdf']);
        
        // Initialize process button
        const processBtn = document.getElementById('processCompareBtn');
        if (processBtn) {
            processBtn.addEventListener('click', () => this.processListCompare());
        }
    }

    async processListCompare() {
        if (!this.selectedFiles) {
            alert('Please select files first');
            return;
        }

        const fileA = this.selectedFiles['excel-a'];
        const fileB = this.selectedFiles['excel-b'];

        if (!fileA || !fileB) {
            alert('Please select both File A and File B');
            return;
        }

        try {
            const result = await window.safeMariAPI.processCompare({
                fileAPath: fileA,
                fileBPath: fileB
            });

            if (result.success) {
                this.displayCompareResults(result);
            } else {
                alert(`Processing failed: ${result.error}`);
            }
        } catch (error) {
            console.error('Compare processing error:', error);
            alert(`Error: ${error.message}`);
        }
    }

    displayCompareResults(result) {
        const resultsDiv = document.getElementById('compareResults');
        if (resultsDiv) {
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = `
                <div class="results-section">
                    <h3>List Comparison Results</h3>
                    <div class="results-summary">
                        <p><strong>Processing completed successfully!</strong></p>
                        <p>Summary: ${result.summary || 'Processing complete'}</p>
                    </div>
                    <div class="results-data">
                        <pre>${JSON.stringify(result.results, null, 2)}</pre>
                    </div>
                </div>
            `;
        }
    }

    async initializeLogs() {
        const refreshBtn = document.getElementById('refreshLogsBtn');
        const exportBtn = document.getElementById('exportLogsBtn');
        const container = document.getElementById('logsContainer');

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadLogs());
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportLogs());
        }

        // Load logs on initialization
        this.loadLogs();
    }

    async loadLogs() {
        const container = document.getElementById('logsContainer');
        if (!container) return;

        try {
            const response = await window.safeMariAPI.getLogs();
            if (response.success && response.logs) {
                this.displayLogs(response.logs);
            } else {
                container.innerHTML = '<p>No activity history found.</p>';
            }
        } catch (error) {
            console.error('Failed to load logs:', error);
            container.innerHTML = '<p>Failed to load activity history.</p>';
        }
    }

    displayLogs(logs) {
        const container = document.getElementById('logsContainer');
        if (!container || !logs || logs.length === 0) {
            container.innerHTML = '<p>No activity history found.</p>';
            return;
        }

        const logsHtml = logs.map(log => `
            <div class="log-entry">
                <div class="log-header">
                    <span class="log-operation">${log.operation}</span>
                    <span class="log-timestamp">${new Date(log.timestamp).toLocaleString()}</span>
                </div>
                <div class="log-details">
                    ${log.details ? `<p>${log.details}</p>` : ''}
                    ${log.result === 'success' ? 
                        '<span class="log-status success">Success</span>' : 
                        '<span class="log-status error">Failed</span>'
                    }
                </div>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="logs-list">
                ${logsHtml}
            </div>
        `;
    }

    async exportLogs() {
        try {
            const response = await window.safeMariAPI.exportLogs({
                format: 'excel',
                filename: 'safemari-activity-history'
            });
            
            if (response.success) {
                alert('Activity history exported successfully!');
            } else {
                alert('Failed to export activity history: ' + (response.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Export error:', error);
            alert('Failed to export activity history.');
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
            logsTable.innerHTML = `
                <div class="logs-empty">
                    <p>No logs found for the selected criteria.</p>
                </div>
            `;
            return;
        }
        
        let html = `
            <div class="logs-container">
                <div class="logs-header">
                    <h3>Activity Logs (${logs.length} entries)</h3>
                </div>
                <div class="logs-table-wrapper">
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
            const status = log.success ? 'Success' : 'Error';
            const statusClass = log.success ? 'status-success' : 'status-error';
            const details = this.formatLogDetails(log);
            
            html += `
                <tr>
                    <td class="log-timestamp">${date}</td>
                    <td class="log-module">${log.module || 'System'}</td>
                    <td class="log-operation">${log.operation || 'N/A'}</td>
                    <td class="log-status"><span class="${statusClass}">${status}</span></td>
                    <td class="log-details">${details}</td>
                </tr>
            `;
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
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
            if (log.results.total) details += `Total: ${log.results.total} | `;
            if (log.results.matched) details += `Matched: ${log.results.matched} | `;
            if (log.results.missing) details += `Missing: ${log.results.missing} | `;
        }
        
        if (log.error) {
            details += `Error: ${log.error}`;
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
                // User cancelled, do nothing
            } else {
                alert(`Export failed: ${result.error}`);
            }
            
        } catch (error) {
            console.error('Error exporting logs:', error);
            alert(`Export error: ${error.message}`);
        }
    }

    initializeSettings() { 
        console.log('Settings view initialized'); 
    }

    initializeLicenseInfo() { 
        const showModalBtn = document.getElementById('showLicenseModal');
        if (showModalBtn) {
            showModalBtn.addEventListener('click', () => {
                document.getElementById('licenseModal').style.display = 'flex';
            });
        }
    }

    bindFeatureCards() {
        const cards = document.querySelectorAll('.feature-card');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                const view = card.getAttribute('data-view');
                if (view) {
                    this.navigateTo(view);
                }
            });
        });
    }

    showError(message) {
        console.error(message);
        // TODO: Implement proper error display
        alert(message);
    }

    // Global download function for reefer reports
    async downloadReeferReportGlobal() {
        if (!window.reeferDownloadData) {
            alert('No mismatches to export.');
            return;
        }
        
        try {
            const result = await window.safeMariAPI.downloadExcelReport({
                rows: window.reeferDownloadData,
                filename: 'reefer_mismatches_report.xlsx'
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

    // Global download function for CT reports
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
}