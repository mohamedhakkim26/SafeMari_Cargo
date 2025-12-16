const ExcelJS = require('exceljs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs').promises;
const path = require('path');

/**
 * CT Reefer Stowage Sorter Module
 * Based on CT_StowageSorter.html logic
 * Sorts reefer containers into CT monitoring blocks using Bay-Row-Tier ordering
 */
class CTStowageSorter {
    constructor() {
        this.fullReeferData = null;
        this.ctData = null;
        this.results = null;
        this.sortedCtRows = null;
    }

    /**
     * Process CT stowage sorting
     * @param {Object} options - Processing options
     * @param {string} options.reeferListPath - Path to FULL reefer list Excel file (with stowage + container ID)
     * @param {string} options.ctSheetPath - Path to CT monitoring sheet Excel file
     * @returns {Object} Processing results
     */
    async processCTStowage(options) {
        try {
            const { reeferListPath, ctSheetPath } = options;

            console.log('Loading CT files:', { reeferListPath, ctSheetPath });

            // Load files based on extension
            this.fullReeferData = await this.loadFile(reeferListPath);
            this.ctData = await this.loadFile(ctSheetPath);

            // Build stowage map from FULL reefer list
            const stowageMap = this.buildStowageMapFromFull();
            console.log('Built stowage map with', Object.keys(stowageMap).length, 'containers');

            // Parse CT sheet structure
            const ctStructure = this.parseCtBlocks();
            console.log('Parsed CT structure:', {
                headerRows: ctStructure.headerRows.length,
                blocks: ctStructure.blocks.length,
                tailRows: ctStructure.tailRows.length
            });

            // Process and sort blocks
            const processedResults = this.processAndSortBlocks(stowageMap, ctStructure);

            return {
                success: true,
                results: processedResults,
                summary: this.generateSummary(processedResults),
                sortedCtRows: this.sortedCtRows
            };

        } catch (error) {
            console.error('CT processing error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Universal file loader supporting Excel, PDF, and Word formats
     */
    async loadFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        
        console.log(`Loading CT file: ${path.basename(filePath)} (${ext})`);
        
        if (ext === '.pdf') {
            return await this.loadPDF(filePath);
        } else if (ext === '.docx' || ext === '.doc') {
            return await this.loadDOCX(filePath);
        } else {
            return await this.loadExcel(filePath);
        }
    }

    /**
     * Load PDF file and extract container/stowage data
     */
    async loadPDF(filePath) {
        const dataBuffer = await fs.readFile(filePath);
        const pdfData = await pdfParse(dataBuffer);
        return this.parsePDFText(pdfData.text);
    }

    /**
     * Load DOCX file and extract container/stowage data
     */
    async loadDOCX(filePath) {
        const dataBuffer = await fs.readFile(filePath);
        const result = await mammoth.convertToHtml({ buffer: dataBuffer });
        
        // Convert HTML to structured data
        return this.parseHTMLContent(result.value);
    }

    /**
     * Load Excel file (existing functionality)
     */
    async loadExcel(filePath) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        return this.convertWorkbookToArrays(workbook);
    }

    /**
     * Convert ExcelJS workbook to array format for processing
     */
    convertWorkbookToArrays(workbook) {
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
        
        return { SheetNames: Object.keys(sheets), Sheets: sheets };
    }

    /**
     * Enhanced PDF text parsing for container and stowage data
     */
    parsePDFText(text) {
        const lines = text.split('\n').filter(line => line.trim());
        const rows = [];
        
        // Add header row
        rows.push(['Container ID', 'Stowage', 'Additional Data']);
        
        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;
            
            // Look for container IDs and stowage patterns
            const containerMatch = trimmed.match(/([A-Z]{4}\d{6,7})/g);
            const stowageMatch = trimmed.match(/(\d{2}[\s\.]\d{2}[\s\.]\d{2})/g);
            
            if (containerMatch) {
                containerMatch.forEach(containerId => {
                    const stowage = stowageMatch ? stowageMatch[0] : '';
                    rows.push([containerId, stowage, trimmed]);
                });
            } else if (stowageMatch || /\d{6}/.test(trimmed)) {
                // Line might contain stowage or other relevant data
                rows.push(['', trimmed, '']);
            }
        });
        
