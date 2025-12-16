const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const LicenseChecker = require('./verifier/checkLicense');

// Import cargo modules
const ReeferChecker = require('../modules/reefer');
const CTStowageSorter = require('../modules/ct');
const DGChecker = require('../modules/dg');
const ListCompare = require('../modules/compare');
const LoggingSystem = require('../modules/logging');

class SafeMariApp {
    constructor() {
        this.mainWindow = null;
        this.licenseChecker = new LicenseChecker();
        this.isLicensed = false;
        
        // Initialize cargo modules
        this.reeferChecker = new ReeferChecker();
        this.ctSorter = new CTStowageSorter();
        this.dgChecker = new DGChecker();
        this.listCompare = new ListCompare();
        this.logger = new LoggingSystem();
        
        // App settings
        this.settings = {
            username: 'Unknown User',
            exportFormat: 'xlsx'
        };
        
        // Initialize AI system
        this.initializeAI();
        
        this.initializeApp();
    }

    /**
     * Initialize AI system for enhanced column detection
     */
    async initializeAI() {
        try {
            console.log('Initializing AI system...');
            
            // Initialize AI in cargo modules that support it
            if (this.reeferChecker.initialize) {
                await this.reeferChecker.initialize();
            }
            
            if (this.ctSorter.initialize) {
                await this.ctSorter.initialize();
            }
            
            console.log('AI system initialized successfully');
        } catch (error) {
            console.warn('AI initialization failed, using JavaScript fallback:', error);
        }
    }

