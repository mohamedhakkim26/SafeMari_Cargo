const ExcelJS = require('exceljs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

/**
 * Generic 2-List Reconciliation Module
 * Compares two container lists to find common containers and differences
 */
class ListCompare {
    constructor() {
        this.listAData = null;
        this.listBData = null;
        this.results = null;
    }

    /**
     * Process list comparison
     * @param {Object} options - Processing options
     * @param {string} options.fileAPath - Path to Excel file A
     * @param {string} options.fileBPath - Path to Excel file B
     * @returns {Object} Processing results
     */
    async processListComparison(options) {
        try {
            const { fileAPath, fileBPath } = options;

            // Load and parse files (any format)
            this.listAData = await this.parseFile(fileAPath, 'A');
            this.listBData = await this.parseFile(fileBPath, 'B');

            // Perform comparison
            this.results = this.compareContainerLists();

            return {
                success: true,
                results: this.results,
                summary: this.generateSummary()
            };

        } catch (error) {
            console.error('List comparison processing error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Universal file parser supporting Excel, PDF, and Word formats
     */
    async parseFile(filePath, listName) {
        const ext = path.extname(filePath).toLowerCase();
        
        console.log(`Loading ${listName} file: ${path.basename(filePath)} (${ext})`);
        
        if (ext === '.pdf') {
            return await this.parsePDFFile(filePath, listName);
        } else if (ext === '.docx' || ext === '.doc') {
            return await this.parseDOCXFile(filePath, listName);
        } else {
            return await this.parseExcelFile(filePath, listName);
        }
    }

    /**
     * Parse Excel file and extract container information
     */
    async parseExcelFile(filePath, listName) {
        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(filePath);
            
            // Process all sheets to find container data
            const allData = [];
            workbook.eachSheet((worksheet) => {
                const data = [];
                worksheet.eachRow((row, rowNumber) => {
                    const rowData = [];
                    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                        rowData[colNumber - 1] = cell.value;
                    });
                    data.push(rowData);
                });
                
                if (data.length > 1) {
                    allData.push(...data);
                }
            });

            return this.extractContainerData(allData, listName, filePath);

        } catch (error) {
            throw new Error(`Failed to parse Excel file ${filePath}: ${error.message}`);
        }
    }

    /**
     * Parse PDF file and extract container information
     */
    async parsePDFFile(filePath, listName) {
        try {
            const pdfBuffer = fs.readFileSync(filePath);
            const pdfData = await pdfParse(pdfBuffer);
            
            // Convert PDF text to tabular format
            const lines = pdfData.text.split('\n').filter(line => line.trim());
            const data = [['Container ID', 'Additional Data']]; // Default header
            
            lines.forEach(line => {
                const containerMatch = line.match(/[A-Z]{4}\d{6,7}/);
                if (containerMatch) {
                    data.push([containerMatch[0], line.trim()]);
                }
            });

            return this.extractContainerData(data, listName, filePath);

        } catch (error) {
            throw new Error(`Failed to parse PDF file ${filePath}: ${error.message}`);
        }
    }

    /**
     * Parse DOCX file and extract container information
     */
    async parseDOCXFile(filePath, listName) {
        try {
            const dataBuffer = fs.readFileSync(filePath);
            const result = await mammoth.convertToHtml({ buffer: dataBuffer });
            
            // Extract container data from HTML tables or text
            const data = this.extractContainersFromHTML(result.value);

            return this.extractContainerData(data, listName, filePath);

        } catch (error) {
            throw new Error(`Failed to parse DOCX file ${filePath}: ${error.message}`);
        }
    }

    /**
     * Extract containers from HTML content
     */
    extractContainersFromHTML(html) {
        const data = [['Container ID', 'Additional Data']];
        
        // Find all container IDs in the HTML
        const containerMatches = [...html.matchAll(/([A-Z]{4}\d{6,7})/g)];
        
        containerMatches.forEach(match => {
            const containerId = match[1];
            const context = html.substring(Math.max(0, match.index - 100), match.index + 100);
            const cleanContext = context.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            
            data.push([containerId, cleanContext]);
        });
        
        return data;
    }

    /**
     * Extract container data from Excel sheet
     */
    extractContainerData(data, listName, filePath) {
        if (!data || data.length === 0) {
            throw new Error(`No data found in Excel file for list ${listName}`);
        }

        const headers = data[0].map(h => String(h).toLowerCase());
        const containers = [];

        // Detect container ID column
        const containerColumn = this.findContainerColumn(headers);
        
        if (containerColumn === -1) {
            throw new Error(`Container ID column not found in list ${listName}`);
        }

        // Detect additional data columns
        const additionalColumns = this.detectAdditionalColumns(headers, containerColumn);

        // Extract container data
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row[containerColumn]) continue;

            const containerId = this.normalizeContainerId(row[containerColumn]);
            if (!containerId) continue;

            const containerInfo = {
                containerId: containerId,
                originalId: row[containerColumn],
                rowNumber: i + 1,
                listName: listName,
                additionalData: {}
            };

            // Extract additional data
            additionalColumns.forEach(column => {
                if (row[column.index] !== undefined && row[column.index] !== null) {
                    containerInfo.additionalData[column.name] = row[column.index];
                }
            });

            containers.push(containerInfo);
        }

        return {
            listName: listName,
            filePath: filePath,
            containers: containers,
            totalRows: data.length - 1,
            containerCount: containers.length,
            headers: headers,
            additionalColumns: additionalColumns
        };
    }

    /**
     * Find container ID column in headers
     */
    findContainerColumn(headers) {
        const containerPatterns = [
            /container.*id/i, /container.*number/i, /container.*no/i,
            /cntr.*id/i, /cntr.*no/i, /cntr.*number/i,
            /^container$/i, /^cntr$/i, /^id$/i,
            /box.*id/i, /box.*no/i, /unit.*id/i
        ];

        for (let i = 0; i < headers.length; i++) {
            const header = headers[i];
            if (containerPatterns.some(pattern => pattern.test(header))) {
                return i;
            }
        }

        // Fallback: look for container-like patterns in data
        return 0; // Assume first column if no clear match
    }

    /**
     * Detect additional data columns (non-container ID columns)
     */
    detectAdditionalColumns(headers, containerColumnIndex) {
        const columns = [];
        
        for (let i = 0; i < headers.length; i++) {
            if (i === containerColumnIndex) continue;
            
            const header = headers[i];
            if (header && String(header).trim() !== '') {
                columns.push({
                    index: i,
                    name: this.normalizeColumnName(header),
                    originalName: header
                });
            }
        }

        return columns;
    }

    /**
     * Normalize column name for consistent comparison
     */
    normalizeColumnName(name) {
        return String(name)
            .replace(/[^a-zA-Z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    /**
     * Compare the two container lists
     */
    compareContainerLists() {
        const listAContainers = new Map();
        const listBContainers = new Map();

        // Build lookup maps
        this.listAData.containers.forEach(container => {
            listAContainers.set(container.containerId, container);
        });

        this.listBData.containers.forEach(container => {
            listBContainers.set(container.containerId, container);
        });

        // Find common, unique to A, and unique to B
        const commonContainers = [];
        const onlyInA = [];
        const onlyInB = [];

        // Check containers in list A
        listAContainers.forEach((containerA, containerId) => {
            if (listBContainers.has(containerId)) {
                const containerB = listBContainers.get(containerId);
                commonContainers.push({
                    containerId: containerId,
                    listA: containerA,
                    listB: containerB,
                    dataComparison: this.compareAdditionalData(containerA, containerB)
                });
            } else {
                onlyInA.push(containerA);
            }
        });

        // Check containers only in list B
        listBContainers.forEach((containerB, containerId) => {
            if (!listAContainers.has(containerId)) {
                onlyInB.push(containerB);
            }
        });

        // Sort results
        commonContainers.sort((a, b) => a.containerId.localeCompare(b.containerId));
        onlyInA.sort((a, b) => a.containerId.localeCompare(b.containerId));
        onlyInB.sort((a, b) => a.containerId.localeCompare(b.containerId));

        return {
            listA: this.listAData,
            listB: this.listBData,
            common: commonContainers,
            onlyInA: onlyInA,
            onlyInB: onlyInB,
            statistics: {
                totalA: this.listAData.containerCount,
                totalB: this.listBData.containerCount,
                commonCount: commonContainers.length,
                onlyInACount: onlyInA.length,
                onlyInBCount: onlyInB.length
            }
        };
    }

    /**
     * Compare additional data between two containers
     */
    compareAdditionalData(containerA, containerB) {
        const comparison = {
            matches: [],
            differences: []
        };

        // Get all unique column names from both containers
        const allColumns = new Set();
        Object.keys(containerA.additionalData).forEach(col => allColumns.add(col));
        Object.keys(containerB.additionalData).forEach(col => allColumns.add(col));

        allColumns.forEach(column => {
            const valueA = containerA.additionalData[column];
            const valueB = containerB.additionalData[column];

            if (valueA !== undefined && valueB !== undefined) {
                const normalizedA = this.normalizeValue(valueA);
                const normalizedB = this.normalizeValue(valueB);

                if (normalizedA === normalizedB) {
                    comparison.matches.push({
                        column: column,
                        value: valueA
                    });
                } else {
                    comparison.differences.push({
                        column: column,
                        valueA: valueA,
                        valueB: valueB
                    });
                }
            } else if (valueA !== undefined || valueB !== undefined) {
                comparison.differences.push({
                    column: column,
                    valueA: valueA || 'N/A',
                    valueB: valueB || 'N/A'
                });
            }
        });

        return comparison;
    }

    /**
     * Normalize value for comparison
     */
    normalizeValue(value) {
        if (value === null || value === undefined) return '';
        return String(value).trim().toUpperCase();
    }

    /**
     * Normalize container ID
     */
    normalizeContainerId(containerId) {
        if (!containerId) return null;
        
        // Remove non-alphanumeric characters and convert to uppercase
        const normalized = String(containerId).replace(/[^A-Z0-9]/gi, '').toUpperCase();
        
        // Basic validation: should be 4 letters + 7 digits (standard container format)
        if (/^[A-Z]{4}\d{7}$/.test(normalized)) {
            return normalized;
        }
        
        // Return as-is if doesn't match standard format (might be internal reference)
        return normalized.length > 0 ? normalized : null;
    }

    /**
     * Generate summary statistics
     */
    generateSummary() {
        if (!this.results) return null;

        const stats = this.results.statistics;
        
        return {
            listACount: stats.totalA,
            listBCount: stats.totalB,
            commonCount: stats.commonCount,
            onlyInACount: stats.onlyInACount,
            onlyInBCount: stats.onlyInBCount,
            listAFileName: this.extractFileName(this.results.listA.filePath),
            listBFileName: this.extractFileName(this.results.listB.filePath),
            commonPercentageA: stats.totalA > 0 ? ((stats.commonCount / stats.totalA) * 100).toFixed(1) : 0,
            commonPercentageB: stats.totalB > 0 ? ((stats.commonCount / stats.totalB) * 100).toFixed(1) : 0
        };
    }

    /**
     * Extract filename from path
     */
    extractFileName(filePath) {
        return filePath.split(/[\\\/]/).pop() || filePath;
    }

    /**
     * Export reconciliation results
     */
    async exportResults(outputPath) {
        if (!this.results) {
            throw new Error('No results to export');
        }

        try {
            const workbook = new ExcelJS.Workbook();

            // Summary sheet
            const summary = this.generateSummary();
            const summarySheet = workbook.addWorksheet('Summary');
            summarySheet.addRow(['Container List Reconciliation Results']);
            summarySheet.addRow([]);
            summarySheet.addRow(['File Information']);
            summarySheet.addRow(['List A File:', summary.listAFileName]);
            summarySheet.addRow(['List B File:', summary.listBFileName]);
            summarySheet.addRow([]);
            summarySheet.addRow(['Summary Statistics']);
            summarySheet.addRow(['List A Containers:', summary.listACount]);
            summarySheet.addRow(['List B Containers:', summary.listBCount]);
            summarySheet.addRow(['Common Containers:', summary.commonCount]);
            summarySheet.addRow(['Only in List A:', summary.onlyInACount]);
            summarySheet.addRow(['Only in List B:', summary.onlyInBCount]);
            summarySheet.addRow([]);
            summarySheet.addRow(['Match Percentages']);
            summarySheet.addRow(['Common vs List A:', `${summary.commonPercentageA}%`]);
            summarySheet.addRow(['Common vs List B:', `${summary.commonPercentageB}%`]);

            // Common containers sheet
            if (this.results.common.length > 0) {
                const commonSheet = workbook.addWorksheet('Common_Containers');
                const commonHeaders = ['Container ID', 'List A Row', 'List B Row'];
                
                // Add additional data columns if available
                const allColumns = new Set();
                this.results.common.forEach(item => {
                    Object.keys(item.listA.additionalData).forEach(col => allColumns.add(`A_${col}`));
                    Object.keys(item.listB.additionalData).forEach(col => allColumns.add(`B_${col}`));
                });
                
                commonHeaders.push(...Array.from(allColumns));
                commonSheet.addRow(commonHeaders);
                
                this.results.common.forEach(item => {
                    const row = [
                        item.containerId,
                        item.listA.rowNumber,
                        item.listB.rowNumber
                    ];
                    
                    // Add additional data
                    allColumns.forEach(col => {
                        if (col.startsWith('A_')) {
                            const actualCol = col.substring(2);
                            row.push(item.listA.additionalData[actualCol] || '');
                        } else if (col.startsWith('B_')) {
                            const actualCol = col.substring(2);
                            row.push(item.listB.additionalData[actualCol] || '');
                        }
                    });
                    
                    commonSheet.addRow(row);
                });
            }

            // Only in A sheet
            if (this.results.onlyInA.length > 0) {
                const onlyASheet = workbook.addWorksheet('Only_in_A');
                this.addContainerSheetData(onlyASheet, this.results.onlyInA, 'Only in List A');
            }

            // Only in B sheet
            if (this.results.onlyInB.length > 0) {
                const onlyBSheet = workbook.addWorksheet('Only_in_B');
                this.addContainerSheetData(onlyBSheet, this.results.onlyInB, 'Only in List B');
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

    /**
     * Add container sheet data for ExcelJS
     */
    addContainerSheetData(worksheet, containers, title) {
        if (containers.length === 0) {
            worksheet.addRow([title]);
            worksheet.addRow(['No containers found']);
            return;
        }

        // Get all unique additional data columns
        const allColumns = new Set();
        containers.forEach(container => {
            Object.keys(container.additionalData).forEach(col => allColumns.add(col));
        });

        const headers = ['Container ID', 'Row Number', 'Original ID'];
        headers.push(...Array.from(allColumns));
        worksheet.addRow(headers);

        containers.forEach(container => {
            const row = [
                container.containerId,
                container.rowNumber,
                container.originalId
            ];

            allColumns.forEach(col => {
                row.push(container.additionalData[col] || '');
            });

            worksheet.addRow(row);
        });
    }

    /**
     * Create container sheet data
     */
    createContainerSheet(containers, title) {
        if (containers.length === 0) return [[title], ['No containers found']];

        // Get all unique additional data columns
        const allColumns = new Set();
        containers.forEach(container => {
            Object.keys(container.additionalData).forEach(col => allColumns.add(col));
        });

        const headers = ['Container ID', 'Row Number', 'Original ID'];
        headers.push(...Array.from(allColumns));

        const data = [headers];

        containers.forEach(container => {
            const row = [
                container.containerId,
                container.rowNumber,
                container.originalId
            ];

            allColumns.forEach(col => {
                row.push(container.additionalData[col] || '');
            });

            data.push(row);
        });

        return data;
    }
}

module.exports = ListCompare;