        return { SheetNames: ['PDF_Data'], Sheets: { 'PDF_Data': rows } };
    }

    /**
     * Parse HTML content from DOCX files
     */
    parseHTMLContent(html) {
        const rows = [];
        
        // Add header row
        rows.push(['Container ID', 'Stowage', 'Additional Data']);
        
        // Extract container IDs and stowage from HTML
        const containerMatches = [...html.matchAll(/([A-Z]{4}\d{6,7})/g)];
        
        containerMatches.forEach(match => {
            const containerId = match[1];
            const context = html.substring(Math.max(0, match.index - 100), match.index + 100);
            const cleanContext = context.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            
            // Look for stowage pattern in context
            const stowageMatch = cleanContext.match(/(\d{2}[\s\.]\d{2}[\s\.]\d{2}|\d{6})/g);
            const stowage = stowageMatch ? stowageMatch[0] : '';
            
            rows.push([containerId, stowage, cleanContext]);
        });
        
        return { SheetNames: ['DOCX_Data'], Sheets: { 'DOCX_Data': rows } };
    }

    /**
     * Detect container ID pattern from HTML logic
     */
    detectContainerId(cell) {
        if (cell == null) return null;
        const s = cell.toString().trim().toUpperCase();
        return /^[A-Z]{4}\d{7}$/.test(s) ? s : null;
    }

    /**
     * Build stowage map from FULL reefer list (based on HTML logic)
     */
    buildStowageMapFromFull() {
        const map = {};
        
        if (!this.fullReeferData) return map;

        // Process all sheets in the workbook
        this.fullReeferData.SheetNames.forEach(sheetName => {
            const rows = this.fullReeferData.Sheets[sheetName];
            if (!rows || !rows.length) return;

            let headerRow = -1;
            let stowIdx = -1;
            let idIdx = -1;
            const maxHeaderScan = Math.min(15, rows.length);

            // Find header row with STOWAGE and CONT ID columns
            for (let r = 0; r < maxHeaderScan; r++) {
                const row = rows[r] || [];
                for (let c = 0; c < row.length; c++) {
                    const val = (row[c] == null ? "" : row[c].toString()).toUpperCase();
                    if (val.indexOf("STOWAGE") !== -1) stowIdx = c;
                    if ((val.indexOf("CONT") !== -1 && val.indexOf("ID") !== -1) || 
                        val.indexOf("CONTAINER") !== -1) idIdx = c;
                }
                if (stowIdx !== -1 && idIdx !== -1) {
                    headerRow = r;
                    break;
                }
            }

            if (headerRow === -1 || stowIdx === -1 || idIdx === -1) return;

            // Extract container ID -> stowage mappings
            for (let r = headerRow + 1; r < rows.length; r++) {
                const row = rows[r] || [];
                const id = this.detectContainerId(row[idIdx]);
                if (!id) continue;
                
                const stowVal = row[stowIdx];
                if (stowVal == null || stowVal === "") continue;
                
                if (!(id in map)) {
                    map[id] = stowVal.toString().trim();
                }
            }
        });

        return map;
    }

    /**
     * Normalize stowage to 6-digit key BBRRTT for sorting (from HTML logic)
     */
    brtKeyFromStowage(stow) {
        if (stow == null) return "ZZZZZZ";  // missing -> goes to bottom
        let s = stow.toString();
        let digits = s.replace(/[^\d]/g, "");
        if (digits.length > 6) digits = digits.slice(0, 6);
        if (digits.length < 6) digits = digits.padStart(6, "0");
        return digits;
    }

    /**
     * Format stowage for display in CT sheet
     */
    prettyStow(stow) {
        if (stow == null) return "";
        let digits = stow.toString().replace(/[^\d]/g, "");
        if (digits.length < 6) digits = digits.padStart(6, "0");
        return digits;
    }

    /**
     * Parse CT sheet into header, blocks, and tail (from HTML logic)
     */
    parseCtBlocks() {
        if (!this.ctData) return null;

        // Use first sheet
        const sheetName = this.ctData.SheetNames[0];
        const rows = this.ctData.Sheets[sheetName];
        if (!rows || !rows.length) return null;

        let headerRows = [];
        let blocks = [];
        let i = 0;

        // Header: until first row with ANY container ID
        while (i < rows.length) {
            const row = rows[i] || [];
            let hasId = false;
            for (let c = 0; c < row.length; c++) {
                if (this.detectContainerId(row[c])) {
                    hasId = true;
                    break;
                }
            }
            if (hasId) break;
            headerRows.push(row);
            i++;
        }

        // Blocks: each container row + following rows until next container row
        while (i < rows.length) {
            const row = rows[i] || [];
            let id = null;
            for (let c = 0; c < row.length; c++) {
                const maybe = this.detectContainerId(row[c]);
                if (maybe) {
                    id = maybe;
                    break;
                }
            }
            if (!id) {
                // no more containers; rest is tail
                break;
            }
            
            const start = i;
            i++;
            
            // Find end of this block (until next container ID)
            while (i < rows.length) {
                const r2 = rows[i] || [];
                let hasNextId = false;
                for (let c = 0; c < r2.length; c++) {
                    if (this.detectContainerId(r2[c])) {
                        hasNextId = true;
                        break;
                    }
                }
                if (hasNextId) break;
                i++;
            }
            
            const end = i;
            blocks.push({ id: id, start: start, end: end });
        }

        const tailRows = rows.slice(i);
        return {
            sheetName: sheetName,
            rows: rows,
            headerRows: headerRows,
            blocks: blocks,
            tailRows: tailRows
        };
    }

    /**
     * Update stowage cell inside a CT block (from HTML logic)
     */
    overwriteCtBlockStowage(rows, block, stow) {
        if (!stow) return;

        const display = this.prettyStow(stow);
        const start = block.start;
        const end = block.end;
        const stowPattern = /^\d{2}[\s\.]\d{2}[\s\.]\d{2}$/;

        // 1) Try to overwrite an existing stowage-looking cell
        for (let r = start; r < end; r++) {
            const row = rows[r] || [];
            for (let c = 0; c < row.length; c++) {
                const val = row[c];
                if (val == null) continue;
                const s = val.toString().trim();
                if (stowPattern.test(s)) {
                    row[c] = display;
                    return;
                }
            }
        }

        // 2) Try to place it just before "(5) PROBE 3"
        for (let r = start; r < end; r++) {
            const row = rows[r] || [];
            for (let c = 0; c < row.length; c++) {
                const val = row[c];
                if (val == null) continue;
                const s = val.toString().trim().toUpperCase().replace(/\s+/g, " ");
                if (s === "(5) PROBE 3") {
                    const targetCol = c > 0 ? c - 1 : c + 1;
                    if (row[targetCol] === null || row[targetCol] === undefined || 
                        row[targetCol].toString().trim() === "") {
                        row[targetCol] = display;
                    } else {
                        // even if something is there but not a stowage, we still override
                        row[targetCol] = display;
                    }
                    return;
                }
            }
        }

        // 3) Fallback: first empty cell in this block (limit to first ~8 rows to avoid footer)
        for (let r = start; r < Math.min(end, start + 8); r++) {
            const row = rows[r] || [];
            for (let c = 0; c < row.length; c++) {
                const val = row[c];
                if (val === null || val === undefined || val.toString().trim() === "") {
                    row[c] = display;
                    return;
                }
            }
        }
    }

    /**
     * Process and sort CT blocks (main processing logic from HTML)
     */
    processAndSortBlocks(stowageMap, ctStructure) {
        const { rows, headerRows, blocks, tailRows } = ctStructure;
        let matched = 0;
        let missing = 0;

        // Attach sort key & overwrite stow cell for each block
        const blocksWithKey = blocks.map(block => {
            const stow = stowageMap[block.id] || null;
            if (stow) matched++; else missing++;
            
            this.overwriteCtBlockStowage(rows, block, stow);
            const key = this.brtKeyFromStowage(stow);
            
            return {
                id: block.id,
                start: block.start,
                end: block.end,
                key: key,
                stow: stow
            };
        });

        // Sort blocks by BBRRTT key
        blocksWithKey.sort((a, b) => {
            if (a.key < b.key) return -1;
            if (a.key > b.key) return 1;
            return 0;
        });

        // Rebuild rows: header + sorted blocks + tail
        const newRows = [];
        
        // Add header rows
        for (let r = 0; r < headerRows.length; r++) {
            newRows.push(headerRows[r]);
        }

        // Add sorted blocks
        blocksWithKey.forEach(block => {
            for (let r = block.start; r < block.end; r++) {
                newRows.push(rows[r]);
            }
        });

        // Add tail rows
        for (let r = 0; r < tailRows.length; r++) {
            newRows.push(tailRows[r]);
        }

        this.sortedCtRows = newRows;

        return {
            totalContainers: blocks.length,
            matched: matched,
            missing: missing,
            blocksWithKey: blocksWithKey,
            preview: blocksWithKey.slice(0, 10) // First 10 for preview
        };
    }

    /**
     * Generate summary like the HTML version
     */
    generateSummary(results) {
        const { totalContainers, matched, missing } = results;
        
        let summary = `CT Stowage Processing Summary:\n`;
        summary += `• Total CT containers detected: ${totalContainers}\n`;
        summary += `• Matched with stowage in FULL list: ${matched}\n`;
        summary += `• Not found in FULL list: ${missing}\n`;
        summary += `• Containers sorted by Bay-Row-Tier position\n`;
        summary += `• Stowage positions updated in CT blocks`;

        return summary;
    }

    /**
     * Export sorted CT sheet to Excel
     */
    async exportSortedCT(outputPath) {
        if (!this.sortedCtRows) {
            throw new Error('No sorted CT data available for export');
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('CT_Sorted');

        // Add all rows to worksheet
        this.sortedCtRows.forEach((row, rowIndex) => {
            const wsRow = worksheet.getRow(rowIndex + 1);
            row.forEach((cellValue, colIndex) => {
                wsRow.getCell(colIndex + 1).value = cellValue;
            });
        });

        await workbook.xlsx.writeFile(outputPath);
        return outputPath;
    }

    /**
     * Get results for display
     */
    getResults() {
        return this.results;
    }

    /**
     * Get sorted rows for export
     */
    getSortedRows() {
        return this.sortedCtRows;
    }
}

module.exports = CTStowageSorter;