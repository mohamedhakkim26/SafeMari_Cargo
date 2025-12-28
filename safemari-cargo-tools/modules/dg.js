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
     * Universal document analysis entry point (like Reefer checker)
     */
    async analyzeDocumentStructure(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        console.log(`\n🔍 ANALYZING DG DOCUMENT: ${path.basename(filePath)}`);
        
        if (ext === '.pdf') {
            return await this.analyzePDFStructure(filePath);
        } else if (ext === '.docx' || ext === '.doc') {
            return await this.analyzeDOCXStructure(filePath);
        } else {
            return await this.analyzeExcelStructure(filePath);
        }
    }

    /**
     * Process DG manifest checking with universal analysis
     */
    async processDGCheck(options) {
        try {
            const { manifestPath, stowagePath } = options;

            console.log('\n🚢 DG MANIFEST VALIDATION STARTED');
            console.log(`   Manifest: ${path.basename(manifestPath)}`);
            console.log(`   Stowage: ${path.basename(stowagePath)}`);

            // Universal document analysis
            const manifestAnalysis = await this.analyzeDocumentStructure(manifestPath);
            const stowageAnalysis = await this.analyzeDocumentStructure(stowagePath);

            if (!manifestAnalysis.success || !stowageAnalysis.success) {
                throw new Error('Document analysis failed');
            }

            this.manifestData = manifestAnalysis.data;
            this.stowageData = stowageAnalysis.data;

            // Validation with processing validation
            this.results = this.validateDGData();
            const validation = this.validateProcessing();

            return {
                success: true,
                results: this.results,
                summary: this.generateSummary(),
                validation: validation,
                confidence: this.calculateOverallConfidence(manifestAnalysis, stowageAnalysis)
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
     * Analyze PDF structure for DG data
     */
    async analyzePDFStructure(filePath) {
        try {
            const pdfBuffer = fs.readFileSync(filePath);
            const pdfData = await pdfParse(pdfBuffer);
            const dgItems = this.extractDGFromText(pdfData.text, 'manifest');
            
            return {
                success: true,
                data: dgItems,
                confidence: this.calculateTextConfidence(pdfData.text, dgItems.length),
                format: 'PDF',
                pages: pdfData.numpages
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Analyze DOCX structure for DG data
     */
    async analyzeDOCXStructure(filePath) {
        try {
            const dataBuffer = fs.readFileSync(filePath);
            const result = await mammoth.convertToHtml({ buffer: dataBuffer });
            const text = result.value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
            const dgItems = this.extractDGFromText(text, 'manifest');
            
            return {
                success: true,
                data: dgItems,
                confidence: this.calculateTextConfidence(text, dgItems.length),
                format: 'DOCX'
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Enhanced tabular DG data parsing
     */
    parseTabularDGLine(parts) {
        const dgItem = {};
        
        for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            
            // Container ID - multiple patterns
            if (!dgItem.containerId) {
                const containerId = this.findContainerInLine(trimmed);
                if (containerId) {
                    dgItem.containerId = containerId;
                    continue;
                }
            }
            
            // UN Number - enhanced patterns
            if (!dgItem.unNumber) {
                const unPatterns = [
                    /^UN(\d{4})$/i,
                    /^(\d{4})$/,
                    /UN\s*(\d{4})/i
                ];
                
                for (const pattern of unPatterns) {
                    const match = trimmed.match(pattern);
                    if (match) {
                        const num = match[1] || match[0].replace(/\D/g, '');
                        if (/^\d{4}$/.test(num)) {
                            dgItem.unNumber = num;
                            break;
                        }
                    }
                }
            }
            
            // Class - enhanced detection
            if (!dgItem.class) {
                const classMatch = trimmed.match(/^(\d+(?:\.\d+)?)$/);
                if (classMatch) {
                    const num = parseFloat(classMatch[1]);
                    if (num >= 1 && num <= 9) {
                        dgItem.class = classMatch[1];
                        continue;
                    }
                }
            }
            
            // Weight
            if (!dgItem.weight && /^\d+(?:\.\d+)?\s*(?:KG|MT|T)$/i.test(trimmed)) {
                dgItem.weight = parseFloat(trimmed.replace(/[^\d.]/g, ''));
                continue;
            }
            
            // Flashpoint
            if (!dgItem.flashpoint && /^-?\d+(?:\.\d+)?$/.test(trimmed)) {
                const num = parseFloat(trimmed);
                if (num >= -50 && num <= 200) {
                    dgItem.flashpoint = num;
                    continue;
                }
            }
            
            // PSN - last resort
            if (!dgItem.psn && trimmed.length > 3 && !/^\d+$/.test(trimmed)) {
                dgItem.psn = trimmed;
            }
        }
        
        return dgItem;
    }

    /**
     * Enhanced Excel structure analysis with error handling
     */
    async analyzeExcelStructure(filePath) {
        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(filePath);
            
            const sheets = {};
            const sheetAnalysis = [];
            let totalSheets = 0;
            
            workbook.eachSheet((worksheet) => {
                try {
                    totalSheets++;
                    const rows = [];
                    
                    worksheet.eachRow((row, rowNumber) => {
                        const rowData = [];
                        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                            rowData[colNumber - 1] = cell.value;
                        });
                        rows.push(rowData);
                    });
                    
                    if (rows.length > 1) {
                        sheets[worksheet.name] = rows;
                        
                        // Analyze each sheet with error handling
                        try {
                            const analysis = this.analyzeSheetUniversal(rows, worksheet.name);
                            if (analysis.isValid) {
                                sheetAnalysis.push({
                                    name: worksheet.name,
                                    analysis: analysis,
                                    rows: rows.length
                                });
                            }
                        } catch (sheetError) {
                            console.warn(`Sheet analysis failed for ${worksheet.name}:`, sheetError.message);
                        }
                    }
                } catch (worksheetError) {
                    console.warn(`Worksheet processing failed for ${worksheet.name}:`, worksheetError.message);
                }
            });
            
            console.log(`   📋 Analyzed ${totalSheets} sheets, ${sheetAnalysis.length} valid`);
            
            // Select best sheet with fallback
            const bestSheet = this.selectBestDGSheet(sheetAnalysis);
            if (!bestSheet) {
                // Try fallback analysis for any sheet with data
                const fallbackSheet = this.findFallbackDGSheet(sheets);
                if (fallbackSheet) {
                    console.log(`   ⚠️ Using fallback sheet: ${fallbackSheet.name}`);
                    return {
                        success: true,
                        data: fallbackSheet.data,
                        confidence: 0.3,
                        format: 'Excel',
                        selectedSheet: fallbackSheet.name,
                        totalSheets: totalSheets,
                        fallback: true
                    };
                }
                return { success: false, error: 'No valid DG sheets found' };
            }
            
            const dgItems = this.extractDGDataFromSheet(sheets[bestSheet.name], bestSheet.analysis, bestSheet.name);
            
            return {
                success: true,
                data: dgItems,
                confidence: bestSheet.analysis.confidence,
                format: 'Excel',
                selectedSheet: bestSheet.name,
                totalSheets: totalSheets
            };
        } catch (error) {
            console.error('Excel analysis failed:', error.message);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Find fallback DG sheet when universal analysis fails
     */
    findFallbackDGSheet(sheets) {
        for (const [sheetName, rows] of Object.entries(sheets)) {
            if (rows.length < 2) continue;
            
            // Look for any container IDs in the sheet
            let containerCount = 0;
            for (let r = 0; r < Math.min(rows.length, 50); r++) {
                const row = rows[r] || [];
                for (let c = 0; c < row.length; c++) {
                    const cell = row[c];
                    if (cell && this.findContainerInLine(cell.toString())) {
                        containerCount++;
                    }
                }
            }
            
            if (containerCount >= 3) {
                // Extract basic data without column analysis
                const data = this.extractDGFallback(rows, sheetName);
                if (data.length > 0) {
                    return { name: sheetName, data };
                }
            }
        }
        return null;
    }
    
    /**
     * Fallback DG extraction without column analysis
     */
    extractDGFallback(rows, sheetName) {
        const dgItems = [];
        
        for (let r = 1; r < rows.length; r++) {
            const row = rows[r] || [];
            let containerId = null;
            let unNumber = null;
            let dgClass = null;
            
            // Scan all columns for DG data
            for (let c = 0; c < row.length; c++) {
                const cell = row[c];
                if (!cell) continue;
                
                const cellStr = cell.toString().trim();
                
                if (!containerId) {
                    containerId = this.findContainerInLine(cellStr);
                }
                if (!unNumber) {
                    unNumber = this.detectUNNumber(cellStr);
                }
                if (!dgClass) {
                    dgClass = this.detectDGClass(cellStr);
                }
            }
            
            if (containerId) {
                dgItems.push({
                    containerId,
                    unNumber,
                    class: dgClass,
                    sourceSheet: sheetName,
                    sourceRow: r + 1,
                    fallback: true
                });
            }
        }
        
        return dgItems;
    }

    /**
     * Select best DG sheet with enhanced logic
     */
    selectBestDGSheet(sheetAnalysis) {
        if (sheetAnalysis.length === 0) return null;
        
        // Sort by confidence, then by container count
        sheetAnalysis.sort((a, b) => {
            if (Math.abs(a.analysis.confidence - b.analysis.confidence) < 0.1) {
                return b.analysis.containerCount - a.analysis.containerCount;
            }
            return b.analysis.confidence - a.analysis.confidence;
        });
        
        const best = sheetAnalysis[0];
        console.log(`   📋 Selected sheet: ${best.name} (confidence: ${(best.analysis.confidence * 100).toFixed(1)}%)`);
        
        return best;
    }

    /**
     * Enhanced PDF text extraction for DG data
     */
    extractDGFromText(text, fileType) {
        const dgItems = [];
        const lines = text.split('\n');
        
        console.log(`\n📄 EXTRACTING DG from ${fileType.toUpperCase()}:`);
        console.log(`   Text length: ${text.length} chars, Lines: ${lines.length}`);

        // Multi-pattern DG extraction
        const extractedItems = this.extractDGMultiPattern(text, lines);
        
        console.log(`   ✅ Extracted: ${extractedItems.length} DG items`);
        extractedItems.forEach((item, i) => {
            if (i < 3) {
                console.log(`      ${i+1}: ${item.containerId}, UN=${item.unNumber || 'N/A'}, Class=${item.class || 'N/A'}`);
            }
        });
        
        return extractedItems;
    }
    
    /**
     * Multi-pattern DG extraction with enhanced parsing
     */
    extractDGMultiPattern(text, lines) {
        const dgItems = [];
        
        // Method 1: Line-by-line contextual parsing
        const lineItems = this.extractDGFromLines(lines);
        dgItems.push(...lineItems);
        
        // Method 2: Tabular data extraction
        const tabularItems = this.extractDGFromTabular(text);
        dgItems.push(...tabularItems);
        
        // Method 3: Block-based extraction
        const blockItems = this.extractDGFromBlocks(text);
        dgItems.push(...blockItems);
        
        // Deduplicate and merge
        return this.mergeDGItems(dgItems);
    }
    
    /**
     * Enhanced line-by-line DG extraction with detailed logging
     */
    extractDGFromLines(lines) {
        const dgItems = [];
        let currentContainer = null;
        let currentDG = {};
        
        console.log(`\n🔍 DETAILED LINE-BY-LINE ANALYSIS:`);
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Enhanced container detection
            const containerMatch = this.findContainerInLine(line);
            if (containerMatch) {
                // Save previous item
                if (currentContainer && Object.keys(currentDG).length > 0) {
                    console.log(`\n✅ COMPLETED CONTAINER: ${currentContainer}`);
                    console.log(`   UN: ${currentDG.unNumber || 'N/A'}, Class: ${currentDG.class || 'N/A'}, PSN: ${currentDG.psn || 'N/A'}`);
                    dgItems.push({ containerId: currentContainer, ...currentDG });
                }
                
                currentContainer = containerMatch;
                currentDG = {};
                console.log(`\n📦 NEW CONTAINER FOUND: ${currentContainer} (line ${i+1})`);
                console.log(`   Line content: "${line.substring(0, 200)}..."`);
                
                // Look for DG data in same line
                this.extractDGDataFromLine(line, currentDG);
                
                // Enhanced look-ahead with context preservation
                console.log(`   🔍 Looking ahead for DG data...`);
                for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
                    const nextLine = lines[j].trim();
                    if (nextLine && !this.findContainerInLine(nextLine)) {
                        console.log(`   🔎 Checking line ${j+1}: "${nextLine.substring(0, 100)}..."`);
                        this.extractDGDataFromLine(nextLine, currentDG);
                        
                        // Special handling for tabular data
                        if (nextLine.includes('\t') || /\s{3,}/.test(nextLine)) {
                            const parts = nextLine.split(/\s{2,}|\t/).map(p => p.trim()).filter(p => p);
                            console.log(`   📋 Tabular data found: [${parts.join(', ')}]`);
                            this.extractDGFromParts(parts, currentDG);
                        }
                    } else if (this.findContainerInLine(nextLine)) {
                        console.log(`   🚫 Stopping look-ahead - next container found at line ${j+1}`);
                        break;
                    }
                }
                continue;
            }
            
            // Extract DG data for current container
            if (currentContainer) {
                // Only log significant lines (with potential DG data)
                if (/(?:un|class|dg|hazard|imdg|dangerous)/i.test(line)) {
                    console.log(`   🔍 Processing DG line ${i+1}: "${line.substring(0, 150)}..."`);
                    this.extractDGDataFromLine(line, currentDG);
                }
                
                // Enhanced tabular parsing
                if (line.includes('\t') || /\s{3,}/.test(line)) {
                    const parts = line.split(/\s{2,}|\t/).map(p => p.trim()).filter(p => p);
                    if (parts.length > 2) {
                        console.log(`   📋 Processing tabular line: [${parts.join(', ')}]`);
                        this.extractDGFromParts(parts, currentDG);
                    }
                }
            }
        }
        
        // Don't forget last item
        if (currentContainer && Object.keys(currentDG).length > 0) {
            console.log(`\n✅ FINAL CONTAINER: ${currentContainer}`);
            console.log(`   UN: ${currentDG.unNumber || 'N/A'}, Class: ${currentDG.class || 'N/A'}, PSN: ${currentDG.psn || 'N/A'}`);
            dgItems.push({ containerId: currentContainer, ...currentDG });
        }
        
        console.log(`\n📊 LINE-BY-LINE EXTRACTION COMPLETE: ${dgItems.length} items found`);
        return dgItems;
    }
    
    /**
     * Extract DG data from parsed parts
     */
    extractDGFromParts(parts, dgData) {
        for (const part of parts) {
            if (!part) continue;
            
            // UN Number
            if (!dgData.unNumber) {
                const unMatch = part.match(/^(?:UN)?(\d{4})$/i);
                if (unMatch) {
                    dgData.unNumber = unMatch[1];
                    continue;
                }
            }
            
            // Class - enhanced detection
            if (!dgData.class) {
                const classMatch = part.match(/^(\d+(?:\.\d+)?)$/);
                if (classMatch) {
                    const num = parseFloat(classMatch[1]);
                    if (num >= 1 && num <= 9) {
                        dgData.class = classMatch[1];
                        continue;
                    }
                }
            }
            
            // PSN
            if (!dgData.psn && part.length > 3 && !/^\d+$/.test(part) && !/^UN\d{4}$/i.test(part)) {
                dgData.psn = part;
            }
        }
    }
    
    /**
     * Find container ID in line with multiple patterns
     */
    findContainerInLine(line) {
        const patterns = [
            /\b([A-Z]{4}\d{7})\b/g,           // MEDU9780739
            /\b([A-Z]{4}\d{6})\b/g,           // MEDU978073
            /\b([A-Z]{3}[UJZ]\d{7})\b/g,      // MSCU9780739
            /\b([A-Z]{4}\s*\d{6,7})\b/g       // MEDU 9780739
        ];
        
        for (const pattern of patterns) {
            const matches = [...line.matchAll(pattern)];
            if (matches.length > 0) {
                return matches[0][1].replace(/\s/g, '');
            }
        }
        return null;
    }
    
    /**
     * Extract DG data from single line with detailed logging
     */
    extractDGDataFromLine(line, dgData) {
        const originalLine = line;
        
        // UN Number patterns
        if (!dgData.unNumber) {
            const unPatterns = [
                /UN\s*(\d{4})/gi,
                /\bUN(\d{4})\b/gi,
                /UNDG\s*(\d{4})/gi,
                /\b(\d{4})\s*(?:UN|UNDG)/gi
            ];
            
            for (const pattern of unPatterns) {
                const match = line.match(pattern);
                if (match) {
                    dgData.unNumber = match[1] || match[0].replace(/\D/g, '');
                    console.log(`   🔍 UN found: "${dgData.unNumber}" from line: "${originalLine.substring(0, 100)}..."`);
                    break;
                }
            }
        }
        
        // Class patterns - fixed with proper capture groups
        if (!dgData.class) {
            const classPatterns = [
                { pattern: /UN\d{4}[^\d]*CLASS\s+(\d+(?:\.\d+)?)/gi, name: 'UN+CLASS' },
                { pattern: /CLASS\s+(\d+(?:\.\d+)?)\s*\(/gi, name: 'CLASS+(' },
                { pattern: /\bCLASS\s+(\d+(?:\.\d+)?)\b/gi, name: 'CLASS' },
                { pattern: /IMDG\s*CLASS\s+(\d+(?:\.\d+)?)/gi, name: 'IMDG CLASS' },
                { pattern: /HAZARD\s*CLASS\s+(\d+(?:\.\d+)?)/gi, name: 'HAZARD CLASS' },
                { pattern: /DG\s*CLASS\s+(\d+(?:\.\d+)?)/gi, name: 'DG CLASS' },
                { pattern: /\b(\d)\s*(?:FLAMMABLE|CORROSIVE|TOXIC|EXPLOSIVE|MISCELLANEOUS)/gi, name: 'HAZARD TYPE' }
            ];
            
            console.log(`   🔍 Checking class in line: "${originalLine.substring(0, 150)}..."`);
            
            for (const { pattern, name } of classPatterns) {
                const match = line.match(pattern);
                if (match) {
                    let cls = match[1];
                    
                    console.log(`   📋 Pattern "${name}" matched: "${match[0]}" -> class candidate: "${cls}"`);
                    
                    if (cls && !isNaN(parseFloat(cls))) {
                        const num = parseFloat(cls);
                        if (num >= 1 && num <= 9) {
                            dgData.class = cls;
                            console.log(`   🎯 CLASS FOUND: "${cls}" using pattern "${name}"`);
                            break;
                        }
                    } else {
                        // Fallback: extract number directly from matched text
                        const fallbackMatch = match[0].match(/(\d+(?:\.\d+)?)/);
                        if (fallbackMatch) {
                            const fallbackCls = fallbackMatch[1];
                            const num = parseFloat(fallbackCls);
                            if (num >= 1 && num <= 9) {
                                dgData.class = fallbackCls;
                                console.log(`   🎯 CLASS FOUND (fallback): "${fallbackCls}" from "${match[0]}"`);
                                break;
                            }
                        }
                        console.log(`   ❌ No valid class extracted from: "${match[0]}"`);
                    }
                }
            }
            
            if (!dgData.class) {
                console.log(`   ⚠️ No class found in line`);
            }
        }
        
        // PSN patterns with logging
        if (!dgData.psn) {
            const psnPatterns = [
                /PSN[:\s]+(.*?)(?:\n|\s{3,}|$)/gi,
                /PROPER\s+SHIPPING\s+NAME[:\s]+(.*?)(?:\n|\s{3,}|$)/gi,
                /SHIPPING\s+NAME[:\s]+(.*?)(?:\n|\s{3,}|$)/gi
            ];
            
            for (const pattern of psnPatterns) {
                const match = line.match(pattern);
                if (match && match[1] && match[1].trim().length > 3) {
                    dgData.psn = match[1].trim();
                    console.log(`   📝 PSN found: "${dgData.psn}"`);
                    break;
                }
            }
        }
        
        // Flashpoint patterns
        if (!dgData.flashpoint) {
            const fpPatterns = [
                /(?:FP|FLASH\s*POINT)[:\s]*(-?\d+(?:\.\d+)?)\s*[°C]/gi,
                /FLASHPOINT[:\s]*(-?\d+(?:\.\d+)?)/gi,
                /FP[:\s]*(-?\d+(?:\.\d+)?)/gi
            ];
            
            for (const pattern of fpPatterns) {
                const match = line.match(pattern);
                if (match) {
                    dgData.flashpoint = parseFloat(match[1]);
                    console.log(`   🌡️ Flashpoint found: ${dgData.flashpoint}`);
                    break;
                }
            }
        }
    }

    /**
     * Enhanced tabular data extraction with better parsing
     */
    extractDGFromTabular(text) {
        const dgItems = [];
        const lines = text.split('\n');
        
        for (const line of lines) {
            if (line.includes('\t') || /\s{3,}/.test(line)) {
                const parts = line.split(/\s{2,}|\t/).map(p => p.trim()).filter(p => p);
                if (parts.length >= 2) {
                    const tabularDG = this.parseTabularDGLine(parts);
                    if (tabularDG.containerId) {
                        // Enhanced validation - ensure we have meaningful DG data
                        if (tabularDG.unNumber || tabularDG.class || tabularDG.psn) {
                            dgItems.push(tabularDG);
                        }
                    }
                }
            }
        }
        
        return dgItems;
    }
    
    /**
     * Enhanced block-based extraction with context analysis
     */
    extractDGFromBlocks(text) {
        const dgItems = [];
        
        // Split by container patterns and process blocks
        const containerBlocks = text.split(/(?=[A-Z]{4}\d{6,7})/);
        
        for (const block of containerBlocks) {
            if (block.trim().length < 10) continue;
            
            const containerId = this.findContainerInLine(block);
            if (containerId) {
                const dgData = {};
                
                // Extract from entire block
                this.extractDGDataFromLine(block, dgData);
                
                // Try line-by-line within block
                const blockLines = block.split('\n');
                for (const blockLine of blockLines) {
                    this.extractDGDataFromLine(blockLine.trim(), dgData);
                    
                    // Try tabular parsing within block
                    if (blockLine.includes('\t') || /\s{3,}/.test(blockLine)) {
                        const parts = blockLine.split(/\s{2,}|\t/).map(p => p.trim()).filter(p => p);
                        this.extractDGFromParts(parts, dgData);
                    }
                }
                
                if (Object.keys(dgData).length > 0) {
                    dgItems.push({ containerId, ...dgData });
                }
            }
        }
        
        return dgItems;
    }
    
    /**
     * Merge and deduplicate DG items
     */
    mergeDGItems(dgItems) {
        const merged = new Map();
        
        for (const item of dgItems) {
            if (!item.containerId) continue;
            
            const key = item.containerId;
            if (merged.has(key)) {
                // Merge data, preferring non-empty values
                const existing = merged.get(key);
                merged.set(key, {
                    containerId: key,
                    unNumber: item.unNumber || existing.unNumber,
                    class: item.class || existing.class,
                    psn: item.psn || existing.psn,
                    flashpoint: item.flashpoint || existing.flashpoint,
                    weight: item.weight || existing.weight
                });
            } else {
                merged.set(key, item);
            }
        }
        
        return Array.from(merged.values());
    }

    /**
     * Enhanced text confidence calculation
     */
    calculateTextConfidence(text, itemCount) {
        let confidence = 0;
        
        // DG-specific keywords with weights
        const dgKeywords = {
            'dangerous': 0.15,
            'hazard': 0.1,
            'imdg': 0.15,
            'class': 0.1,
            'un': 0.1,
            'flashpoint': 0.1,
            'psn': 0.1,
            'proper shipping name': 0.15,
            'undg': 0.1
        };
        
        const textLower = text.toLowerCase();
        for (const [keyword, weight] of Object.entries(dgKeywords)) {
            if (textLower.includes(keyword)) {
                confidence += weight;
            }
        }
        
        // Container ID patterns
        const containerMatches = (text.match(/[A-Z]{4}\d{6,7}/g) || []).length;
        confidence += Math.min(containerMatches / 20, 0.25);
        
        // UN number patterns
        const unMatches = (text.match(/UN\s*\d{4}/gi) || []).length;
        confidence += Math.min(unMatches / 15, 0.2);
        
        // Class patterns
        const classMatches = (text.match(/class\s*\d+/gi) || []).length;
        confidence += Math.min(classMatches / 15, 0.15);
        
        // Item count bonus
        if (itemCount > 0) {
            confidence += Math.min(itemCount / 50, 0.15);
        }
        
        return Math.min(confidence, 1.0);
    }
    
    /**
     * Enhanced processing validation system
     */
    validateProcessing() {
        const validation = {
            manifestValid: this.manifestData && this.manifestData.length > 0,
            stowageValid: this.stowageData && this.stowageData.length > 0,
            dataQuality: this.assessDGDataQuality(),
            recommendations: [],
            issues: []
        };
        
        // Manifest validation
        if (!validation.manifestValid) {
            validation.recommendations.push('Manifest data appears incomplete or invalid');
            validation.issues.push('No manifest containers found');
        } else {
            const manifestWithDG = this.manifestData.filter(item => item.unNumber || item.class).length;
            const dgCompleteness = manifestWithDG / this.manifestData.length;
            
            if (dgCompleteness < 0.5) {
                validation.recommendations.push('Manifest missing critical DG data (UN/Class)');
                validation.issues.push(`Only ${(dgCompleteness * 100).toFixed(0)}% of manifest containers have DG data`);
            }
        }
        
        // Stowage validation
        if (!validation.stowageValid) {
            validation.recommendations.push('Stowage data appears incomplete or invalid');
            validation.issues.push('No stowage containers found');
        } else {
            const stowageWithDG = this.stowageData.filter(item => item.unNumber || item.class).length;
            const dgCompleteness = stowageWithDG / this.stowageData.length;
            
            if (dgCompleteness < 0.5) {
                validation.recommendations.push('Stowage missing critical DG data (UN/Class)');
                validation.issues.push(`Only ${(dgCompleteness * 100).toFixed(0)}% of stowage containers have DG data`);
            }
        }
        
        // Data quality assessment
        if (validation.dataQuality.score < 0.7) {
            validation.recommendations.push('Data quality is below recommended threshold');
            validation.issues.push(...validation.dataQuality.issues);
        }
        
        // Document compatibility check
        if (validation.manifestValid && validation.stowageValid) {
            const commonContainers = this.findCommonContainers();
            if (commonContainers.length === 0) {
                validation.recommendations.push('Documents may be from different vessels/voyages');
                validation.issues.push('No common containers found between manifest and stowage');
            }
        }
        
        return validation;
    }
    
    /**
     * Find common containers between manifest and stowage
     */
    findCommonContainers() {
        if (!this.manifestData || !this.stowageData) return [];
        
        const manifestIds = new Set(this.manifestData.map(item => item.containerId).filter(id => id));
        const stowageIds = new Set(this.stowageData.map(item => item.containerId).filter(id => id));
        
        return [...manifestIds].filter(id => stowageIds.has(id));
    }
    
    /**
     * Enhanced DG data quality assessment
     */
    assessDGDataQuality() {
        let score = 0;
        let issues = [];
        
        // Manifest data quality
        if (this.manifestData && this.manifestData.length > 0) {
            const withUN = this.manifestData.filter(item => item.unNumber).length;
            const withClass = this.manifestData.filter(item => item.class).length;
            const withPSN = this.manifestData.filter(item => item.psn).length;
            
            const unCompleteness = withUN / this.manifestData.length;
            const classCompleteness = withClass / this.manifestData.length;
            const psnCompleteness = withPSN / this.manifestData.length;
            
            score += (unCompleteness * 0.3) + (classCompleteness * 0.3) + (psnCompleteness * 0.1);
            
            if (unCompleteness < 0.7) {
                issues.push(`Manifest missing UN numbers (${(unCompleteness * 100).toFixed(0)}% complete)`);
            }
            if (classCompleteness < 0.7) {
                issues.push(`Manifest missing DG classes (${(classCompleteness * 100).toFixed(0)}% complete)`);
            }
        } else {
            issues.push('No manifest data available');
        }
        
        // Stowage data quality
        if (this.stowageData && this.stowageData.length > 0) {
            const withUN = this.stowageData.filter(item => item.unNumber).length;
            const withClass = this.stowageData.filter(item => item.class).length;
            
            const unCompleteness = withUN / this.stowageData.length;
            const classCompleteness = withClass / this.stowageData.length;
            
            score += (unCompleteness * 0.15) + (classCompleteness * 0.15);
            
            if (unCompleteness < 0.7) {
                issues.push(`Stowage missing UN numbers (${(unCompleteness * 100).toFixed(0)}% complete)`);
            }
            if (classCompleteness < 0.7) {
                issues.push(`Stowage missing DG classes (${(classCompleteness * 100).toFixed(0)}% complete)`);
            }
        } else {
            issues.push('No stowage data available');
        }
        
        return { score: Math.min(score, 1.0), issues };
    }
    
    /**
     * Calculate overall confidence
     */
    calculateOverallConfidence(manifestAnalysis, stowageAnalysis) {
        return (manifestAnalysis.confidence + stowageAnalysis.confidence) / 2;
    }

    /**
     * Enhanced DG extraction with intelligent format detection
     */
    extractDGFromExcel(data, sheetName = 'Unknown') {
        if (!data || data.length === 0) {
            return [];
        }

        console.log(`\n📊 ANALYZING SHEET: ${sheetName}`);
        console.log(`   Rows: ${data.length}, Max Columns: ${Math.max(...data.map(row => row ? row.length : 0))}`);

        // Multi-pass universal analysis
        const analysis = this.analyzeSheetUniversal(data, sheetName);
        
        if (!analysis.isValid) {
            console.log(`   ❌ Sheet invalid: ${analysis.reason}`);
            return [];
        }

        console.log(`   ✅ Valid DG sheet detected:`);
        console.log(`      Container: Col ${analysis.containerCol} (${analysis.containerCount} IDs)`);
        console.log(`      UN Number: Col ${analysis.unCol} (${analysis.unCount} UNs)`);
        console.log(`      Class: Col ${analysis.classCol} (${analysis.classCount} classes)`);
        console.log(`      Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);

        // Extract with intelligent validation
        return this.extractDGDataFromSheet(data, analysis, sheetName);
    }

    /**
     * Universal sheet analysis (adapted from Reefer's approach)
     */
    analyzeSheetUniversal(rows, sheetName) {
        const maxCols = Math.max(...rows.map(row => row ? row.length : 0));
        const scanRows = Math.min(rows.length, 200);
        
        // Multi-pass analysis
        const headerAnalysis = this.analyzeDGHeaders(rows[0] || [], maxCols);
        const dataAnalysis = this.analyzeDGDataPatterns(rows, maxCols, scanRows);
        
        // Select best columns using confidence scoring
        const containerCol = this.selectBestDGColumn(dataAnalysis.containerCols, headerAnalysis.containerHeaders, 'container');
        const unCol = this.selectBestDGColumn(dataAnalysis.unCols, headerAnalysis.unHeaders, 'un');
        const classCol = this.selectBestDGColumn(dataAnalysis.classCols, headerAnalysis.classHeaders, 'class');
        
        const confidence = this.calculateDGSheetConfidence(containerCol, unCol, classCol, dataAnalysis);
        const isValid = containerCol.col !== -1 && confidence > 0.3;
        
        return {
            isValid,
            containerCount: containerCol.count,
            unCount: unCol.count,
            classCount: classCol.count,
            containerCol: containerCol.col,
            unCol: unCol.col,
            classCol: classCol.col,
            confidence: confidence,
            reason: isValid ? 'Valid DG data detected' : this.getDGDiagnosticReason(containerCol, unCol, classCol, confidence)
        };
    }

    /**
     * Analyze headers for DG-specific patterns
     */
    analyzeDGHeaders(headerRow, maxCols) {
        const containerHeaders = [];
        const unHeaders = [];
        const classHeaders = [];
        
        for (let col = 0; col < maxCols; col++) {
            const header = headerRow[col];
            if (!header) continue;
            
            const headerStr = header.toString().toLowerCase();
            
            // Container header patterns (more flexible)
            if (/cont|cntr|box|id|number/.test(headerStr)) {
                containerHeaders.push({ col, header: headerStr, confidence: this.getDGHeaderConfidence(headerStr, 'container') });
            }
            
            // UN number header patterns
            if (/un|undg|dangerous/.test(headerStr)) {
                unHeaders.push({ col, header: headerStr, confidence: this.getDGHeaderConfidence(headerStr, 'un') });
            }
            
            // Class header patterns
            if (/class|dg|hazard|imdg/.test(headerStr)) {
                classHeaders.push({ col, header: headerStr, confidence: this.getDGHeaderConfidence(headerStr, 'class') });
            }
        }
        
        return { containerHeaders, unHeaders, classHeaders };
    }

    /**
     * Analyze data patterns in all columns (like Reefer's approach)
     */
    analyzeDGDataPatterns(rows, maxCols, scanRows) {
        const containerCols = [];
        const unCols = [];
        const classCols = [];
        
        for (let col = 0; col < maxCols; col++) {
            let containerCount = 0;
            let unCount = 0;
            let classCount = 0;
            
            for (let row = 1; row < scanRows; row++) {
                const cell = rows[row] && rows[row][col];
                if (!cell) continue;
                
                const cellStr = cell.toString().trim();
                
                // Container ID detection
                if (this.detectDGContainerId(cellStr)) {
                    containerCount++;
                }
                
                // UN number detection
                if (this.detectUNNumber(cellStr)) {
                    unCount++;
                }
                
                // Class detection
                if (this.detectDGClass(cellStr)) {
                    classCount++;
                }
            }
            
            if (containerCount > 0) {
                containerCols.push({ col, count: containerCount, confidence: containerCount / (scanRows - 1) });
            }
            
            if (unCount > 0) {
                unCols.push({ col, count: unCount, confidence: unCount / (scanRows - 1) });
            }
            
            if (classCount > 0) {
                classCols.push({ col, count: classCount, confidence: classCount / (scanRows - 1) });
            }
        }
        
        return { containerCols, unCols, classCols };
    }

    /**
     * Select best DG column using confidence scoring
     */
    selectBestDGColumn(dataCols, headerCols, type) {
        if (dataCols.length === 0) {
            return { col: -1, count: 0, confidence: 0 };
        }
        
        // Boost confidence for header matches
        dataCols.forEach(col => {
            const headerMatch = headerCols.find(h => h.col === col.col);
            if (headerMatch) {
                col.confidence += headerMatch.confidence;
            }
        });
        
        // Sort by confidence, then by count
        dataCols.sort((a, b) => {
            if (Math.abs(a.confidence - b.confidence) < 0.1) {
                return b.count - a.count;
            }
            return b.confidence - a.confidence;
        });
        
        return dataCols[0];
    }

    /**
     * Extract DG data using detected columns
     */
    extractDGDataFromSheet(rows, analysis, sheetName) {
        const dgItems = [];
        let extracted = 0;
        let skipped = 0;
        
        console.log(`\n📤 EXTRACTING from ${sheetName}:`);
        console.log(`   Using columns - Container: ${analysis.containerCol}, UN: ${analysis.unCol}, Class: ${analysis.classCol}`);
        
        for (let r = 1; r < rows.length; r++) {
            const row = rows[r] || [];
            
            // Get container ID
            const rawId = row[analysis.containerCol];
            const containerId = this.detectDGContainerId(rawId);
            if (!containerId) {
                skipped++;
                continue;
            }
            
            // Get UN number
            const rawUN = analysis.unCol !== -1 ? row[analysis.unCol] : null;
            const unNumber = this.detectUNNumber(rawUN);
            
            // Get class
            const rawClass = analysis.classCol !== -1 ? row[analysis.classCol] : null;
            const dgClass = this.detectDGClass(rawClass);
            
            // Create DG item
            const dgItem = {
                containerId: containerId,
                unNumber: unNumber,
                class: dgClass,
                sourceSheet: sheetName,
                sourceRow: r + 1
            };
            
            dgItems.push(dgItem);
            extracted++;
            
            // Debug: show first few extractions
            if (extracted <= 3) {
                console.log(`      Row ${r}: ${containerId}, UN=${unNumber || 'N/A'}, Class=${dgClass || 'N/A'}`);
            }
        }
        
        console.log(`   ✅ Extracted: ${extracted} containers (${skipped} skipped)`);
        return dgItems;
    }

    /**
     * Detect container ID with flexible patterns
     */
    detectDGContainerId(cell) {
        if (!cell) return null;
        const s = cell.toString().trim().toUpperCase();
        
        // Standard container ID patterns
        const patterns = [
            /^[A-Z]{4}\d{7}$/,           // MEDU9780739
            /^[A-Z]{4}\d{6}$/,           // MEDU978073
            /^[A-Z]{3}[UJZ]\d{7}$/,      // MSCU9780739
            /^[A-Z]{4}\d{6,7}$/          // Flexible
        ];
        
        for (const pattern of patterns) {
            if (pattern.test(s)) return s;
        }
        
        return null;
    }

    /**
     * Detect UN number with flexible patterns
     */
    detectUNNumber(cell) {
        if (!cell) return null;
        const s = cell.toString().trim();
        
        // UN number patterns
        const patterns = [
            /^UN\s*(\d{4})$/i,           // UN1789
            /^(\d{4})$/,                 // 1789
            /UN\s*(\d{4})/i              // Text with UN1789
        ];
        
        for (const pattern of patterns) {
            const match = s.match(pattern);
            if (match) {
                const num = match[1] || match[0];
                if (/^\d{4}$/.test(num)) return num;
            }
        }
        
        return null;
    }

    /**
     * Detect DG class with flexible patterns
     */
    detectDGClass(cell) {
        if (!cell) return null;
        const s = cell.toString().trim();
        
        // Class patterns
        const patterns = [
            /^(\d+(?:\.\d+)?)$/,         // 8, 3.1
            /class\s*(\d+(?:\.\d+)?)/i,  // Class 8
            /^(\d)$/                     // Single digit
        ];
        
        for (const pattern of patterns) {
            const match = s.match(pattern);
            if (match) {
                const cls = match[1] || match[0];
                const num = parseFloat(cls);
                if (num >= 1 && num <= 9) return cls;
            }
        }
        
        return null;
    }

    /**
     * Calculate sheet confidence score
     */
    calculateDGSheetConfidence(containerCol, unCol, classCol, dataAnalysis) {
        let confidence = 0;
        
        // Container column confidence (required)
        if (containerCol.col !== -1) {
            confidence += Math.min(containerCol.confidence * 0.5, 0.5);
        }
        
        // UN column confidence
        if (unCol.col !== -1) {
            confidence += Math.min(unCol.confidence * 0.3, 0.3);
        }
        
        // Class column confidence
        if (classCol.col !== -1) {
            confidence += Math.min(classCol.confidence * 0.2, 0.2);
        }
        
        return Math.min(confidence, 1.0);
    }

    /**
     * Get DG header confidence score
     */
    getDGHeaderConfidence(headerStr, type) {
        let confidence = 0.3;
        
        if (type === 'container') {
            if (/container/i.test(headerStr)) confidence += 0.4;
            if (/cntr/i.test(headerStr)) confidence += 0.3;
            if (/id|number/i.test(headerStr)) confidence += 0.2;
        } else if (type === 'un') {
            if (/^un$/i.test(headerStr)) confidence += 0.5;
            if (/unno/i.test(headerStr)) confidence += 0.4;
            if (/undg/i.test(headerStr)) confidence += 0.3;
        } else if (type === 'class') {
            if (/^dg$/i.test(headerStr)) confidence += 0.4;
            if (/class/i.test(headerStr)) confidence += 0.5;
            if (/hazard/i.test(headerStr)) confidence += 0.3;
        }
        
        return Math.min(confidence, 1.0);
    }

    /**
     * Get diagnostic reason for invalid sheet
     */
    getDGDiagnosticReason(containerCol, unCol, classCol, confidence) {
        if (containerCol.col === -1) return 'No container IDs detected';
        if (confidence <= 0.3) return `Low confidence (${confidence.toFixed(2)})`;
        return 'Insufficient DG data detected';
    }

    /**
     * Enhanced DG data validation with intelligent matching
     */
    validateDGData() {
        const results = {
            manifestCount: this.manifestData.length,
            stowageCount: this.stowageData.length,
            missingInStowage: [],
            extraInStowage: [],
            unClassMismatches: [],
            matches: [],
            validationDetails: [],
            confidence: 0
        };

        console.log(`\n🔍 DG VALIDATION:`);
        console.log(`   Manifest containers: ${results.manifestCount}`);
        console.log(`   Stowage containers: ${results.stowageCount}`);

        // Intelligent lookup with fuzzy matching
        const manifestLookup = this.createIntelligentLookup(this.manifestData);
        const stowageLookup = this.createIntelligentLookup(this.stowageData);

        // Enhanced validation with confidence scoring
        manifestLookup.forEach((manifestItem, containerId) => {
            const stowageMatch = this.findBestStowageMatch(containerId, stowageLookup);
            
            if (!stowageMatch) {
                results.missingInStowage.push(manifestItem);
            } else {
                const validation = this.validateDGMatch(manifestItem, stowageMatch.item);
                
                if (validation.isMatch) {
                    results.matches.push({
                        containerId: containerId,
                        manifestData: manifestItem,
                        stowageData: stowageMatch.item,
                        confidence: stowageMatch.confidence
                    });
                } else {
                    results.unClassMismatches.push({
                        containerId: containerId,
                        manifestData: manifestItem,
                        stowageData: stowageMatch.item,
                        mismatches: validation.mismatches,
                        confidence: stowageMatch.confidence
                    });
                }
                
                results.validationDetails.push({
                    containerId: containerId,
                    status: validation.isMatch ? 'match' : 'mismatch',
                    manifestData: manifestItem,
                    stowageData: stowageMatch.item,
                    mismatches: validation.mismatches,
                    confidence: stowageMatch.confidence
                });
            }
        });

        // Find extra containers in stowage
        stowageLookup.forEach((stowageItem, containerId) => {
            if (!this.findBestManifestMatch(containerId, manifestLookup)) {
                results.extraInStowage.push(stowageItem);
            }
        });

        // Calculate overall confidence
        results.confidence = this.calculateValidationConfidence(results);

        console.log(`   ✅ Matches: ${results.matches.length}`);
        console.log(`   ⚠️ Mismatches: ${results.unClassMismatches.length}`);
        console.log(`   ❌ Missing in stowage: ${results.missingInStowage.length}`);
        console.log(`   ➕ Extra in stowage: ${results.extraInStowage.length}`);
        console.log(`   🎯 Overall confidence: ${(results.confidence * 100).toFixed(1)}%`);

        return results;
    }

    /**
     * Create intelligent lookup with fuzzy matching capabilities
     */
    createIntelligentLookup(data) {
        const lookup = new Map();
        const fuzzyLookup = new Map();
        
        data.forEach(item => {
            if (item.containerId) {
                const cleanId = this.normalizeContainerId(item.containerId);
                lookup.set(cleanId, item);
                
                // Create fuzzy variants for partial matches
                const variants = this.generateContainerVariants(cleanId);
                variants.forEach(variant => {
                    if (!fuzzyLookup.has(variant)) {
                        fuzzyLookup.set(variant, []);
                    }
                    fuzzyLookup.get(variant).push({ item, originalId: cleanId });
                });
            }
        });
        
        lookup.fuzzyLookup = fuzzyLookup;
        return lookup;
    }
    
    /**
     * Find best stowage match with confidence scoring
     */
    findBestStowageMatch(containerId, stowageLookup) {
        // Exact match first
        if (stowageLookup.has(containerId)) {
            return { item: stowageLookup.get(containerId), confidence: 1.0 };
        }
        
        // Fuzzy match
        const variants = this.generateContainerVariants(containerId);
        for (const variant of variants) {
            if (stowageLookup.fuzzyLookup.has(variant)) {
                const matches = stowageLookup.fuzzyLookup.get(variant);
                if (matches.length === 1) {
                    return { item: matches[0].item, confidence: 0.8 };
                }
            }
        }
        
        return null;
    }
    
    /**
     * Find best manifest match
     */
    findBestManifestMatch(containerId, manifestLookup) {
        return manifestLookup.has(containerId) || 
               this.generateContainerVariants(containerId).some(variant => 
                   manifestLookup.fuzzyLookup.has(variant)
               );
    }
    
    /**
     * Generate container ID variants for fuzzy matching
     */
    generateContainerVariants(containerId) {
        const variants = [containerId];
        
        // Remove check digit
        if (containerId.length === 11) {
            variants.push(containerId.substring(0, 10));
        }
        
        // Add common variations
        variants.push(containerId.replace(/[^A-Z0-9]/g, ''));
        
        return variants;
    }
    
    /**
     * Calculate validation confidence
     */
    calculateValidationConfidence(results) {
        if (results.manifestCount === 0) return 0;
        
        const matchRate = results.matches.length / results.manifestCount;
        const avgMatchConfidence = results.matches.length > 0 ? 
            results.matches.reduce((sum, match) => sum + (match.confidence || 1), 0) / results.matches.length : 0;
        
        return (matchRate * 0.7) + (avgMatchConfidence * 0.3);
    }

    /**
     * Enhanced DG data validation with intelligent matching
     */
    validateDGMatch(manifestItem, stowageItem) {
        const mismatches = [];
        let confidence = 1.0;

        // Intelligent UN number validation
        if (manifestItem.unNumber && stowageItem.unNumber) {
            const manifestUN = this.normalizeUNNumber(manifestItem.unNumber);
            const stowageUN = this.normalizeUNNumber(stowageItem.unNumber);
            
            if (manifestUN && stowageUN && manifestUN !== stowageUN) {
                mismatches.push({
                    field: 'UN Number',
                    manifest: manifestItem.unNumber,
                    stowage: stowageItem.unNumber,
                    severity: 'high'
                });
                confidence -= 0.4;
            }
        }

        // Intelligent class validation
        if (manifestItem.class && stowageItem.class) {
            const manifestClass = this.normalizeClass(manifestItem.class);
            const stowageClass = this.normalizeClass(stowageItem.class);
            
            if (manifestClass && stowageClass && manifestClass !== stowageClass) {
                mismatches.push({
                    field: 'Class',
                    manifest: manifestItem.class,
                    stowage: stowageItem.class,
                    severity: 'high'
                });
                confidence -= 0.3;
            }
        }

        // Intelligent PSN validation with fuzzy matching
        if (manifestItem.psn && stowageItem.psn) {
            const similarity = this.calculateStringSimilarity(manifestItem.psn, stowageItem.psn);
            if (similarity < 0.7) {
                mismatches.push({
                    field: 'PSN',
                    manifest: manifestItem.psn,
                    stowage: stowageItem.psn,
                    similarity: similarity.toFixed(2),
                    severity: similarity < 0.4 ? 'high' : 'medium'
                });
                confidence -= (1 - similarity) * 0.3;
            }
        }

        return {
            isMatch: mismatches.length === 0,
            mismatches: mismatches,
            confidence: Math.max(confidence, 0)
        };
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

    /**
     * Enhanced summary generation with confidence metrics
     */
    generateSummary() {
        if (!this.results) return null;

        const summary = {
            manifestContainers: this.results.manifestCount,
            stowageContainers: this.results.stowageCount,
            matches: this.results.matches.length,
            missingInStowage: this.results.missingInStowage.length,
            extraInStowage: this.results.extraInStowage.length,
            unClassMismatches: this.results.unClassMismatches.length,
            matchRate: this.results.manifestCount > 0 ? 
                ((this.results.matches.length / this.results.manifestCount) * 100).toFixed(1) : 0,
            confidence: ((this.results.confidence || 0) * 100).toFixed(1),
            status: this.getDGValidationStatus()
        };
        
        return summary;
    }
    
    /**
     * Get DG validation status
     */
    getDGValidationStatus() {
        if (!this.results) return 'unknown';
        
        const matchRate = this.results.matches.length / Math.max(this.results.manifestCount, 1);
        const confidence = this.results.confidence || 0;
        
        if (matchRate >= 0.95 && confidence >= 0.9) return 'excellent';
        if (matchRate >= 0.85 && confidence >= 0.8) return 'good';
        if (matchRate >= 0.7 && confidence >= 0.6) return 'acceptable';
        return 'needs_review';
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