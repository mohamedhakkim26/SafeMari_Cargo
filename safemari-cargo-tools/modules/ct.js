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
     * Process CT stowage sorting with universal analysis
     * @param {Object} options - Processing options
     * @param {string} options.reeferListPath - Path to FULL reefer list Excel file (with stowage + container ID)
     * @param {string} options.ctSheetPath - Path to CT monitoring sheet Excel file
     * @returns {Object} Processing results
     */
    async processCTStowage(options) {
        try {
            const { reeferListPath, ctSheetPath } = options;

            console.log('\n=== CT STOWAGE PROCESSING WITH UNIVERSAL ANALYSIS ===');
            console.log('Loading CT files:', { reeferListPath, ctSheetPath });

            // Load files based on extension
            this.fullReeferData = await this.loadFile(reeferListPath);
            this.ctData = await this.loadFile(ctSheetPath);

            // Universal analysis of both files
            const reeferAnalysis = await this.analyzeDocumentStructure(this.fullReeferData, 'reefer', reeferListPath);
            const ctAnalysis = await this.analyzeDocumentStructure(this.ctData, 'ct', ctSheetPath);

            // Validate processing capability
            console.log('\n🔍 FINAL VALIDATION:');
            const validationResult = this.validateProcessingCapability(reeferAnalysis, ctAnalysis);
            console.log(`   Can Process: ${validationResult.canProcess} (${validationResult.issues.length} issues)`);
            
            if (validationResult.issues.length > 0) {
                validationResult.issues.forEach(issue => {
                    console.log(`   ❌ ${issue}`);
                });
            }
            
            if (!validationResult.canProcess) {
                throw new Error(validationResult.errorMessage);
            }
            
            console.log('   ✅ Validation passed - proceeding with extraction');

            // Build stowage map using intelligent analysis
            const stowageMap = await this.buildStowageMapUniversal(reeferAnalysis);
            console.log('Built stowage map with', Object.keys(stowageMap).length, 'containers');

            // Parse CT sheet structure using intelligent analysis
            const ctStructure = await this.parseCtBlocksUniversal(ctAnalysis);
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
                sortedCtRows: this.sortedCtRows,
                reeferAnalysis: reeferAnalysis,
                ctAnalysis: ctAnalysis,
                processingPlan: validationResult
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
     * Universal container ID detection with adaptive patterns
     */
    detectContainerId(cell) {
        if (cell === undefined || cell === null) return null;
        const s = cell.toString().trim().toUpperCase();
        
        // Comprehensive container ID patterns for maximum compatibility
        const patterns = [
            /^[A-Z]{4}\d{7}$/,           // Standard: MEDU9780739 (11 chars)
            /^[A-Z]{4}\d{6}$/,           // Alternative: MEDU978073 (10 chars)
            /^[A-Z]{3}[UJZ]\d{7}$/,      // Special: MSCU9780739, TTNU1234567
            /^[A-Z]{4}\d{6}\d$/,         // With check digit
            /^[A-Z]{2,4}[UJZ]\d{6,7}$/,  // Flexible length
            /^[A-Z]{4}[0-9]{6,7}$/       // Numeric flexibility
        ];
        
        // Try exact patterns first
        for (const pattern of patterns) {
            if (pattern.test(s)) return s;
        }
        
        // Fuzzy matching for damaged/partial IDs
        if (s.length >= 8 && s.length <= 12) {
            const letterCount = (s.match(/[A-Z]/g) || []).length;
            const digitCount = (s.match(/\d/g) || []).length;
            
            if (letterCount >= 3 && digitCount >= 6) {
                // Likely a container ID with minor formatting issues
                return s;
            }
        }
        
        return null;
    }

    /**
     * Build stowage map using universal analysis (replaces hardcoded approach)
     */
    async buildStowageMapUniversal(reeferAnalysis) {
        const map = {};
        
        if (!this.fullReeferData || !reeferAnalysis.validSheets) return map;

        console.log('\n📤 EXTRACTING STOWAGE MAP from reefer list:');
        console.log(`   Using ${reeferAnalysis.validSheets.length} valid sheets`);

        // Process all valid sheets identified by universal analysis
        for (const sheetInfo of reeferAnalysis.validSheets) {
            const rows = this.fullReeferData.Sheets[sheetInfo.sheetName];
            const extracted = this.extractStowageFromSheet(rows, sheetInfo.sheetName, sheetInfo.containerCol, sheetInfo.stowageCol);
            
            // Merge into main map (avoid duplicates)
            for (const [containerId, stowage] of Object.entries(extracted)) {
                if (!(containerId in map)) {
                    map[containerId] = stowage;
                }
            }
        }

        const totalContainers = Object.keys(map).length;
        console.log(`   ✅ Total extracted: ${totalContainers} containers with stowage`);
        
        // Show some sample data for verification
        if (totalContainers > 0) {
            const sampleIds = Object.keys(map).slice(0, 3);
            const sampleData = sampleIds.map(id => `${id}=${map[id]}`);
            console.log(`   🔍 Sample containers: ${sampleData.join(', ')}`);
        }

        return map;
    }

    /**
     * Extract stowage data from a single sheet
     */
    extractStowageFromSheet(rows, sheetName, containerCol, stowageCol) {
        const map = {};
        let extracted = 0;
        let skipped = 0;
        
        if (containerCol === -1 || stowageCol === -1) {
            console.log(`   ⚠️ ${sheetName}: Missing columns (container=${containerCol}, stowage=${stowageCol})`);
            return map;
        }
        
        // Extract data starting from row 1 (skip header)
        for (let r = 1; r < rows.length; r++) {
            const row = rows[r] || [];
            
            // Get container ID
            const rawId = row[containerCol];
            const id = this.detectContainerId(rawId);
            if (!id) {
                skipped++;
                continue;
            }
            
            // Get stowage
            const rawStowage = row[stowageCol];
            const stowage = this.detectStowage(rawStowage);
            if (!stowage) {
                // Debug: show what we're skipping
                if (skipped < 3) {
                    console.log(`      Debug: Row ${r}, Container ${id}, StowageCell="${rawStowage}" -> no stowage detected`);
                }
                skipped++;
                continue;
            }
            
            // Add to map (avoid duplicates)
            if (!(id in map)) {
                map[id] = stowage;
                extracted++;
                
                // Debug: show first few extractions
                if (extracted <= 3) {
                    console.log(`      Debug: Row ${r}, Container ${id}, Stowage=${stowage}`);
                }
            }
        }
        
        console.log(`   ✅ ${sheetName}: ${extracted} containers extracted (${skipped} skipped)`);
        return map;
    }

    /**
     * Universal stowage detection with adaptive patterns
     */
    detectStowage(cell) {
        if (cell === undefined || cell === null) return null;
        let s = cell.toString().trim();
        
        // Handle various stowage formats with context
        const stowagePatterns = [
            /^(\d{2})[\s\.]?(\d{2})[\s\.]?(\d{2})$/,     // 12.34.56, 12 34 56, 123456
            /^(\d{3})[\s\.]?(\d{2})[\s\.]?(\d{2})$/,     // 123.45.67 (3-digit bay)
            /^(\d{2})[-_](\d{2})[-_](\d{2})$/,          // 12-34-56, 12_34_56
            /^Hold\s*(\d{1,3})\s*Bay\s*(\d{1,2})\s*Tier\s*(\d{1,2})$/i, // Hold 12 Bay 34 Tier 56
            /^Bay\s*(\d{1,3})\s*Row\s*(\d{1,2})\s*Tier\s*(\d{1,2})$/i,  // Bay 123 Row 45 Tier 67
            /^(\d{6})$/,                                // 123456 (6 digits)
            /^(\d{2,3})(\d{2})(\d{2})$/                 // 12|34|56 or 123|45|67
        ];
        
        // Try pattern matching first
        for (const pattern of stowagePatterns) {
            const match = s.match(pattern);
            if (match) {
                let bay, row, tier;
                
                if (match.length === 4) {
                    // Three capture groups: bay, row, tier
                    bay = match[1];
                    row = match[2];
                    tier = match[3];
                } else if (match.length === 2 && match[1].length === 6) {
                    // Single 6-digit string
                    const digits = match[1];
                    bay = digits.substring(0, digits.length - 4);
                    row = digits.substring(digits.length - 4, digits.length - 2);
                    tier = digits.substring(digits.length - 2);
                }
                
                if (bay && row && tier) {
                    // Validate ranges (reasonable stowage values)
                    const bayNum = parseInt(bay);
                    const rowNum = parseInt(row);
                    const tierNum = parseInt(tier);
                    
                    if (bayNum >= 1 && bayNum <= 999 && 
                        rowNum >= 1 && rowNum <= 99 && 
                        tierNum >= 1 && tierNum <= 99) {
                        return s; // Return original format
                    }
                }
            }
        }
        
        // Fallback: look for any 6-digit number in reasonable range
        const digitMatch = s.match(/\d{6}/);
        if (digitMatch) {
            const digits = digitMatch[0];
            const bay = parseInt(digits.substring(0, 2));
            const row = parseInt(digits.substring(2, 4));
            const tier = parseInt(digits.substring(4, 6));
            
            if (bay >= 1 && bay <= 99 && row >= 1 && row <= 99 && tier >= 1 && tier <= 99) {
                return digits;
            }
        }
        
        return null;
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
     * Normalize stowage to 6-digit key BBRRTT for sorting (enhanced from HTML logic)
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
     * Parse CT sheet using universal analysis (replaces hardcoded approach)
     */
    async parseCtBlocksUniversal(ctAnalysis) {
        if (!this.ctData || !ctAnalysis.validSheets) return null;

        console.log('\n📤 PARSING CT BLOCKS using universal analysis:');
        
        // Use the best sheet identified by universal analysis
        const bestSheet = this.selectBestSheet(ctAnalysis.validSheets, 'ct');
        const sheetName = bestSheet.sheetName;
        const rows = this.ctData.Sheets[sheetName];
        
        console.log(`   Using sheet: ${sheetName} (${bestSheet.containerCount} containers detected)`);
        
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
        
        console.log(`   ✅ Parsed ${blocks.length} CT blocks with ${headerRows.length} header rows`);
        
        return {
            sheetName: sheetName,
            rows: rows,
            headerRows: headerRows,
            blocks: blocks,
            tailRows: tailRows
        };
    }

    /**
     * Universal document analysis with adaptive format detection (from reefer checker)
     */
    async analyzeDocumentStructure(workbook, fileType, filePath) {
        const fileName = require('path').basename(filePath);
        
        console.log(`\n=== ANALYZING ${fileName.toUpperCase()} ===`);
        console.log(`File Type: ${fileType}`);
        console.log(`Total Sheets: ${workbook.SheetNames.length}`);
        
        const validSheets = [];
        const issues = [];
        
        // Adaptive sheet analysis with format flexibility
        for (const sheetName of workbook.SheetNames) {
            const rows = workbook.Sheets[sheetName];
            
            if (!rows || rows.length < 2) {
                issues.push(`Sheet '${sheetName}': Too few rows (${rows?.length || 0})`);
                continue;
            }
            
            // Smart sheet filtering - more flexible patterns
            if (this.isSkippableSheet(sheetName, rows)) {
                console.log(`📋 SKIPPED: ${sheetName} (${this.getSkipReason(sheetName, rows)})`);
                continue;
            }
            
            // Universal container and stowage detection
            const sheetData = this.analyzeSheetUniversal(rows, sheetName, fileType);
            
            if (sheetData.isValid) {
                validSheets.push({
                    sheetName: sheetName,
                    ...sheetData
                });
                console.log(`📋 FOUND: ${sheetName} - ${sheetData.containerCount} containers, ${sheetData.stowageCount || 0} stowage (confidence: ${sheetData.confidence.toFixed(2)})`);
            } else {
                issues.push(`Sheet '${sheetName}': ${sheetData.reason}`);
                console.log(`📋 SKIPPED: ${sheetName} - ${sheetData.reason}`);
            }
        }
        
        // Validation with detailed feedback
        const validation = this.validateSheetData(validSheets, fileType, fileName, issues);
        
        if (!validation.canProcess) {
            throw new Error(validation.errorMessage);
        }
        
        const bestSheet = this.selectBestSheet(validSheets, fileType);
        
        console.log(`\n🎯 ${fileName.toUpperCase()} SUMMARY:`);
        console.log(`   ✅ Valid sheets: ${validSheets.length}`);
        console.log(`   📈 Best sheet: ${bestSheet.sheetName} (${bestSheet.containerCount} containers)`);
        console.log(`   📈 Total containers: ${validSheets.reduce((sum, s) => sum + s.containerCount, 0)}`);
        console.log(`   🎯 Confidence: ${bestSheet.confidence.toFixed(2)}`);
        
        return {
            sheetName: bestSheet.sheetName,
            validSheets: validSheets,
            processingRecommendations: {
                canProcess: true,
                validSheets: validSheets,
                columnMappings: {
                    containerId: bestSheet.containerCol,
                    stowage: bestSheet.stowageCol
                },
                detectionSummary: validation.detectionSummary,
                criticalIssues: validation.issues,
                confidence: bestSheet.confidence
            }
        };
    }

    /**
     * Universal sheet analysis with adaptive format detection (from reefer checker)
     */
    analyzeSheetUniversal(rows, sheetName, fileType) {
        const maxCols = Math.max(...rows.map(row => row ? row.length : 0));
        const scanRows = Math.min(rows.length, 200);
        
        // Multi-pass analysis for maximum compatibility
        const headerAnalysis = this.analyzeHeaders(rows[0] || [], maxCols, fileType);
        const dataAnalysis = this.analyzeDataPatterns(rows, maxCols, scanRows, fileType);
        const structureAnalysis = this.analyzeDataStructure(rows, scanRows);
        
        // Combine analyses with confidence scoring
        const containerCol = this.selectBestContainerColumn(dataAnalysis.containerCols, headerAnalysis);
        const stowageCol = this.selectBestStowageColumn(dataAnalysis.stowageCols, headerAnalysis);
        
        const confidence = this.calculateSheetConfidence(containerCol, stowageCol, dataAnalysis, structureAnalysis);
        
        const isValid = containerCol.col !== -1 && confidence > 0.3;
        
        if (isValid) {
            console.log(`   🎯 Sheet analysis: Container col ${containerCol.col} (${containerCol.count} IDs), Stowage col ${stowageCol.col} (${stowageCol.count} stowage)`);
            console.log(`   📈 Confidence: ${confidence.toFixed(2)} (${this.getConfidenceLevel(confidence)})`);
        }
        
        return {
            isValid,
            containerCount: containerCol.count,
            stowageCount: stowageCol.count,
            containerCol: containerCol.col,
            stowageCol: stowageCol.col,
            confidence: confidence,
            reason: isValid ? 'Valid container data detected' : this.getDiagnosticReason(containerCol, stowageCol, confidence),
            headerAnalysis,
            dataAnalysis,
            structureAnalysis
        };
    }

    /**
     * Analyze headers for container and stowage columns
     */
    analyzeHeaders(headerRow, maxCols, fileType) {
        const containerHeaders = [];
        const stowageHeaders = [];
        
        for (let col = 0; col < maxCols; col++) {
            const header = headerRow[col];
            if (!header) continue;
            
            const headerStr = header.toString().toLowerCase();
            
            // Container header patterns (more flexible)
            if (/cont|cntr|box|id|number|unit|equip/.test(headerStr)) {
                containerHeaders.push({ col, header: headerStr, confidence: this.getContainerHeaderConfidence(headerStr) });
            }
            
            // Stowage header patterns
            if (/stow|position|location|bay|row|tier|hold|deck|slot/.test(headerStr)) {
                stowageHeaders.push({ col, header: headerStr, confidence: this.getStowageHeaderConfidence(headerStr) });
            }
        }
        
        return { containerHeaders, stowageHeaders };
    }

    /**
     * Analyze data patterns in all columns
     */
    analyzeDataPatterns(rows, maxCols, scanRows, fileType) {
        const containerCols = [];
        const stowageCols = [];
        
        for (let col = 0; col < maxCols; col++) {
            let containerCount = 0;
            let stowageCount = 0;
            
            for (let row = 1; row < scanRows; row++) {
                const cell = rows[row] && rows[row][col];
                if (!cell) continue;
                
                // Container ID detection
                if (this.detectContainerId(cell)) {
                    containerCount++;
                }
                
                // Stowage detection
                if (this.detectStowage(cell)) {
                    stowageCount++;
                }
            }
            
            if (containerCount > 0) {
                containerCols.push({ col, count: containerCount, confidence: containerCount / (scanRows - 1) });
            }
            
            if (stowageCount > 0) {
                stowageCols.push({ col, count: stowageCount, confidence: stowageCount / (scanRows - 1) });
            }
        }
        
        return { containerCols, stowageCols };
    }

    /**
     * Analyze overall data structure
     */
    analyzeDataStructure(rows, scanRows) {
        let hasHeaders = false;
        let dataStartRow = 0;
        let avgRowLength = 0;
        
        // Detect if first row is headers
        if (rows.length > 1) {
            const firstRow = rows[0] || [];
            const secondRow = rows[1] || [];
            
            const firstRowHasText = firstRow.some(cell => 
                cell && isNaN(parseFloat(cell.toString())) && cell.toString().length > 2
            );
            const secondRowHasNumbers = secondRow.some(cell => 
                cell && !isNaN(parseFloat(cell.toString()))
            );
            
            hasHeaders = firstRowHasText && secondRowHasNumbers;
            dataStartRow = hasHeaders ? 1 : 0;
        }
        
        // Calculate average row length
        let totalLength = 0;
        let validRows = 0;
        for (let i = dataStartRow; i < Math.min(scanRows, rows.length); i++) {
            if (rows[i] && rows[i].length > 0) {
                totalLength += rows[i].length;
                validRows++;
            }
        }
        avgRowLength = validRows > 0 ? totalLength / validRows : 0;
        
        return { hasHeaders, dataStartRow, avgRowLength, validRows };
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
     * Select best container column with confidence scoring
     */
    selectBestContainerColumn(containerCols, headerAnalysis) {
        if (containerCols.length === 0) {
            return { col: -1, count: 0, confidence: 0 };
        }
        
        // Boost confidence for header matches
        containerCols.forEach(col => {
            const headerMatch = headerAnalysis.containerHeaders.find(h => h.col === col.col);
            if (headerMatch) {
                col.confidence += headerMatch.confidence;
            }
        });
        
        // Sort by confidence, then by count
        containerCols.sort((a, b) => {
            if (Math.abs(a.confidence - b.confidence) < 0.1) {
                return b.count - a.count;
            }
            return b.confidence - a.confidence;
        });
        
        return containerCols[0];
    }

    /**
     * Select best stowage column with confidence scoring
     */
    selectBestStowageColumn(stowageCols, headerAnalysis) {
        if (stowageCols.length === 0) {
            return { col: -1, count: 0, confidence: 0 };
        }
        
        // Boost confidence for header matches
        stowageCols.forEach(col => {
            const headerMatch = headerAnalysis.stowageHeaders.find(h => h.col === col.col);
            if (headerMatch) {
                col.confidence += headerMatch.confidence * 2; // Stowage headers are very important
            }
        });
        
        // Sort by confidence, then by count
        stowageCols.sort((a, b) => {
            if (Math.abs(a.confidence - b.confidence) < 0.2) {
                return b.count - a.count;
            }
            return b.confidence - a.confidence;
        });
        
        return stowageCols[0];
    }

    /**
     * Calculate sheet confidence score
     */
    calculateSheetConfidence(containerCol, stowageCol, dataAnalysis, structureAnalysis) {
        let confidence = 0;
        
        // Container column confidence
        if (containerCol.col !== -1) {
            confidence += Math.min(containerCol.confidence * 0.5, 0.5);
        }
        
        // Stowage column confidence (for reefer files)
        if (stowageCol.col !== -1) {
            confidence += Math.min(stowageCol.confidence * 0.3, 0.3);
        }
        
        // Structure bonus
        if (structureAnalysis.hasHeaders) confidence += 0.1;
        if (structureAnalysis.validRows > 10) confidence += 0.1;
        
        return Math.min(confidence, 1.0);
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
     * Helper methods for universal analysis
     */
    getContainerHeaderConfidence(headerStr) {
        let confidence = 0.5;
        if (/container/i.test(headerStr)) confidence += 0.3;
        if (/id|number/i.test(headerStr)) confidence += 0.2;
        if (/cntr|box/i.test(headerStr)) confidence += 0.1;
        return Math.min(confidence, 1.0);
    }

    getStowageHeaderConfidence(headerStr) {
        let confidence = 0.5;
        if (/stowage/i.test(headerStr)) confidence += 0.4;
        if (/position|location/i.test(headerStr)) confidence += 0.3;
        if (/bay|row|tier/i.test(headerStr)) confidence += 0.2;
        return Math.min(confidence, 1.0);
    }

    isSkippableSheet(sheetName, rows) {
        const name = sheetName.toLowerCase();
        
        // Skip obvious summary/index sheets
        if (/^(summary|index|total|overview|toc|contents)$/i.test(name)) {
            return true;
        }
        
        // Skip sheets with summary indicators in name
        if (/(summary|total|\(\d+\)|recap|overview)$/i.test(name)) {
            return true;
        }
        
        // Skip very small sheets
        if (rows.length < 3) {
            return true;
        }
        
        return false;
    }

    getSkipReason(sheetName, rows) {
        if (rows.length < 3) return `too few rows (${rows.length})`;
        if (/summary|total|overview/i.test(sheetName)) return 'summary sheet';
        if (/\(\d+\)/.test(sheetName)) return 'summary indicator';
        return 'filtered out';
    }

    validateSheetData(validSheets, fileType, fileName, issues) {
        if (validSheets.length === 0) {
            return {
                canProcess: false,
                errorMessage: `No valid sheets found in ${fileName}. ${issues.join('; ')}`,
                issues: issues,
                detectionSummary: [`${fileName}: No container data detected`]
            };
        }
        
        const totalContainers = validSheets.reduce((sum, s) => sum + s.containerCount, 0);
        const avgConfidence = validSheets.reduce((sum, s) => sum + s.confidence, 0) / validSheets.length;
        
        const detectionSummary = [
            `${fileName}: ${totalContainers} containers across ${validSheets.length} sheets (avg confidence: ${avgConfidence.toFixed(2)})`
        ];
        
        return {
            canProcess: true,
            errorMessage: null,
            issues: [],
            detectionSummary: detectionSummary
        };
    }

    selectBestSheet(validSheets, fileType) {
        if (validSheets.length === 0) {
            throw new Error('No valid sheets available');
        }
        
        // For CT files, prefer highest container count
        // For reefer files, prefer highest confidence
        if (fileType === 'ct') {
            return validSheets.reduce((best, current) => 
                current.containerCount > best.containerCount ? current : best
            );
        } else {
            return validSheets.reduce((best, current) => 
                current.confidence > best.confidence ? current : best
            );
        }
    }

    validateProcessingCapability(reeferAnalysis, ctAnalysis) {
        const issues = [];
        const warnings = [];
        const detectionSummary = [];
        
        // Collect detection summaries
        if (reeferAnalysis.processingRecommendations?.detectionSummary) {
            detectionSummary.push(`REEFER: ${reeferAnalysis.processingRecommendations.detectionSummary.join(', ')}`);
        }
        if (ctAnalysis.processingRecommendations?.detectionSummary) {
            detectionSummary.push(`CT: ${ctAnalysis.processingRecommendations.detectionSummary.join(', ')}`);
        }
        
        // Enhanced validation with confidence scoring
        const reeferValid = this.validateFileAnalysis(reeferAnalysis, 'REEFER', issues, warnings);
        const ctValid = this.validateFileAnalysis(ctAnalysis, 'CT', issues, warnings);
        
        const canProcess = reeferValid && ctValid;
        
        return {
            canProcess: canProcess,
            errorMessage: canProcess ? null : this.generateErrorMessage(issues),
            issues: issues,
            warnings: warnings,
            detectionSummary: detectionSummary,
            confidence: this.calculateOverallConfidence(reeferAnalysis, ctAnalysis)
        };
    }

    validateFileAnalysis(analysis, fileType, issues, warnings) {
        const recs = analysis.processingRecommendations;
        
        if (!recs) {
            issues.push(`${fileType}: No processing recommendations generated`);
            return false;
        }
        
        if (!recs.columnMappings || recs.columnMappings.containerId === undefined) {
            issues.push(`${fileType}: No container ID column detected`);
            return false;
        }
        
        // For reefer files, also check stowage column
        if (fileType === 'REEFER' && recs.columnMappings.stowage === undefined) {
            issues.push(`${fileType}: No stowage column detected`);
            return false;
        }
        
        // Confidence warnings
        if (recs.confidence < 0.5) {
            warnings.push(`${fileType}: Low detection confidence (${recs.confidence.toFixed(2)})`);
        }
        
        if (!recs.validSheets || recs.validSheets.length === 0) {
            issues.push(`${fileType}: No valid sheets found`);
            return false;
        }
        
        return true;
    }

    generateErrorMessage(issues) {
        if (issues.length === 0) return 'Unknown validation error';
        
        const grouped = {};
        issues.forEach(issue => {
            const [file] = issue.split(':');
            if (!grouped[file]) grouped[file] = [];
            grouped[file].push(issue.substring(file.length + 2));
        });
        
        const messages = Object.entries(grouped).map(([file, fileIssues]) => 
            `${file}: ${fileIssues.join(', ')}`
        );
        
        return `Validation failed - ${messages.join('; ')}`;
    }

    calculateOverallConfidence(reeferAnalysis, ctAnalysis) {
        const reeferConf = reeferAnalysis.processingRecommendations?.confidence || 0;
        const ctConf = ctAnalysis.processingRecommendations?.confidence || 0;
        return (reeferConf + ctConf) / 2;
    }

    getConfidenceLevel(confidence) {
        if (confidence >= 0.8) return 'High';
        if (confidence >= 0.6) return 'Good';
        if (confidence >= 0.4) return 'Fair';
        return 'Low';
    }

    getDiagnosticReason(containerCol, stowageCol, confidence) {
        if (containerCol.col === -1) return 'No container IDs detected';
        if (stowageCol.col === -1) return 'No stowage data detected';
        if (confidence <= 0.3) return `Low confidence (${confidence.toFixed(2)})`;
        return 'Unknown validation issue';
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