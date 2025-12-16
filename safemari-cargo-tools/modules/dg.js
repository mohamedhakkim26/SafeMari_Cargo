const ExcelJS = require('exceljs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

/**
 * DG (Dangerous Goods) Manifest Checker Module
 * Validates dangerous goods between PDF manifests and Excel stowage files
 */
class DGChecker {
    constructor() {
        this.pdfData = null;
        this.excelData = null;
        this.results = null;
    }

    /**
     * Process DG manifest checking with universal file format support
     * @param {Object} options - Processing options
     * @param {string} options.manifestPath - Path to DG manifest file
     * @param {string} options.stowagePath - Path to DG stowage file
     * @returns {Object} Processing results
     */
    async processDGCheck(options) {
        try {
            const { manifestPath, stowagePath } = options;

            // Parse manifest file (any format)
            this.manifestData = await this.loadFile(manifestPath, 'manifest');
            
            // Parse stowage file (any format)
            this.stowageData = await this.loadFile(stowagePath, 'stowage');

            // Perform validation checks
            this.results = this.validateDGData();

            return {
                success: true,
                results: this.results,
                summary: this.generateSummary()
            };

        } catch (error) {
            console.error('DG check processing error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Universal file loader supporting Excel, PDF, and Word formats
     */
    async loadFile(filePath, fileType) {
        const ext = path.extname(filePath).toLowerCase();
        
        console.log(`Loading ${fileType} file: ${path.basename(filePath)} (${ext})`);
        
        if (ext === '.pdf') {
            return await this.loadPDF(filePath, fileType);
        } else if (ext === '.docx' || ext === '.doc') {
            return await this.loadDOCX(filePath, fileType);
        } else {
            return await this.loadExcel(filePath, fileType);
        }
    }

    /**
     * Load PDF file and extract DG information
     */
    async loadPDF(filePath, fileType) {
        try {
            const pdfBuffer = fs.readFileSync(filePath);
            const pdfData = await pdfParse(pdfBuffer);
            
            return this.extractDGFromText(pdfData.text, fileType);

        } catch (error) {
            throw new Error(`Failed to parse PDF ${fileType}: ${error.message}`);
        }
    }

    /**
     * Load DOCX file and extract DG information
     */
    async loadDOCX(filePath, fileType) {
        try {
            const dataBuffer = fs.readFileSync(filePath);
            const result = await mammoth.convertToHtml({ buffer: dataBuffer });
            
            // Convert HTML to text for processing
            const text = result.value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
            
            return this.extractDGFromText(text, fileType);

        } catch (error) {
            throw new Error(`Failed to parse DOCX ${fileType}: ${error.message}`);
        }
    }

    /**
     * Load Excel file and extract DG information
     */
    async loadExcel(filePath, fileType) {
        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(filePath);
            
            // Convert to array format for processing
            const sheets = {};
            workbook.eachSheet((worksheet) => {
                const rows = [];
                worksheet.eachRow((row, rowNumber) => {
                    const rowData = [];
                    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                        rowData[colNumber - 1] = cell.value;
                    });
                    rows.push(rowData);
                });
                sheets[worksheet.name] = rows;
            });
            
            return this.extractDGFromExcelSheets(sheets, fileType);

        } catch (error) {
            throw new Error(`Failed to parse Excel ${fileType}: ${error.message}`);
        }
    }

    /**
     * Universal text-based DG extraction for PDF and DOCX files
     */
    extractDGFromText(text, fileType) {
        const dgItems = [];
        const lines = text.split('\n');

        // Common patterns for DG manifest data
        const containerPattern = /[A-Z]{4}\d{7}/g;
        const unNumberPattern = /UN\s*(\d{4})/gi;
        const classPattern = /(?:CLASS|CLS)\s*(\d+(?:\.\d+)?)/gi;
        const psnPattern = /PSN[:\s]*(.*?)(?:\n|\s{2,})/gi;
        const flashpointPattern = /(?:FP|FLASH\s*POINT)[:\s]*(-?\d+(?:\.\d+)?)[^\d]/gi;
        const weightPattern = /(?:WEIGHT|WT)[:\s]*(\d+(?:\.\d+)?)\s*(?:KG|MT|T)/gi;

        let currentContainer = null;
        let currentDG = {};

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Look for container ID
            const containerMatch = line.match(containerPattern);
            if (containerMatch) {
                // Save previous DG item
                if (currentContainer && Object.keys(currentDG).length > 0) {
                    dgItems.push({
                        containerId: currentContainer,
                        ...currentDG
                    });
                }

                currentContainer = containerMatch[0];
                currentDG = {};
                continue;
            }

            // Extract UN number
            const unMatch = line.match(unNumberPattern);
            if (unMatch && !currentDG.unNumber) {
                currentDG.unNumber = unMatch[1];
            }

            // Extract class
            const classMatch = line.match(classPattern);
            if (classMatch && !currentDG.class) {
                currentDG.class = classMatch[1];
            }

            // Extract PSN (Proper Shipping Name)
            const psnMatch = line.match(psnPattern);
            if (psnMatch && !currentDG.psn) {
                currentDG.psn = psnMatch[1].trim();
            }

            // Extract flashpoint
            const fpMatch = line.match(flashpointPattern);
            if (fpMatch && !currentDG.flashpoint) {
                currentDG.flashpoint = parseFloat(fpMatch[1]);
            }

            // Extract weight
            const weightMatch = line.match(weightPattern);
            if (weightMatch && !currentDG.weight) {
                currentDG.weight = parseFloat(weightMatch[1]);
            }

            // Alternative parsing: look for tabular data
            if (line.includes('\t') || /\s{3,}/.test(line)) {
                const parts = line.split(/\s{2,}|\t/);
                if (parts.length >= 4) {
                    // Attempt to parse tabular format
                    const tabularDG = this.parseTabularDGLine(parts);
                    if (tabularDG.containerId) {
                        dgItems.push(tabularDG);
                    }
                }
            }
        }

        // Don't forget the last item
        if (currentContainer && Object.keys(currentDG).length > 0) {
            dgItems.push({
                containerId: currentContainer,
                ...currentDG
            });
        }

        return dgItems;
    }

    /**
     * Parse tabular DG data line
     */
    parseTabularDGLine(parts) {
        const dgItem = {};

        for (const part of parts) {
            const trimmed = part.trim();
            
            // Container ID
            if (/^[A-Z]{4}\d{7}$/.test(trimmed)) {
                dgItem.containerId = trimmed;
            }
            // UN Number
            else if (/^UN\d{4}$/.test(trimmed) || /^\d{4}$/.test(trimmed)) {
                dgItem.unNumber = trimmed.replace('UN', '');
            }
            // Class (single digit or decimal)
            else if (/^\d+(?:\.\d+)?$/.test(trimmed) && parseFloat(trimmed) <= 9) {
                dgItem.class = trimmed;
            }
            // Weight (numbers followed by weight units)
            else if (/^\d+(?:\.\d+)?\s*(?:KG|MT|T)$/i.test(trimmed)) {
                dgItem.weight = parseFloat(trimmed.replace(/[^\d.]/g, ''));
            }
            // Flashpoint (negative or positive number)
            else if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
                const num = parseFloat(trimmed);
                if (num >= -50 && num <= 200) { // Reasonable flashpoint range
                    dgItem.flashpoint = num;
                }
            }
            // PSN (everything else that's not empty and meaningful)
            else if (trimmed.length > 3 && !dgItem.psn) {
                dgItem.psn = trimmed;
            }
        }

        return dgItem;
    }

    /**
     * Extract DG information from Excel sheets (multiple sheets support)
     */
    extractDGFromExcelSheets(sheets, fileType) {
        const allDGItems = [];
        
        // Process all sheets to find DG data
        for (const [sheetName, rows] of Object.entries(sheets)) {
            if (!rows || rows.length < 2) continue;
            
            // Skip summary sheets
            if (/summary|total|overview/i.test(sheetName)) continue;
            
            try {
                const dgItems = this.extractDGFromExcel(rows, sheetName);
                allDGItems.push(...dgItems);
                
                if (dgItems.length > 0) {
                    console.log(`Found ${dgItems.length} DG items in sheet: ${sheetName}`);
                }
            } catch (error) {
                console.warn(`Error processing sheet ${sheetName}:`, error.message);
            }
        }
        
        console.log(`Total DG items extracted from ${fileType}: ${allDGItems.length}`);
        return allDGItems;
    }

    /**
     * Enhanced DG extraction from Excel data with flexible column detection
     */
    extractDGFromExcel(data, sheetName = 'Unknown') {
        if (!data || data.length === 0) {
            return [];
        }

        const headers = data[0] ? data[0].map(h => String(h || '').toLowerCase()) : [];
        const dgItems = [];

        // Enhanced column detection with more patterns
        const columns = {
            containerId: this.findColumn(headers, [
                /container.*id/i, /container.*no/i, /cntr.*id/i, /^container$/i, /^cntr$/i, /box.*id/i
            ]),
            unNumber: this.findColumn(headers, [
                /un.*number/i, /un.*no/i, /^un$/i, /undg/i, /un\s*\d/i, /dangerous.*goods/i
            ]),
            class: this.findColumn(headers, [
                /class/i, /dg.*class/i, /hazard.*class/i, /imdg.*class/i, /^cls$/i
            ]),
            psn: this.findColumn(headers, [
                /psn/i, /proper.*shipping/i, /shipping.*name/i, /description/i, /commodity/i, /goods/i
            ]),
            flashpoint: this.findColumn(headers, [
                /flash.*point/i, /fp/i, /f\.p\./i, /flash/i
            ]),
            weight: this.findColumn(headers, [
                /weight/i, /wt/i, /kg/i, /gross.*weight/i, /net.*weight/i
            ]),
            stowage: this.findColumn(headers, [
                /stowage/i, /position/i, /location/i, /bay/i, /row/i, /tier/i
            ])
        };

        // More flexible validation - allow processing even without all columns
        if (columns.containerId === -1) {
            console.warn(`No container ID column found in sheet: ${sheetName}`);
            return [];
        }

        console.log(`Processing ${data.length - 1} rows in sheet: ${sheetName}`);
        console.log(`Column mapping:`, Object.entries(columns).filter(([k, v]) => v !== -1).map(([k, v]) => `${k}=${v}`).join(', '));

        // Process data rows with better error handling
        for (let i = 1; i < data.length; i++) {
            const row = data[i] || [];
            if (!row[columns.containerId]) continue;

            try {
                const dgItem = {
                    containerId: this.normalizeContainerId(row[columns.containerId]),
                    unNumber: columns.unNumber !== -1 ? this.normalizeUNNumber(row[columns.unNumber]) : null,
                    class: columns.class !== -1 ? this.normalizeClass(row[columns.class]) : null,
                    psn: columns.psn !== -1 ? this.normalizePSN(row[columns.psn]) : null,
                    flashpoint: columns.flashpoint !== -1 ? this.parseNumber(row[columns.flashpoint]) : null,
                    weight: columns.weight !== -1 ? this.parseNumber(row[columns.weight]) : null,
                    stowage: columns.stowage !== -1 ? this.normalizeStowage(row[columns.stowage]) : null,
                    sourceSheet: sheetName,
                    sourceRow: i + 1
                };

                if (dgItem.containerId) {
                    dgItems.push(dgItem);
                }
            } catch (error) {
                console.warn(`Error processing row ${i + 1} in sheet ${sheetName}:`, error.message);
            }
        }

        return dgItems;
    }

    /**
     * Validate DG data between manifest and stowage files
     */
    validateDGData() {
        const results = {
            manifestCount: this.manifestData.length,
            stowageCount: this.stowageData.length,
            missingInStowage: [],
            extraInStowage: [],
            unClassMismatches: [],
            matches: [],
            validationDetails: []
        };

        console.log(`\n🔍 DG VALIDATION:`);
        console.log(`   Manifest containers: ${results.manifestCount}`);
        console.log(`   Stowage containers: ${results.stowageCount}`);

        // Create lookup maps
        const manifestLookup = new Map();
        const stowageLookup = new Map();

        this.manifestData.forEach(item => {
            if (item.containerId) {
                manifestLookup.set(item.containerId, item);
            }
        });

        this.stowageData.forEach(item => {
            if (item.containerId) {
                stowageLookup.set(item.containerId, item);
            }
        });

        // Check for missing containers in stowage
        manifestLookup.forEach((manifestItem, containerId) => {
            if (!stowageLookup.has(containerId)) {
                results.missingInStowage.push(manifestItem);
            } else {
                const stowageItem = stowageLookup.get(containerId);
                const validation = this.validateDGMatch(manifestItem, stowageItem);
                
                if (validation.isMatch) {
                    results.matches.push({
                        containerId: containerId,
                        manifestData: manifestItem,
                        stowageData: stowageItem
                    });
                } else {
                    results.unClassMismatches.push({
                        containerId: containerId,
                        manifestData: manifestItem,
                        stowageData: stowageItem,
                        mismatches: validation.mismatches
                    });
                }
                
                results.validationDetails.push({
                    containerId: containerId,
                    status: validation.isMatch ? 'match' : 'mismatch',
                    manifestData: manifestItem,
                    stowageData: stowageItem,
                    mismatches: validation.mismatches
                });
            }
        });

        // Check for extra containers in stowage (not in manifest)
        stowageLookup.forEach((stowageItem, containerId) => {
            if (!manifestLookup.has(containerId)) {
                results.extraInStowage.push(stowageItem);
            }
        });

        console.log(`   ✅ Matches: ${results.matches.length}`);
        console.log(`   ⚠️ Mismatches: ${results.unClassMismatches.length}`);
        console.log(`   ❌ Missing in stowage: ${results.missingInStowage.length}`);
        console.log(`   ➕ Extra in stowage: ${results.extraInStowage.length}`);

        return results;
    }

    /**
     * Enhanced DG data validation with flexible matching
     */
    validateDGMatch(manifestItem, stowageItem) {
        const mismatches = [];

        // Check UN number with normalization
        if (manifestItem.unNumber && stowageItem.unNumber) {
            const manifestUN = this.normalizeUNNumber(manifestItem.unNumber);
            const stowageUN = this.normalizeUNNumber(stowageItem.unNumber);
            
            if (manifestUN && stowageUN && manifestUN !== stowageUN) {
                mismatches.push({
                    field: 'UN Number',
                    manifest: manifestItem.unNumber,
                    stowage: stowageItem.unNumber
                });
            }
        }

        // Check class with normalization
        if (manifestItem.class && stowageItem.class) {
            const manifestClass = this.normalizeClass(manifestItem.class);
            const stowageClass = this.normalizeClass(stowageItem.class);
            
            if (manifestClass && stowageClass && manifestClass !== stowageClass) {
                mismatches.push({
                    field: 'Class',
                    manifest: manifestItem.class,
                    stowage: stowageItem.class
                });
            }
        }

        // Check PSN similarity (fuzzy matching)
        if (manifestItem.psn && stowageItem.psn) {
            const similarity = this.calculateStringSimilarity(manifestItem.psn, stowageItem.psn);
            if (similarity < 0.7) { // 70% similarity threshold
                mismatches.push({
                    field: 'PSN',
                    manifest: manifestItem.psn,
                    stowage: stowageItem.psn,
                    similarity: similarity.toFixed(2)
                });
            }
        }

        return {
            isMatch: mismatches.length === 0,
            mismatches: mismatches
        };
    }

    /**
     * Helper methods
     */
    findColumn(headers, patterns) {
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i];
            if (patterns.some(pattern => pattern.test(header))) {
                return i;
            }
        }
        return -1;
    }

    normalizeContainerId(containerId) {
        if (!containerId) return null;
        const cleaned = String(containerId).replace(/[^A-Z0-9]/gi, '').toUpperCase();
        // Validate container ID format
        return /^[A-Z]{4}\d{6,7}$/.test(cleaned) ? cleaned : cleaned;
    }

    normalizeUNNumber(unNumber) {
        if (!unNumber) return null;
        const cleaned = String(unNumber).replace(/[^0-9]/g, '');
        return cleaned.length === 4 ? cleaned : null;
    }

    normalizeClass(dgClass) {
        if (!dgClass) return null;
        const cleaned = String(dgClass).trim();
        // Handle various class formats: "3", "3.1", "Class 3", etc.
        const match = cleaned.match(/\d+(?:\.\d+)?/);
        return match ? match[0] : cleaned;
    }

    normalizePSN(psn) {
        if (!psn) return null;
        return String(psn).trim().toUpperCase();
    }

    normalizeStowage(stowage) {
        if (!stowage) return null;
        return String(stowage).trim().toUpperCase();
    }

    parseNumber(value) {
        if (value === null || value === undefined || value === '') return null;
        const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
        return isNaN(parsed) ? null : parsed;
    }

    calculateStringSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        
        const s1 = str1.toLowerCase();
        const s2 = str2.toLowerCase();
        
        if (s1 === s2) return 1;
        
        // Simple Levenshtein distance-based similarity
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;
        
        if (longer.length === 0) return 1;
        
        const distance = this.levenshteinDistance(longer, shorter);
        return (longer.length - distance) / longer.length;
    }

    levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    generateSummary() {
        if (!this.results) return null;

        return {
            manifestContainers: this.results.manifestCount,
            stowageContainers: this.results.stowageCount,
            matches: this.results.matches.length,
            missingInStowage: this.results.missingInStowage.length,
            extraInStowage: this.results.extraInStowage.length,
            unClassMismatches: this.results.unClassMismatches.length,
            matchRate: this.results.manifestCount > 0 ? 
                ((this.results.matches.length / this.results.manifestCount) * 100).toFixed(1) : 0
        };
    }

    /**
     * Export DG validation results
     */
    async exportResults(outputPath) {
        if (!this.results) {
            throw new Error('No results to export');
        }

        try {
            const workbook = new ExcelJS.Workbook();

            // Summary sheet
            const summarySheet = workbook.addWorksheet('Summary');
            summarySheet.addRow(['DG Manifest Validation Results']);
            summarySheet.addRow([]);
            summarySheet.addRow(['Summary Statistics']);
            summarySheet.addRow(['PDF Containers', this.results.pdfCount]);
            summarySheet.addRow(['Excel Containers', this.results.excelCount]);
            summarySheet.addRow(['Matches', this.results.matches.length]);
            summarySheet.addRow(['Missing in Stowage', this.results.missingInStowage.length]);
            summarySheet.addRow(['Extra in Stowage', this.results.extraInStowage.length]);
            summarySheet.addRow(['UN/Class Mismatches', this.results.unClassMismatches.length]);
            summarySheet.addRow(['Match Rate', `${this.generateSummary().matchRate}%`]);

            // Missing containers sheet
            if (this.results.missingInStowage.length > 0) {
                const missingSheet = workbook.addWorksheet('Missing_in_Stowage');
                missingSheet.addRow(['Container ID', 'UN Number', 'Class', 'PSN', 'Flashpoint', 'Weight']);
                
                this.results.missingInStowage.forEach(item => {
                    missingSheet.addRow([
                        item.containerId,
                        item.unNumber || '',
                        item.class || '',
                        item.psn || '',
                        item.flashpoint || '',
                        item.weight || ''
                    ]);
                });
            }

            // Extra containers sheet
            if (this.results.extraInStowage.length > 0) {
                const extraSheet = workbook.addWorksheet('Extra_in_Stowage');
                extraSheet.addRow(['Container ID', 'UN Number', 'Class', 'PSN', 'Stowage']);
                
                this.results.extraInStowage.forEach(item => {
                    extraSheet.addRow([
                        item.containerId,
                        item.unNumber || '',
                        item.class || '',
                        item.psn || '',
                        item.stowage || ''
                    ]);
                });
            }

            // Mismatches sheet
            if (this.results.unClassMismatches.length > 0) {
                const mismatchSheet = workbook.addWorksheet('UN_Class_Mismatches');
                mismatchSheet.addRow(['Container ID', 'Field', 'PDF Value', 'Excel Value']);
                
                this.results.unClassMismatches.forEach(item => {
                    item.mismatches.forEach(mismatch => {
                        mismatchSheet.addRow([
                            item.containerId,
                            mismatch.field,
                            mismatch.pdf,
                            mismatch.excel
                        ]);
                    });
                });
            }

            await workbook.xlsx.writeFile(outputPath);

            return {
                success: true,
                outputPath: outputPath
            };

        } catch (error) {
            console.error('Export error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = DGChecker;