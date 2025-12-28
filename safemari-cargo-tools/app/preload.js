const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('safeMariAPI', {
    // License operations
    getMachineId: () => ipcRenderer.invoke('get-machine-id'),
    checkLicense: () => ipcRenderer.invoke('check-license'),
    activateLicense: (licenseCode) => ipcRenderer.invoke('activate-license', licenseCode),
    getLicenseInfo: () => ipcRenderer.invoke('get-license-info'),
    checkLicenseForOperation: () => ipcRenderer.invoke('check-license-for-operation'),

    // File operations
    selectFile: (options) => ipcRenderer.invoke('select-file', options),
    saveFile: (options) => ipcRenderer.invoke('save-file', options),
    resolveFilePath: (fileName) => ipcRenderer.invoke('resolve-file-path', fileName),

    // App info
    getAppInfo: () => ipcRenderer.invoke('get-app-info'),
    getAIStatus: () => ipcRenderer.invoke('get-ai-status'),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),

    // Event listeners
    onLicenseStatus: (callback) => ipcRenderer.on('license-status', callback),
    removeLicenseStatusListener: (callback) => ipcRenderer.removeListener('license-status', callback),

    // Cargo module operations (will be implemented with modules)
    processReefer: (data) => ipcRenderer.invoke('process-reefer', data),
    processCT: (data) => ipcRenderer.invoke('process-ct', data),
    processDG: (data) => ipcRenderer.invoke('process-dg', data),
    processCompare: (data) => ipcRenderer.invoke('process-compare', data),

    // Logging operations
    getLogs: (filters) => ipcRenderer.invoke('get-logs', filters),
    exportLogs: (options) => ipcRenderer.invoke('export-logs', options),
    addLog: (logData) => ipcRenderer.invoke('add-log', logData),

    // Download operations
    downloadExcelReport: (data) => ipcRenderer.invoke('download-excel-report', data),
    downloadCTReport: (data) => ipcRenderer.invoke('download-ct-report', data),
    downloadDGReport: (data) => ipcRenderer.invoke('download-dg-report', data),
    downloadCompareReport: (data) => ipcRenderer.invoke('download-compare-report', data),

    // Settings operations
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    clearCache: () => ipcRenderer.invoke('clear-cache')
});

// Version information for renderer
contextBridge.exposeInMainWorld('electronAPI', {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
    platform: () => process.platform
});