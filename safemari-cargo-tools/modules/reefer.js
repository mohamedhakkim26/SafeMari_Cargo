const ExcelJS = require('exceljs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

/**
 * Reefer Temperature Checker Module (Simple Container Search)
 * Compares set temperatures from CHECK files with actual temperatures from MANIFEST files
 */
class ReeferChecker {
    constructor() {
        this.checkData = null;
        this.manifestData = null;
        this.results = null;
        this.initialized = true; // No AI initialization needed
        this.processingPlan = null;
    }

    /**
     * Simple initialization (no AI needed)
     */
    async initialize() {
        // Nothing to initialize for simple container search
        this.initialized = true;
    }

    /**
     * Process reefer temperature check comparison
     * @param {string} options.checkFilePath - Path to CHECK Excel file
     * @param {string} options.manifestFilePath - Path to MANIFEST Excel file
     * @returns {Object} Processing results
     */
    async processReeferCheck(options) {
        try {
            const { checkFilePath, manifestFilePath } = options;

            // Simple initialization
            this.initialized = true;

            // Load and parse files based on extension
            this.checkData = await this.loadFile(checkFilePath);
            this.manifestData = await this.loadFile(manifestFilePath);

            // Analyze documents with AI-driven recommendations
            const checkAnalysis = await this.analyzeDocumentStructure(this.checkData, 'check', checkFilePath);
            const manifestAnalysis = await this.analyzeDocumentStructure(this.manifestData, 'manifest', manifestFilePath);

            // Validate processing capability
            console.log(`\n🔍 FINAL VALIDATION:`);
            const validationResult = this.validateProcessingCapability(checkAnalysis, manifestAnalysis);
            console.log(`   Can Process: ${validationResult.canProcess} (${validationResult.issues.length} issues)`);
            
            if (validationResult.issues.length > 0) {
                validationResult.issues.forEach(issue => {
                    console.log(`   ❌ ${issue}`);
                });
            }
            
            if (!validationResult.canProcess) {
                throw new Error(validationResult.errorMessage);
            }
            
            console.log(`   ✅ Validation passed - proceeding with extraction`);

            // Extract data using AI recommendations
            const checkMap = await this.extractDataUsingPlan(this.checkData, checkAnalysis.processingRecommendations, checkAnalysis.sheetName);
            const manifestMap = await this.extractDataUsingPlan(this.manifestData, manifestAnalysis.processingRecommendations, manifestAnalysis.sheetName);

            // Process comparison (like HTML version)
            this.results = this.compareTemperatures(checkMap, manifestMap);

            return {
                success: true,
                results: this.results,
                summary: this.generateSummary(),
                downloadData: this.prepareDownloadData(),
                checkAnalysis: checkAnalysis,
                manifestAnalysis: manifestAnalysis,
                processingPlan: validationResult
            };

        } catch (error) {
            console.error('Reefer check processing error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Load file based on extension (Excel, PDF, or DOCX)
     */
    async loadFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        
        if (ext === '.pdf') {
            return await this.loadPDF(filePath);
        } else if (ext === '.docx' || ext === '.doc') {
            return await this.loadDOCX(filePath);
        } else {
            return await this.loadExcel(filePath);
        }
    }

    /**
     * Load Excel file into workbook structure compatible with HTML logic
     */
    async loadExcel(filePath) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        
        // Convert to format compatible with HTML logic
        const sheets = {};
        const sheetNames = [];
        
        workbook.eachSheet((worksheet) => {
            const sheetName = worksheet.name;
            sheetNames.push(sheetName);
            
            const rows = [];
            worksheet.eachRow((row, rowNumber) => {
                const rowData = [];
                row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                    rowData[colNumber - 1] = cell.value;
                });
                rows.push(rowData);
            });
            
            sheets[sheetName] = rows;
        });
        
        return { SheetNames: sheetNames, Sheets: sheets };
    }

    /**
     * Load PDF file (placeholder - basic text extraction)
     */
    async loadPDF(filePath) {
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);
        
        // Simple PDF parsing - convert to single sheet format
        const lines = pdfData.text.split('\n').filter(line => line.trim());
        const rows = lines.map(line => line.split(/\s+/));
        
        return { 
            SheetNames: ['PDF_Data'], 
            Sheets: { 'PDF_Data': rows }
        };
    }

    /**
     * Load DOCX file and extract table data
     */
    async loadDOCX(filePath) {
        const dataBuffer = fs.readFileSync(filePath);
        const result = await mammoth.convertToHtml({ buffer: dataBuffer });
        
        // Parse the HTML to extract table data
        const sheets = this.parseDOCXHTML(result.value);
        
        return {
            SheetNames: Object.keys(sheets),
            Sheets: sheets
        };
    }

    /**
     * Parse DOCX HTML content to extract reefer manifest tables
     */
    parseDOCXHTML(html) {
        const sheets = {};
        
        // Split by destination sections
        const destSections = html.split(/Destination Port:\s*([A-Z\s]+)/i);
        
        for (let i = 1; i < destSections.length; i += 2) {
            const destination = destSections[i].trim();
            const sectionContent = destSections[i + 1] || '';
            
            // Extract all containers and temperatures from this section
            const sectionData = this.extractContainersFromHTML(sectionContent, destination);
            
            if (sectionData.length > 0) {
                sheets[destination] = sectionData;
            }
        }
        
        // If no destination-based sections found, parse entire HTML
        if (Object.keys(sheets).length === 0) {
            const allData = this.extractContainersFromHTML(html, 'MANIFEST');
            if (allData.length > 0) {
                sheets['MANIFEST'] = allData;
            }
        }
        
        return sheets;
    }

    /**
     * Extract containers from HTML content
     */
    extractContainersFromHTML(html, destination) {
        const rows = [];
        
        // Add header row
        rows.push([
            'Shipper & Forwarder', 'Container #', 'Size', 'Commodity', 
            'No. of Packages', 'Weight (Kgs)', 'Volume', 'Temperature (C)',
            'Vent. Percentage', 'Dehumidification(%)', 'Ventilated(Y/N)',
            'Air Fresh Vents', 'Cold Treatment(Y/N)', 'Atmosphere Control (Y/N)'
        ]);
        
        // Find all container IDs in this section
        const containerMatches = [...html.matchAll(/([A-Z]{4}\d{7})/g)];
        
        for (const containerMatch of containerMatches) {
            const containerId = containerMatch[1];
            const matchIndex = containerMatch.index;
            
            // Look for temperature near this container ID (within 500 characters)
            const contextStart = Math.max(0, matchIndex - 250);
            const contextEnd = Math.min(html.length, matchIndex + 250);
            const context = html.substring(contextStart, contextEnd);
            
            // Find temperature in context
            const tempMatch = context.match(/(-?\d+(?:\.\d+)?\s*C)/i);
            const temperature = tempMatch ? tempMatch[1] : '0 C';
            
            // Create row with container data
            const row = [
                'TRANSSHIPMENT',  // Shipper
                containerId,      // Container #
                '1 x 40 HR',      // Size
                'CARGO',          // Commodity
                '1',              // Packages
                '0',              // Weight
                '0',              // Volume
                temperature,      // Temperature
                '0',              // Vent %
                '0',              // Dehumidification
                'N',              // Ventilated
                'VENTS CLOSED',   // Air Fresh Vents
                'N',              // Cold Treatment
                'N'               // Atmosphere Control
            ];
            
            rows.push(row);
        }
        
        return rows;
    }

    /**
     * Check if table data contains container information
     */
    hasContainerData(tableData) {
        if (!tableData || tableData.length < 2) return false;
        
        // Look for container IDs in the data
        for (let row of tableData) {
            for (let cell of row) {
                if (this.detectContainerId(cell)) {
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * Parse HTML table to extract structured data
     */
    parseHTMLTable(tableHtml) {
        const rows = [];
        
        // Extract table rows
        const rowMatches = tableHtml.match(/<tr[^>]*>.*?<\/tr>/gis);
        
        if (rowMatches) {
            rowMatches.forEach(rowHtml => {
                const cells = [];
                
                // Extract table cells (both td and th)
                const cellMatches = rowHtml.match(/<(td|th)[^>]*>.*?<\/(td|th)>/gis);
                
                if (cellMatches) {
                    cellMatches.forEach(cellHtml => {
                        // Remove HTML tags and get text content
                        const cellText = cellHtml.replace(/<[^>]*>/g, '').trim();
                        cells.push(cellText);
                    });
                }
                
                if (cells.length > 0) {
                    rows.push(cells);
                }
            });
        }
        
        return rows;
    }





    /**
     * Analyze sheet columns for best ID and temp columns (from HTML logic)
     */
    analyzeSheetColumns(rows) {
        if (!rows || rows.length === 0) return null;

        const maxScanRows = Math.min(rows.length, 300);
        let maxCols = 0;
        for (let r = 0; r < maxScanRows; r++) {
            const row = rows[r] || [];
            if (row.length > maxCols) maxCols = row.length;
        }

        const profiles = [];
        for (let c = 0; c < maxCols; c++) {
            profiles[c] = { nonEmpty: 0, idCount: 0, tempPoints: 0 };
        }

        for (let r = 0; r < maxScanRows; r++) {
            const row = rows[r] || [];
            for (let c = 0; c < maxCols; c++) {
                const cell = row[c];
                if (cell === undefined || cell === null || cell === "") continue;
                const p = profiles[c];
                p.nonEmpty++;

                if (this.detectContainerId(cell)) {
                    p.idCount++;
                }
                p.tempPoints += this.tempScoreForCell(cell);
            }
        }

        // Pick best ID + temp columns with relaxed thresholds (to include small sheets)
        let bestIdCol = -1;
        let bestIdScore = 0;
        let bestTempCol = -1;
        let bestTempScore = 0;

        for (let c = 0; c < maxCols; c++) {
            const p = profiles[c];
            if (p.nonEmpty === 0) continue;

            const idScore = p.idCount / p.nonEmpty;
            const tempScore = p.tempPoints / p.nonEmpty;

            // Container ID column: allow even small sheets (>=1 ID)
            if (idScore > bestIdScore && p.idCount >= 1) {
                bestIdScore = idScore;
                bestIdCol = c;
            }

            // Temp column: allow few temp cells (>=2 temp points)
            if (tempScore > bestTempScore && p.tempPoints >= 2) {
                bestTempScore = tempScore;
                bestTempCol = c;
            }
        }

        // Minimal thresholds so we don't pick pure noise
        if (bestIdCol === -1 || bestIdScore < 0.05) {
            return null; // no good ID column
        }
        if (bestTempCol === -1 || bestTempScore < 0.3) {
            return null; // no good temp column
        }

        return {
            idCol: bestIdCol,
            tempCol: bestTempCol,
            idScore: bestIdScore,
            tempScore: bestTempScore
        };
    }

    /**
     * Universal document analysis with adaptive format detection
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
            
            // Universal container and temperature detection
            const sheetData = this.analyzeSheetUniversal(rows, sheetName);
            
            if (sheetData.isValid) {
                validSheets.push({
                    sheetName: sheetName,
                    ...sheetData
                });
                console.log(`📋 FOUND: ${sheetName} - ${sheetData.containerCount} containers, ${sheetData.tempCount} temps (confidence: ${sheetData.confidence.toFixed(2)})`);
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
        console.log(`   📊 Best sheet: ${bestSheet.sheetName} (${bestSheet.containerCount} containers)`);
        console.log(`   📊 Total containers: ${validSheets.reduce((sum, s) => sum + s.containerCount, 0)}`);
        console.log(`   🎯 Confidence: ${bestSheet.confidence.toFixed(2)}`);
        
        return {
            sheetName: bestSheet.sheetName,
            validSheets: validSheets,
            processingRecommendations: {
                canProcess: true,
                validSheets: validSheets,
                columnMappings: {
                    containerId: bestSheet.containerCol,
                    setTemp: bestSheet.tempCol,
                    actualTemp: bestSheet.tempCol
                },
                detectionSummary: validation.detectionSummary,
                criticalIssues: validation.issues,
                confidence: bestSheet.confidence
            }
        };
    }
    
    /**
     * Comprehensive validation with detailed diagnostics
     */
    validateProcessingCapability(checkAnalysis, manifestAnalysis) {
        const issues = [];
        const warnings = [];
        const detectionSummary = [];
        
        // Collect detection summaries
        if (checkAnalysis.processingRecommendations?.detectionSummary) {
            detectionSummary.push(`CHECK: ${checkAnalysis.processingRecommendations.detectionSummary.join(', ')}`);
        }
        if (manifestAnalysis.processingRecommendations?.detectionSummary) {
            detectionSummary.push(`MANIFEST: ${manifestAnalysis.processingRecommendations.detectionSummary.join(', ')}`);
        }
        
        // Enhanced validation with confidence scoring
        const checkValid = this.validateFileAnalysis(checkAnalysis, 'CHECK', issues, warnings);
        const manifestValid = this.validateFileAnalysis(manifestAnalysis, 'MANIFEST', issues, warnings);
        
        // Cross-validation checks
        if (checkValid && manifestValid) {
            this.performCrossValidation(checkAnalysis, manifestAnalysis, warnings);
        }
        
        const canProcess = checkValid && manifestValid;
        
        console.log(`\n🔍 COMPREHENSIVE VALIDATION:`);
        console.log(`   CHECK file: ${checkValid ? '✅' : '❌'} (confidence: ${checkAnalysis.processingRecommendations?.confidence?.toFixed(2) || 'N/A'})`);
        console.log(`   MANIFEST file: ${manifestValid ? '✅' : '❌'} (confidence: ${manifestAnalysis.processingRecommendations?.confidence?.toFixed(2) || 'N/A'})`);
        console.log(`   Issues: ${issues.length}, Warnings: ${warnings.length}`);
        console.log(`   Can process: ${canProcess ? '✅' : '❌'}`);
        
        if (warnings.length > 0) {
            console.log(`\n⚠️ WARNINGS:`);
            warnings.forEach(w => console.log(`   • ${w}`));
        }
        
        return {
            canProcess: canProcess,
            errorMessage: canProcess ? null : this.generateErrorMessage(issues),
            issues: issues,
            warnings: warnings,
            detectionSummary: detectionSummary,
            confidence: this.calculateOverallConfidence(checkAnalysis, manifestAnalysis)
        };
    }
    
    /**
     * Extract data using simple container search
     */
    async extractDataUsingPlan(workbook, processingPlan, bestSheetName) {
        const map = {};
        
        // Check if we have multiple valid sheets (MANIFEST mode)
        if (processingPlan.validSheets && processingPlan.validSheets.length > 0) {
            console.log(`\n📤 EXTRACTING from ${processingPlan.validSheets.length} sheets (MULTI-SHEET mode)`);
            
            for (const sheetInfo of processingPlan.validSheets) {
                const rows = workbook.Sheets[sheetInfo.sheetName];
                const extracted = this.extractFromSheet(rows, sheetInfo.sheetName, sheetInfo.containerCol, sheetInfo.tempCol);
                
                // Merge into main map (avoid duplicates)
                for (const [containerId, temp] of Object.entries(extracted)) {
                    if (!(containerId in map)) {
                        map[containerId] = temp;
                    }
                }
            }
        } else {
            // Single sheet extraction (fallback)
            const sheetName = bestSheetName || workbook.SheetNames[0];
            const rows = workbook.Sheets[sheetName];
            const idCol = processingPlan.columnMappings.containerId;
            const tempCol = processingPlan.columnMappings.setTemp || processingPlan.columnMappings.actualTemp;
            
            console.log(`\n📤 EXTRACTING from ${sheetName} (SINGLE-SHEET mode)`);
            const extracted = this.extractFromSheet(rows, sheetName, idCol, tempCol);
            Object.assign(map, extracted);
        }
        
        const totalContainers = Object.keys(map).length;
        console.log(`   ✅ Total extracted: ${totalContainers} containers`);
        
        // Show some sample containers for verification
        if (totalContainers > 0) {
            const sampleIds = Object.keys(map).slice(0, 3);
            const sampleData = sampleIds.map(id => `${id}=${map[id]}°C`);
            console.log(`   🔍 Sample containers: ${sampleData.join(', ')}`);
        
        // Additional debugging for low extraction counts
        if (totalContainers < 100) {
            console.log(`   ⚠️ Low extraction count - this might indicate detection issues`);
        }
        }
        
        return map;
    }
    
    /**
     * Legacy method - kept for compatibility
     */
    async extractIdTempMapAuto(workbook, fileType) {
        const map = {};
        let successfulSheets = 0;

        console.log(`Processing ${fileType} file with ${workbook.SheetNames.length} sheets:`, workbook.SheetNames);

        for (const sheetName of workbook.SheetNames) {
            const rows = workbook.Sheets[sheetName];
            if (!rows || rows.length === 0) {
                console.log(`Skipping empty sheet: ${sheetName}`);
                continue;
            }

            // Skip obviously empty sheets but be more permissive with manifest sheets
            if (rows.length < 5) {
                console.log(`Skipping very small sheet: ${sheetName} (${rows.length} rows)`);
                continue;
            }

            // For manifest files, try all sheets since container data could be anywhere
            // Only skip sheets that are obviously summaries or indexes
            if (fileType === 'manifest') {
                const isSkippable = /^(summary|index|total|overview)$/i.test(sheetName);
                if (isSkippable) {
                    console.log(`Skipping summary sheet: ${sheetName}`);
                    continue;
                }
            }

            try {
                console.log(`Analyzing sheet: ${sheetName} (${rows.length} rows)`);
                
                // Use hybrid detector for better column detection
                const columnInfo = await this.hybridDetector.detectColumns(rows, fileType);
                
                if (!columnInfo.containerId || (!columnInfo.setTemp && !columnInfo.manifestTemp)) {
                    console.warn(`Could not detect required columns in sheet: ${sheetName}`);
                    continue;
                }

                const idCol = columnInfo.containerId;
                const tempCol = fileType === 'check' ? columnInfo.setTemp : columnInfo.manifestTemp;

                console.log(`Sheet ${sheetName}: Using columns ID=${idCol}, Temp=${tempCol}`);

                // Find first data row (where an ID appears in idCol)
                let firstDataRow = 0;
                for (let r = 0; r < rows.length; r++) {
                    const row = rows[r] || [];
                    if (this.detectContainerId(row[idCol])) {
                        firstDataRow = r;
                        break;
                    }
                }

                let containerCount = 0;
                for (let r = firstDataRow; r < rows.length; r++) {
                    const row = rows[r] || [];
                    const rawId = row[idCol];
                    const id = this.detectContainerId(rawId);
                    if (!id) continue;

                    const cellTemp = row[tempCol];
                    const val = this.detectTempNumber(cellTemp);
                    if (val === null) continue;

                    if (!(id in map)) {
                        map[id] = val;
                        containerCount++;
                    }
                }

                if (containerCount > 0) {
                    successfulSheets++;
                    console.log(`Sheet ${sheetName}: Found ${containerCount} containers using ${columnInfo.method || 'hybrid'} detection (confidence: ${(columnInfo.confidence || 0).toFixed(2)})`);
                } else {
                    console.log(`Sheet ${sheetName}: No valid container data found`);
                }
                
            } catch (error) {
                console.warn(`Error processing sheet ${sheetName}:`, error.message);
                continue;
            }
        }

        console.log(`${fileType} processing complete: ${Object.keys(map).length} total containers from ${successfulSheets} sheets`);
        return map;
    }

    /**
     * Compare temperatures between check and manifest data (with debugging)
     */
    compareTemperatures(checkMap, manifestMap) {
        const checkIds = Object.keys(checkMap || {});
        const missing = [];
        const mismatches = [];
        let found = 0;
        let exactMatches = 0;

        console.log(`\n🔍 TEMPERATURE COMPARISON:`);
        console.log(`   CHECK containers: ${checkIds.length}`);
        console.log(`   MANIFEST containers: ${Object.keys(manifestMap || {}).length}`);
        
        // Show some sample data for debugging
        const sampleCheck = checkIds.slice(0, 3);
        const sampleManifest = Object.keys(manifestMap || {}).slice(0, 3);
        
        console.log(`   Sample CHECK: ${sampleCheck.map(id => `${id}=${checkMap[id]}°C`).join(', ')}`);
        console.log(`   Sample MANIFEST: ${sampleManifest.map(id => `${id}=${manifestMap[id]}°C`).join(', ')}`);

        for (const id of checkIds) {
            const setT = checkMap[id];
            const manT = manifestMap[id];

            if (manT === undefined) {
                missing.push(id);
                continue;
            }
            found++;

            const diff = Math.abs(setT - manT);
            if (diff > 0.1) {
                mismatches.push({ id, setT: setT, manT: manT, diff: diff });
            } else {
                exactMatches++;
            }
        }
        
        console.log(`   ✅ Found matches: ${found}`);
        console.log(`   🎯 Exact matches: ${exactMatches}`);
        console.log(`   ⚠️ Mismatches: ${mismatches.length}`);
        console.log(`   ❌ Missing: ${missing.length}`);
        
        // Show first few mismatches for debugging
        if (mismatches.length > 0) {
            console.log(`   🔍 Sample mismatches:`);
            mismatches.slice(0, 3).forEach(m => {
                console.log(`      ${m.id}: CHECK=${m.setT}°C vs MANIFEST=${m.manT}°C (diff=${m.diff.toFixed(2)}°C)`);
            });
        }
        
        // Print comprehensive summary
        this.printComparisonSummary(checkIds.length, Object.keys(manifestMap || {}).length, found, exactMatches, mismatches, missing);

        return {
            totalCheck: checkIds.length,
            totalManifest: Object.keys(manifestMap || {}).length,
            found: found,
            missing: missing,
            mismatches: mismatches,
            checkMap: checkMap,
            manifestMap: manifestMap
        };
    }

    /**
     * Print comprehensive comparison summary
     */
    printComparisonSummary(totalCheck, totalManifest, found, exactMatches, mismatches, missing) {
        console.log(`\n📊 COMPARISON SUMMARY:`);
        console.log(`────────────────────────────────────────`);
        
        console.log(`📄 INPUT FILES:`);
        console.log(`   • CHECK file containers: ${totalCheck}`);
        console.log(`   • MANIFEST file containers: ${totalManifest}`);
        
        console.log(`\n🔍 MATCHING RESULTS:`);
        console.log(`   • Containers found in both files: ${found}`);
        console.log(`   • Perfect temperature matches: ${exactMatches}`);
        console.log(`   • Temperature mismatches (>0.1°C): ${mismatches.length}`);
        console.log(`   • Missing from MANIFEST: ${missing.length}`);
        
        if (mismatches.length > 0) {
            console.log(`\n⚠️ TEMPERATURE MISMATCHES:`);
            const criticalMismatches = mismatches.filter(m => m.diff > 1.0);
            const minorMismatches = mismatches.filter(m => m.diff <= 1.0);
            
            if (criticalMismatches.length > 0) {
                console.log(`   • Critical (>1.0°C difference): ${criticalMismatches.length}`);
            }
            if (minorMismatches.length > 0) {
                console.log(`   • Minor (0.1-1.0°C difference): ${minorMismatches.length}`);
            }
        }
        
        if (missing.length > 0) {
            console.log(`\n❌ MISSING CONTAINERS:`);
            console.log(`   • ${missing.length} containers from CHECK file not found in MANIFEST`);
            if (missing.length <= 10) {
                console.log(`   • Missing IDs: ${missing.join(', ')}`);
            } else {
                console.log(`   • First 10 missing: ${missing.slice(0, 10).join(', ')}...`);
            }
        }
        
        console.log(`\n✅ SUMMARY:`);
        if (found === totalCheck && exactMatches === found) {
            console.log(`   • 🎉 PERFECT MATCH! All containers found with exact temperatures.`);
        } else if (found === totalCheck && mismatches.length <= 5) {
            console.log(`   • ✅ EXCELLENT! All containers found, only ${mismatches.length} minor temperature differences.`);
        } else if (found >= totalCheck * 0.95) {
            console.log(`   • 🟡 GOOD! ${((found/totalCheck)*100).toFixed(1)}% of containers matched.`);
        } else {
            console.log(`   • ⚠️ ATTENTION NEEDED! Only ${((found/totalCheck)*100).toFixed(1)}% of containers matched.`);
        }
        
        console.log(`────────────────────────────────────────`);
    }
    
    /**
     * Generate comprehensive summary (without accuracy)
     */
    generateSummary() {
        if (!this.results) return 'No results available';
        
        const { totalCheck, totalManifest, found, missing, mismatches } = this.results;
        const matches = found - mismatches.length;
        
        return {
            totalCheck,
            totalManifest, 
            found,
            missing: missing.length,
            mismatches: mismatches.length,
            matches,
            missingList: missing,
            mismatchList: mismatches,
            debug: `CHECK IDs w/ temp = ${totalCheck}, MANIFEST IDs w/ temp = ${totalManifest}`
        };
    }

    /**
     * Universal sheet analysis with adaptive format detection
     */
    analyzeSheetUniversal(rows, sheetName) {
        const maxCols = Math.max(...rows.map(row => row ? row.length : 0));
        const scanRows = Math.min(rows.length, 200);
        
        // Multi-pass analysis for maximum compatibility
        const headerAnalysis = this.analyzeHeaders(rows[0] || [], maxCols);
        const dataAnalysis = this.analyzeDataPatterns(rows, maxCols, scanRows);
        const structureAnalysis = this.analyzeDataStructure(rows, scanRows);
        
        // Combine analyses with confidence scoring
        const containerCol = this.selectBestContainerColumn(dataAnalysis.containerCols, headerAnalysis);
        const tempCol = this.selectBestTempColumn(dataAnalysis.tempCols, headerAnalysis);
        
        const confidence = this.calculateSheetConfidence(containerCol, tempCol, dataAnalysis, structureAnalysis);
        
        const isValid = containerCol.col !== -1 && tempCol.col !== -1 && confidence > 0.3;
        
        if (isValid) {
            console.log(`   🎯 Sheet analysis: Container col ${containerCol.col} (${containerCol.count} IDs), Temp col ${tempCol.col} (${tempCol.count} temps)`);
            console.log(`   📊 Confidence: ${confidence.toFixed(2)} (${this.getConfidenceLevel(confidence)})`);
        }
        
        return {
            isValid,
            containerCount: containerCol.count,
            tempCount: tempCol.count,
            containerCol: containerCol.col,
            tempCol: tempCol.col,
            confidence: confidence,
            reason: isValid ? 'Valid container data detected' : this.getDiagnosticReason(containerCol, tempCol, confidence),
            headerAnalysis,
            dataAnalysis,
            structureAnalysis
        };
    }
    
    /**
     * Extract containers from a single sheet
     */
    extractFromSheet(rows, sheetName, containerCol, tempCol) {
        const map = {};
        let extracted = 0;
        let skipped = 0;
        
        if (containerCol === -1 || tempCol === -1) {
            console.log(`   ⚠️ ${sheetName}: Missing columns (container=${containerCol}, temp=${tempCol})`);
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
            
            // Get temperature
            const cellTemp = row[tempCol];
            const temp = this.detectTempNumber(cellTemp);
            if (temp === null) {
                // Debug: show what we're skipping
                if (skipped < 3) {
                    console.log(`      Debug: Row ${r}, Container ${id}, TempCell="${cellTemp}" -> no temp detected`);
                }
                skipped++;
                continue;
            }
            
            // Add to map (avoid duplicates)
            if (!(id in map)) {
                map[id] = temp;
                extracted++;
                
                // Debug: show first few extractions
                if (extracted <= 3) {
                    console.log(`      Debug: Row ${r}, Container ${id}, Temp=${temp}°C`);
                }
            }
        }
        
        console.log(`   ✅ ${sheetName}: ${extracted} containers extracted (${skipped} skipped)`);
        return map;
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
     * Universal temperature detection with context awareness
     */
    detectTempNumber(cell) {
        if (cell === undefined || cell === null) return null;
        let s = cell.toString().trim();
        
        // Handle various temperature formats with context
        const tempPatterns = [
            /(-?\d*\.?\d+)\s*[°]?\s*C/i,     // -21.5°C, -21.5 C
            /(-?\d*\.?\d+)\s*deg/i,          // -21.5deg, -21.5 deg
            /temp[^\d]*(-?\d*\.?\d+)/i,      // temp: -21.5
            /(-?\d*\.?\d+)\s*celsius/i       // -21.5 celsius
        ];
        
        // Try pattern matching first
        for (const pattern of tempPatterns) {
            const match = s.match(pattern);
            if (match) {
                const n = parseFloat(match[1]);
                if (!isNaN(n) && n >= -50 && n <= 60) {
                    return n;
                }
            }
        }
        
        // Fallback to numeric extraction with validation
        const numMatch = s.match(/[-+]?\d*\.?\d+/);
        if (numMatch) {
            const n = parseFloat(numMatch[0]);
            if (!isNaN(n) && n >= -50 && n <= 60) {
                const upperS = s.toUpperCase();
                
                // Context-based validation
                if (upperS.includes('C') || upperS.includes('°') || upperS.includes('DEG')) {
                    return n;
                }
                
                // Realistic reefer range gets higher confidence
                if (n >= -30 && n <= 25) {
                    return n;
                }
                
                // Edge case: zero with temperature context
                if (n === 0 && (upperS.includes('TEMP') || /\b0\s*C\b/i.test(s))) {
                    return n;
                }
                
                // Very specific reefer temperatures (common setpoints)
                if ([-18, -20, -25, 0, 2, 4].includes(n)) {
                    return n;
                }
            }
        }
        
        return null;
    }

    /**
     * Prepare comprehensive data for Excel download
     */
    prepareDownloadData() {
        if (!this.results || !this.results.mismatches || this.results.mismatches.length === 0) {
            return null;
        }

        const rows = [["Container ID", "Set Temp (°C)", "Manifest Temp (°C)", "Difference (°C)", "Status", "Route"]];
        this.results.mismatches.forEach(m => {
            const status = Math.abs(m.diff) > 1.0 ? 'CRITICAL' : 'WARNING';
            const route = m.route || 'Unknown';
            rows.push([
                m.id, 
                m.setT.toFixed(1), 
                m.manT.toFixed(1), 
                m.diff.toFixed(2),
                status,
                route
            ]);
        });

        return {
            filename: `reefer_temperature_mismatches_${new Date().toISOString().split('T')[0]}.xlsx`,
            data: rows,
            summary: this.generateSummary()
        };
    }

    // ========= NEW HELPER METHODS FOR UNIVERSAL ANALYSIS =========
    
    /**
     * Analyze headers for temperature and container columns
     */
    analyzeHeaders(headerRow, maxCols) {
        const tempHeaders = [];
        const containerHeaders = [];
        
        for (let col = 0; col < maxCols; col++) {
            const header = headerRow[col];
            if (!header) continue;
            
            const headerStr = header.toString().toLowerCase();
            
            // Temperature header patterns
            const tempPatterns = [
                /temp/i, /°/i, /deg/i, /celsius/i, /centigrade/i,
                /set.*temp/i, /manifest.*temp/i, /actual.*temp/i
            ];
            
            if (tempPatterns.some(p => p.test(headerStr))) {
                tempHeaders.push({ col, header: headerStr, confidence: this.getTempHeaderConfidence(headerStr) });
            }
            
            // Container header patterns
            const containerPatterns = [
                /container/i, /cntr/i, /box/i, /id/i, /number/i, /ref/i
            ];
            
            if (containerPatterns.some(p => p.test(headerStr))) {
                containerHeaders.push({ col, header: headerStr, confidence: this.getContainerHeaderConfidence(headerStr) });
            }
        }
        
        return { tempHeaders, containerHeaders };
    }
    
    /**
     * Analyze data patterns in all columns
     */
    analyzeDataPatterns(rows, maxCols, scanRows) {
        const containerCols = [];
        const tempCols = [];
        
        for (let col = 0; col < maxCols; col++) {
            let containerCount = 0;
            let tempCount = 0;
            let tempScore = 0;
            let realTempCount = 0;
            
            for (let row = 1; row < scanRows; row++) {
                const cell = rows[row] && rows[row][col];
                if (!cell) continue;
                
                // Container ID detection
                if (this.detectContainerId(cell)) {
                    containerCount++;
                }
                
                // Temperature detection with scoring
                const temp = this.detectTempNumber(cell);
                if (temp !== null) {
                    tempCount++;
                    if (temp !== 0 && temp !== 1) realTempCount++;
                    
                    const cellStr = cell.toString();
                    if (temp >= -30 && temp <= 25) tempScore += 2;
                    if (cellStr.includes('C') || cellStr.includes('°')) tempScore += 3;
                    if (temp < 0) tempScore += 1;
                }
            }
            
            if (containerCount > 0) {
                containerCols.push({ col, count: containerCount, confidence: containerCount / (scanRows - 1) });
            }
            
            if (tempCount > 0) {
                tempCols.push({ 
                    col, 
                    count: tempCount, 
                    realCount: realTempCount,
                    score: tempScore,
                    confidence: (tempScore + realTempCount) / (scanRows - 1)
                });
            }
        }
        
        return { containerCols, tempCols };
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
     * Select best temperature column with priority logic
     */
    selectBestTempColumn(tempCols, headerAnalysis) {
        if (tempCols.length === 0) {
            return { col: -1, count: 0, confidence: 0 };
        }
        
        // Boost confidence for header matches
        tempCols.forEach(col => {
            const headerMatch = headerAnalysis.tempHeaders.find(h => h.col === col.col);
            if (headerMatch) {
                col.confidence += headerMatch.confidence * 2; // Temperature headers are very important
            }
        });
        
        // Sort by confidence, score, and real temperature count
        tempCols.sort((a, b) => {
            if (Math.abs(a.confidence - b.confidence) < 0.2) {
                if (Math.abs(a.score - b.score) < 5) {
                    return b.realCount - a.realCount;
                }
                return b.score - a.score;
            }
            return b.confidence - a.confidence;
        });
        
        return tempCols[0];
    }
    
    /**
     * Calculate sheet confidence score
     */
    calculateSheetConfidence(containerCol, tempCol, dataAnalysis, structureAnalysis) {
        let confidence = 0;
        
        // Container column confidence
        if (containerCol.col !== -1) {
            confidence += Math.min(containerCol.confidence * 0.4, 0.4);
        }
        
        // Temperature column confidence
        if (tempCol.col !== -1) {
            confidence += Math.min(tempCol.confidence * 0.4, 0.4);
        }
        
        // Structure bonus
        if (structureAnalysis.hasHeaders) confidence += 0.1;
        if (structureAnalysis.validRows > 10) confidence += 0.1;
        
        return Math.min(confidence, 1.0);
    }
    
    /**
     * Check if sheet should be skipped
     */
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
    
    /**
     * Get reason for skipping sheet
     */
    getSkipReason(sheetName, rows) {
        if (rows.length < 3) return `too few rows (${rows.length})`;
        if (/summary|total|overview/i.test(sheetName)) return 'summary sheet';
        if (/\(\d+\)/.test(sheetName)) return 'summary indicator';
        return 'filtered out';
    }
    
    /**
     * Validate individual file analysis
     */
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
        
        if (recs.columnMappings.setTemp === undefined && recs.columnMappings.actualTemp === undefined) {
            issues.push(`${fileType}: No temperature column detected`);
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
    
    /**
     * Perform cross-validation between files
     */
    performCrossValidation(checkAnalysis, manifestAnalysis, warnings) {
        const checkSheets = checkAnalysis.validSheets || [];
        const manifestSheets = manifestAnalysis.validSheets || [];
        
        const checkContainers = checkSheets.reduce((sum, s) => sum + s.containerCount, 0);
        const manifestContainers = manifestSheets.reduce((sum, s) => sum + s.containerCount, 0);
        
        // Warn about significant size differences
        if (checkContainers > 0 && manifestContainers > 0) {
            const ratio = Math.max(checkContainers, manifestContainers) / Math.min(checkContainers, manifestContainers);
            if (ratio > 3) {
                warnings.push(`Large container count difference: CHECK=${checkContainers}, MANIFEST=${manifestContainers}`);
            }
        }
        
        // Warn about confidence mismatches
        const checkConf = checkAnalysis.processingRecommendations?.confidence || 0;
        const manifestConf = manifestAnalysis.processingRecommendations?.confidence || 0;
        
        if (Math.abs(checkConf - manifestConf) > 0.3) {
            warnings.push(`Detection confidence mismatch: CHECK=${checkConf.toFixed(2)}, MANIFEST=${manifestConf.toFixed(2)}`);
        }
    }
    
    /**
     * Select best sheet based on file type and confidence
     */
    selectBestSheet(validSheets, fileType) {
        if (validSheets.length === 0) {
            throw new Error('No valid sheets available');
        }
        
        // For CHECK files, prefer highest container count
        // For MANIFEST files, prefer highest confidence
        if (fileType === 'check') {
            return validSheets.reduce((best, current) => 
                current.containerCount > best.containerCount ? current : best
            );
        } else {
            return validSheets.reduce((best, current) => 
                current.confidence > best.confidence ? current : best
            );
        }
    }
    
    /**
     * Validate sheet data with detailed feedback
     */
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
    
    /**
     * Generate comprehensive error message
     */
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
    
    /**
     * Calculate overall processing confidence
     */
    calculateOverallConfidence(checkAnalysis, manifestAnalysis) {
        const checkConf = checkAnalysis.processingRecommendations?.confidence || 0;
        const manifestConf = manifestAnalysis.processingRecommendations?.confidence || 0;
        return (checkConf + manifestConf) / 2;
    }
    
    /**
     * Get confidence level description
     */
    getConfidenceLevel(confidence) {
        if (confidence >= 0.8) return 'High';
        if (confidence >= 0.6) return 'Good';
        if (confidence >= 0.4) return 'Fair';
        return 'Low';
    }
    
    /**
     * Get diagnostic reason for invalid sheet
     */
    getDiagnosticReason(containerCol, tempCol, confidence) {
        if (containerCol.col === -1) return 'No container IDs detected';
        if (tempCol.col === -1) return 'No temperature data detected';
        if (confidence <= 0.3) return `Low confidence (${confidence.toFixed(2)})`;
        return 'Unknown validation issue';
    }
    
    /**
     * Get temperature header confidence score
     */
    getTempHeaderConfidence(headerStr) {
        let confidence = 0.5;
        if (/temperature/i.test(headerStr)) confidence += 0.3;
        if (/°|deg/i.test(headerStr)) confidence += 0.2;
        if (/set|actual|manifest/i.test(headerStr)) confidence += 0.1;
        return Math.min(confidence, 1.0);
    }
    
    /**
     * Get container header confidence score
     */
    getContainerHeaderConfidence(headerStr) {
        let confidence = 0.5;
        if (/container/i.test(headerStr)) confidence += 0.3;
        if (/id|number/i.test(headerStr)) confidence += 0.2;
        if (/cntr|box/i.test(headerStr)) confidence += 0.1;
        return Math.min(confidence, 1.0);
    }
}

module.exports = ReeferChecker;