    initializeApp() {
        // Handle app ready
        app.whenReady().then(() => {
            this.createMainWindow();
            this.setupIpcHandlers();
            this.checkLicenseOnStartup();

            app.on('activate', () => {
                if (BrowserWindow.getAllWindows().length === 0) {
                    this.createMainWindow();
                }
            });
        });

        // Handle app quit
        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit();
            }
        });

        // Security: Prevent new window creation
        app.on('web-contents-created', (event, contents) => {
            contents.on('new-window', (event, navigationUrl) => {
                event.preventDefault();
                console.log('Blocked new window creation to:', navigationUrl);
            });
        });
    }

    createMainWindow() {
        this.mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            minWidth: 800,
            minHeight: 600,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                preload: path.join(__dirname, 'preload.js')
            },
            icon: path.join(__dirname, '..', 'ui', 'assets', 'icon.png'),
            title: 'SafeMari Cargo Tools',
            show: false // Don't show until ready
        });

        // Load the main UI
        this.mainWindow.loadFile(path.join(__dirname, '..', 'ui', 'index.html'));

        // Show when ready
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow.show();
        });

        // Handle window closed
        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });

        // Development mode
        if (process.env.NODE_ENV === 'development') {
            this.mainWindow.webContents.openDevTools();
        }
    }

    checkLicenseOnStartup() {
        try {
            // First check if license file exists and load it
            const savedLicense = this.licenseChecker.loadLicense();
            
            if (savedLicense) {
                // Validate the loaded license
                const validation = this.licenseChecker.validateLicense();
                this.isLicensed = validation.isValid;
                
                if (validation.isValid) {
                    // Restore license data to memory
                    this.licenseChecker.licenseData = savedLicense;
                    console.log('License restored successfully from file');
                } else {
                    console.log('Saved license is invalid:', validation.reason);
                }
            } else {
                this.isLicensed = false;
                console.log('No saved license found');
            }

            // Send license status to renderer
            if (this.mainWindow && this.mainWindow.webContents) {
                this.mainWindow.webContents.send('license-status', {
                    isLicensed: this.isLicensed,
                    validation: savedLicense ? this.licenseChecker.validateLicense() : { isValid: false, reason: 'No license found' },
                    machineId: this.licenseChecker.getLicenseStatus().machineId
                });
            }
        } catch (error) {
            console.error('License startup check failed:', error);
            this.isLicensed = false;
        }
    }

    setupIpcHandlers() {
        // Get machine ID
        ipcMain.handle('get-machine-id', async () => {
            try {
                return {
                    success: true,
                    machineId: this.licenseChecker.getLicenseStatus().machineId
                };
            } catch (error) {
                return {
                    success: false,
                    error: error.message
                };
            }
        });

        // Check license status
        ipcMain.handle('check-license', async () => {
            try {
                const validation = this.licenseChecker.validateLicense();
                this.isLicensed = validation.isValid;
                
                return {
                    success: true,
                    ...validation
                };
            } catch (error) {
                return {
                    success: false,
                    isValid: false,
                    error: error.message
                };
            }
        });

        // Activate license
        ipcMain.handle('activate-license', async (event, licenseCode) => {
            try {
                const result = this.licenseChecker.activateLicense(licenseCode);
                
                if (result.success) {
                    this.isLicensed = true;
                }
                
                return result;
            } catch (error) {
                return {
                    success: false,
                    reason: 'Activation error: ' + error.message
                };
            }
        });

        // Get license info
        ipcMain.handle('get-license-info', async () => {
            try {
                const status = this.licenseChecker.getLicenseStatus();
                const validation = this.licenseChecker.validateLicense();
                
                return {
                    success: true,
                    isLicensed: this.isLicensed,
                    machineId: status.machineId,
                    licenseData: status.licenseData,
                    validation: validation
                };
            } catch (error) {
                return {
                    success: false,
                    error: error.message
                };
            }
        });

        // File operations
        ipcMain.handle('select-file', async (event, options = {}) => {
            try {
                const result = await dialog.showOpenDialog(this.mainWindow, {
                    properties: ['openFile'],
                    filters: options.filters || [
                        { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
                        { name: 'PDF Files', extensions: ['pdf'] },
                        { name: 'All Files', extensions: ['*'] }
                    ]
                });

                return {
                    success: true,
                    cancelled: result.canceled,
                    filePath: result.canceled ? null : result.filePaths[0]
                };
            } catch (error) {
                return {
                    success: false,
                    error: error.message
                };
            }
        });

        // Save file dialog
        ipcMain.handle('save-file', async (event, options = {}) => {
            try {
                const result = await dialog.showSaveDialog(this.mainWindow, {
                    filters: options.filters || [
                        { name: 'Excel Files', extensions: ['xlsx'] },
                        { name: 'All Files', extensions: ['*'] }
                    ],
                    defaultPath: options.defaultPath || 'export.xlsx'
                });

                return {
                    success: true,
                    cancelled: result.canceled,
                    filePath: result.canceled ? null : result.filePath
                };
            } catch (error) {
                return {
                    success: false,
                    error: error.message
                };
            }
        });

        // Resolve file path from filename (for drag and drop support)
        ipcMain.handle('resolve-file-path', async (event, fileName) => {
            try {
                const path = require('path');
                const fs = require('fs').promises;
                
                // Common locations to search for the file
                const searchPaths = [
                    path.join(require('os').homedir(), 'Downloads'),
                    path.join(require('os').homedir(), 'Documents'),
                    path.join(require('os').homedir(), 'Desktop'),
                    process.cwd()
                ];
                
                // Search for the file in common locations
                for (const searchPath of searchPaths) {
                    try {
                        const fullPath = path.join(searchPath, fileName);
                        await fs.access(fullPath);
                        return { success: true, filePath: fullPath };
                    } catch (e) {
                        // File not found in this location, continue searching
                    }
                }
                
                return { success: false, error: `File "${fileName}" not found in common locations` };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // App info
        ipcMain.handle('get-app-info', async () => {
            const packageJson = require('../package.json');
            return {
                success: true,
                name: packageJson.name,
                version: packageJson.version,
                description: packageJson.description
            };
        });

        // Check if licensed for operations
        ipcMain.handle('check-license-for-operation', async () => {
            return {
                success: true,
                isLicensed: this.isLicensed
            };
        });

        // Get AI system status
        ipcMain.handle('get-ai-status', async () => {
            try {
                const status = {
                    reeferSmartAI: this.reeferChecker.hybridDetector ? this.reeferChecker.hybridDetector.getStatus() : { hybridReady: false },
                    ctSmartAI: this.ctSorter.hybridDetector ? this.ctSorter.hybridDetector.getStatus() : { hybridReady: false },
                    overall: {
                        smartAISupported: true,
                        smartAILoaded: false,
                        fallbackReady: true
                    }
                };
                
                return {
                    success: true,
                    status
                };
            } catch (error) {
                return {
                    success: false,
                    error: error.message,
                    status: { smartAISupported: false, fallbackReady: true }
                };
            }
        });

        // Cargo processing handlers
        ipcMain.handle('process-reefer', async (event, data) => {
            return await this.processReeferOperation(data);
        });

        ipcMain.handle('process-ct', async (event, data) => {
            return await this.processCTOperation(data);
        });

        ipcMain.handle('process-dg', async (event, data) => {
            return await this.processDGOperation(data);
        });

        ipcMain.handle('process-compare', async (event, data) => {
            return await this.processCompareOperation(data);
        });

        // Logging handlers
        ipcMain.handle('get-logs', async (event, filters) => {
            return await this.logger.getLogs(filters);
        });

        ipcMain.handle('export-logs', async (event, options) => {
            try {
                const result = await dialog.showSaveDialog(this.mainWindow, {
                    filters: [
                        { name: 'CSV Files', extensions: ['csv'] },
                        { name: 'JSON Files', extensions: ['json'] },
                        { name: 'All Files', extensions: ['*'] }
                    ],
                    defaultPath: 'safemari_logs.csv'
                });

                if (!result.canceled && result.filePath) {
                    return await this.logger.exportLogs(result.filePath, options.filters);
                }

                return { success: false, cancelled: true };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('add-log', async (event, logData) => {
            return await this.logger.addLog(logData);
        });

        // Settings handlers
        ipcMain.handle('get-settings', async () => {
            return { success: true, settings: this.settings };
        });

        ipcMain.handle('save-settings', async (event, newSettings) => {
            try {
                this.settings = { ...this.settings, ...newSettings };
                return { success: true };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // Excel download handler
        ipcMain.handle('download-excel-report', async (event, data) => {
            try {
                const { rows, filename } = data;
                
                // Validate that rows is an array
                if (!Array.isArray(rows)) {
                    throw new Error('Invalid data format: rows must be an array');
                }
                
                const { dialog } = require('electron');
                const ExcelJS = require('exceljs');
                
                // Show save dialog
                const result = await dialog.showSaveDialog(this.mainWindow, {
                    title: 'Save Excel Report',
                    defaultPath: filename || 'report.xlsx',
                    filters: [
                        { name: 'Excel Files', extensions: ['xlsx'] },
                        { name: 'All Files', extensions: ['*'] }
                    ]
                });
                
                if (result.canceled) {
                    return { success: false, cancelled: true };
                }
                
                // Create workbook and worksheet
                const workbook = new ExcelJS.Workbook();
                const worksheet = workbook.addWorksheet('Report');
                
                // Add data
                rows.forEach((row, index) => {
                    worksheet.addRow(row);
                    if (index === 0) {
                        // Style header row
                        const headerRow = worksheet.getRow(1);
                        headerRow.font = { bold: true };
                        headerRow.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFE0E0E0' }
                        };
                    }
                });
                
                // Auto-fit columns
                worksheet.columns.forEach(column => {
                    let maxLength = 0;
                    column.eachCell({ includeEmpty: true }, cell => {
                        const length = cell.value ? cell.value.toString().length : 10;
                        if (length > maxLength) {
                            maxLength = length;
                        }
                    });
                    column.width = Math.min(maxLength + 2, 50);
                });
                
                // Save file
                await workbook.xlsx.writeFile(result.filePath);
                
                return { 
                    success: true, 
                    filePath: result.filePath,
                    message: 'Report exported successfully' 
                };
                
            } catch (error) {
                console.error('Excel export error:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('download-ct-report', async (event, data) => {
            try {
                const { dialog } = require('electron');
                const ExcelJS = require('exceljs');
                
                // Show save dialog
                const result = await dialog.showSaveDialog(this.mainWindow, {
                    title: 'Save CT Sorted Report',
                    defaultPath: 'CT_Sorted_By_Stowage.xlsx',
                    filters: [
                        { name: 'Excel Files', extensions: ['xlsx'] },
                        { name: 'All Files', extensions: ['*'] }
                    ]
                });
                
                if (result.canceled) {
                    return { success: false, canceled: true };
                }
                
                // Create workbook
                const workbook = new ExcelJS.Workbook();
                const worksheet = workbook.addWorksheet('CT_Sorted');
                
                // Add sorted CT rows
                if (data.sortedCtRows && data.sortedCtRows.length > 0) {
                    data.sortedCtRows.forEach((rowData, rowIndex) => {
                        const row = worksheet.getRow(rowIndex + 1);
                        rowData.forEach((cellValue, colIndex) => {
                            row.getCell(colIndex + 1).value = cellValue;
                        });
                    });
                }
                
                // Save file
                await workbook.xlsx.writeFile(result.filePath);
                
                return { 
                    success: true, 
                    filePath: result.filePath,
                    message: 'CT Report downloaded successfully' 
                };
                
            } catch (error) {
                console.error('CT download error:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('download-dg-report', async (event, data) => {
            try {
                const { dialog } = require('electron');
                
                const result = await dialog.showSaveDialog(this.mainWindow, {
                    title: 'Save DG Validation Report',
                    defaultPath: data.filename || 'dg_validation_report.xlsx',
                    filters: [
                        { name: 'Excel Files', extensions: ['xlsx'] },
                        { name: 'All Files', extensions: ['*'] }
                    ]
                });
                
                if (result.canceled) {
                    return { success: false, cancelled: true };
                }
                
                // Use the existing export functionality from DGChecker
                const exportResult = await this.dgChecker.exportResults(result.filePath);
                
                if (exportResult.success) {
                    return { 
                        success: true, 
                        filePath: result.filePath,
                        message: 'DG validation report exported successfully' 
                    };
                } else {
                    return exportResult;
                }
                
            } catch (error) {
                console.error('DG download error:', error);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('clear-cache', async () => {
            try {
                // Clear old logs (keep last 30 days)
                const result = await this.logger.clearOldLogs(30);
                return result;
            } catch (error) {
                return { success: false, error: error.message };
            }
        });
    }

    // Cargo processing methods
    async processReeferOperation(data) {
        const startTime = Date.now();
        
        try {
            if (!this.isLicensed) {
                return { success: false, error: 'License required for this operation' };
            }

            const result = await this.reeferChecker.processReeferCheck(data);
            const duration = Date.now() - startTime;

            // Log the operation
            const licenseStatus = this.licenseChecker.getLicenseStatus();
            const validation = this.licenseChecker.validateLicense();
            
            await this.logger.logCargoOperation(
                'reefer',
                { fileA: data.checkFilePath, fileB: data.manifestFilePath },
                result,
                this.settings.username,
                licenseStatus.machineId,
                validation.daysRemaining,
                duration
            );

            if (result.success && data.exportPath) {
                await this.reeferChecker.exportResults(data.exportPath);
            }

            return result;

        } catch (error) {
            console.error('Reefer operation error:', error);
            return { success: false, error: error.message };
        }
    }

    async processCTOperation(data) {
        const startTime = Date.now();
        
        try {
            if (!this.isLicensed) {
                return { success: false, error: 'License required for this operation' };
            }

            const result = await this.ctSorter.processCTStowage(data);
            const duration = Date.now() - startTime;

            // Log the operation
            const licenseStatus = this.licenseChecker.getLicenseStatus();
            const validation = this.licenseChecker.validateLicense();
            
            await this.logger.logCargoOperation(
                'ct',
                { fileA: data.reeferListPath, fileB: data.ctSheetPath },
                result,
                this.settings.username,
                licenseStatus.machineId,
                validation.daysRemaining,
                duration
            );

            if (result.success && data.exportPath) {
                await this.ctSorter.exportResults(data.exportPath);
            }

            return result;

        } catch (error) {
            console.error('CT operation error:', error);
            return { success: false, error: error.message };
        }
    }

    async processDGOperation(data) {
        const startTime = Date.now();
        
        try {
            if (!this.isLicensed) {
                return { success: false, error: 'License required for this operation' };
            }

            const result = await this.dgChecker.processDGCheck(data);
            const duration = Date.now() - startTime;

            // Log the operation
            const licenseStatus = this.licenseChecker.getLicenseStatus();
            const validation = this.licenseChecker.validateLicense();
            
            await this.logger.logCargoOperation(
                'dg',
                { fileA: data.pdfPath, fileB: data.excelPath },
                result,
                this.settings.username,
                licenseStatus.machineId,
                validation.daysRemaining,
                duration
            );

            if (result.success && data.exportPath) {
                await this.dgChecker.exportResults(data.exportPath);
            }

            return result;

        } catch (error) {
            console.error('DG operation error:', error);
            return { success: false, error: error.message };
        }
    }

    async processCompareOperation(data) {
        const startTime = Date.now();
        
        try {
            if (!this.isLicensed) {
                return { success: false, error: 'License required for this operation' };
            }

            const result = await this.listCompare.processListComparison(data);
            const duration = Date.now() - startTime;

            // Log the operation
            const licenseStatus = this.licenseChecker.getLicenseStatus();
            const validation = this.licenseChecker.validateLicense();
            
            await this.logger.logCargoOperation(
                'compare',
                { fileA: data.fileAPath, fileB: data.fileBPath },
                result,
                this.settings.username,
                licenseStatus.machineId,
                validation.daysRemaining,
                duration
            );

            if (result.success && data.exportPath) {
                await this.listCompare.exportResults(data.exportPath);
            }

            return result;

        } catch (error) {
            console.error('Compare operation error:', error);
            return { success: false, error: error.message };
        }
    }
}

// Create app instance
new SafeMariApp();