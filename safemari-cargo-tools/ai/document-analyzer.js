/**
 * Dynamic Document Analyzer with AI-Driven Column Mapping
 * Analyzes document structure and provides AI recommendations for processing
 */

const ProductionAIDetector = require('./production-detector');

class DocumentAnalyzer {
    constructor() {
        this.aiDetector = new ProductionAIDetector();
        this.initialized = false;
    }

    async initialize() {
        if (!this.initialized) {
            await this.aiDetector.initialize();
            this.initialized = true;
        }
    }

    /**
     * Analyze document structure and provide AI-driven processing recommendations
     */
    async analyzeDocument(data, fileType, fileName) {
        await this.initialize();

        const analysis = {
            fileName: fileName,
            fileType: fileType,
            structure: this.analyzeStructure(data),
            columnAnalysis: await this.analyzeColumns(data),
            dataQuality: this.analyzeDataQuality(data),
            processingRecommendations: null,
            issues: [],
            confidence: 0
        };

        // Generate AI-driven processing recommendations
        analysis.processingRecommendations = this.generateProcessingPlan(analysis);
        analysis.confidence = this.calculateOverallConfidence(analysis);

        return analysis;
    }

    /**
     * Analyze document structure
     */
    analyzeStructure(data) {
        if (!data || data.length === 0) {
            return {
                valid: false,
                error: "Document is empty or corrupted",
                totalRows: 0,
                totalColumns: 0
            };
        }

        const totalRows = data.length;
        const maxColumns = Math.max(...data.map(row => row ? row.length : 0));
        
        // Find header row
        let headerRowIndex = 0;
        let dataStartRow = 1;
        
        // Look for first row with meaningful headers
        for (let i = 0; i < Math.min(5, totalRows); i++) {
            const row = data[i] || [];
            const nonEmptyCount = row.filter(cell => cell != null && cell.toString().trim() !== '').length;
            
            if (nonEmptyCount >= 2) {
                headerRowIndex = i;
                dataStartRow = i + 1;
                break;
            }
        }

        // Analyze data density
        let dataRows = 0;
        for (let i = dataStartRow; i < totalRows; i++) {
            const row = data[i] || [];
            const nonEmptyCount = row.filter(cell => cell != null && cell.toString().trim() !== '').length;
            if (nonEmptyCount >= 2) dataRows++;
        }

        return {
            valid: totalRows > 0 && maxColumns > 0,
            totalRows: totalRows,
            totalColumns: maxColumns,
            headerRowIndex: headerRowIndex,
            dataStartRow: dataStartRow,
            dataRows: dataRows,
            dataDensity: dataRows / Math.max(1, totalRows - dataStartRow)
        };
    }

    /**
     * Multi-pass column analysis with flexible detection
     */
    async analyzeColumns(data) {
        if (!data || data.length === 0) return { columns: [], confidence: 0 };

        const structure = this.analyzeStructure(data);
        if (!structure.valid) return { columns: [], confidence: 0 };

        // Pass 1: Find all possible header rows and data patterns
        const headerCandidates = this.findHeaderCandidates(data);
        const maxColumns = Math.max(...data.map(row => row ? row.length : 0));
        
        // Pass 2: Analyze entire data range for each column
        const fullDataRange = data.slice(1); // Skip first row, analyze all data
        console.log(`📊 Multi-pass analysis: ${maxColumns} columns with ${fullDataRange.length} data rows`);

        const columnAnalysis = [];

        for (let i = 0; i < maxColumns; i++) {
            // Get header from best candidate
            const header = this.getBestHeader(headerCandidates, i);
            
            // Analyze ALL data in this column, not just samples
            const allColumnData = fullDataRange.map(row => row && row[i]).filter(cell => cell != null && cell.toString().trim() !== '');
            
            // Enhanced pattern analysis on full dataset
            const patterns = this.analyzeColumnPatterns(allColumnData);
            const dataAnalysis = this.performDeepDataAnalysis(allColumnData);

            // AI classification with better context
            let aiClassification = null;
            if (this.aiDetector.isInitialized && allColumnData.length > 0) {
                try {
                    const context = this.createRichContext(header, allColumnData.slice(0, 10));
                    aiClassification = await this.aiDetector.classifyColumn(context, allColumnData.slice(0, 10));
                } catch (error) {
                    // Silent fail
                }
            }

            const columnResult = {
                index: i,
                header: header,
                sampleData: allColumnData.slice(0, 3),
                fullSampleSize: allColumnData.length,
                aiClassification: aiClassification,
                patterns: patterns,
                dataAnalysis: dataAnalysis,
                dataType: this.inferDataType(allColumnData),
                quality: this.assessColumnQuality(allColumnData),
                confidence: this.calculateColumnConfidence(patterns, dataAnalysis, aiClassification)
            };

            // Enhanced logging
            const summary = {
                containers: patterns.containerIds,
                temps: patterns.temperatures,
                hasUnits: patterns.hasUnits,
                quality: columnResult.quality.score.toFixed(2)
            };
            console.log(`   Col ${i} [${header || 'NULL'}]: ${JSON.stringify(summary)}`);

            columnAnalysis.push(columnResult);
        }

        return {
            columns: columnAnalysis,
            confidence: this.calculateOverallColumnConfidence(columnAnalysis)
        };
    }

    /**
     * Find potential header rows in the data
     */
    findHeaderCandidates(data) {
        const candidates = [];
        
        for (let i = 0; i < Math.min(10, data.length); i++) {
            const row = data[i] || [];
            const score = this.scoreHeaderRow(row);
            if (score > 0) {
                candidates.push({ rowIndex: i, row: row, score: score });
            }
        }
        
        return candidates.sort((a, b) => b.score - a.score);
    }

    /**
     * Score a row as potential header
     */
    scoreHeaderRow(row) {
        let score = 0;
        
        for (const cell of row) {
            if (!cell) continue;
            const str = cell.toString().toLowerCase();
            
            // Container-related headers
            if (/cont|container|cntr|id/.test(str)) score += 3;
            // Temperature-related headers
            if (/temp|temperature|°|deg|point/.test(str)) score += 3;
            // Other shipping headers
            if (/stow|pol|pod|port|vessel|voyage/.test(str)) score += 1;
            // Generic headers
            if (/sr|no|size|weight|commodity/.test(str)) score += 1;
        }
        
        return score;
    }

    /**
     * Get best header for column from candidates
     */
    getBestHeader(headerCandidates, columnIndex) {
        for (const candidate of headerCandidates) {
            const header = candidate.row[columnIndex];
            if (header && header.toString().trim() !== '') {
                return header;
            }
        }
        return null;
    }

    /**
     * Create rich context for AI analysis
     */
    createRichContext(header, sampleData) {
        const normalizedHeader = header ? header.toString().replace(/[°]/g, 'deg').toLowerCase() : '';
        const dataPatterns = this.analyzeColumnPatterns(sampleData);
        
        // Create descriptive context
        let context = normalizedHeader;
        
        if (dataPatterns.containerIds > 0) context += ' container_identifier_data';
        if (dataPatterns.temperatures > 0) context += ' temperature_numeric_data';
        if (dataPatterns.stowagePositions > 0) context += ' stowage_position_data';
        if (dataPatterns.hasUnits) context += ' has_temperature_units';
        
        return context;
    }

    /**
     * Enhanced pattern analysis on full dataset
     */
    analyzeColumnPatterns(allData) {
        const patterns = {
            containerIds: 0,
            temperatures: 0,
            stowagePositions: 0,
            unNumbers: 0,
            timestamps: 0,
            numeric: 0,
            text: 0,
            hasUnits: false,
            hasNegativeNumbers: false,
            temperatureRange: { min: null, max: null }
        };

        for (const sample of allData) {
            if (sample == null) continue;
            const str = sample.toString().trim().toUpperCase();

            // Enhanced container ID pattern - more flexible
            if (/^[A-Z]{4}\d{6,7}$/.test(str) || /^[A-Z]{3}[U]\d{7}$/.test(str)) {
                patterns.containerIds++;
            }
            
            // Enhanced temperature pattern with better validation
            let tempValue = null;
            // Match patterns like: -0.5°C, -23 C, 14.0°C, 0.5 C
            const tempMatch = str.match(/^[-+]?\d*\.?\d+\s*[°]?\s*[CF]?$/);
            if (tempMatch) {
                const numMatch = str.match(/[-+]?\d*\.?\d+/);
                if (numMatch) {
                    tempValue = parseFloat(numMatch[0]);
                    // Realistic temperature range for reefer containers
                    if (!isNaN(tempValue) && tempValue >= -30 && tempValue <= 25) {
                        patterns.temperatures++;
                        if (tempValue < 0) patterns.hasNegativeNumbers = true;
                        
                        // Track temperature range
                        if (patterns.temperatureRange.min === null || tempValue < patterns.temperatureRange.min) {
                            patterns.temperatureRange.min = tempValue;
                        }
                        if (patterns.temperatureRange.max === null || tempValue > patterns.temperatureRange.max) {
                            patterns.temperatureRange.max = tempValue;
                        }
                    }
                }
                
                // Check for temperature units
                if (/[°CF]/.test(str)) {
                    patterns.hasUnits = true;
                }
            }
            
            // Enhanced stowage pattern
            if (/^\d{2,3}[\s\.]?\d{2}[\s\.]?\d{2}$/.test(str.replace(/\s+/g, ' '))) {
                patterns.stowagePositions++;
            }
            
            // UN Number pattern
            if (/^UN\d{4}$/.test(str) || /^\d{4}$/.test(str)) {
                patterns.unNumbers++;
            }
            
            // Timestamp pattern
            if (/\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/.test(str)) {
                patterns.timestamps++;
            }
            
            // Numeric vs text
            if (tempValue !== null || !isNaN(parseFloat(str))) {
                patterns.numeric++;
            } else {
                patterns.text++;
            }
        }

        return patterns;
    }

    /**
     * Perform deep data analysis on sample
     */
    performDeepDataAnalysis(sampleData) {
        const analysis = {
            uniqueValues: new Set(sampleData.map(s => s?.toString().trim())).size,
            nullCount: sampleData.filter(s => s == null || s === '').length,
            avgLength: 0,
            hasSpecialChars: false,
            commonPrefixes: {},
            commonSuffixes: {}
        };

        let totalLength = 0;
        for (const sample of sampleData) {
            if (sample == null) continue;
            const str = sample.toString().trim();
            totalLength += str.length;
            
            // Check for special characters
            if (/[°@#$%^&*()\-+]/.test(str)) {
                analysis.hasSpecialChars = true;
            }
            
            // Track common prefixes/suffixes
            if (str.length >= 2) {
                const prefix = str.substring(0, 2);
                const suffix = str.substring(str.length - 2);
                analysis.commonPrefixes[prefix] = (analysis.commonPrefixes[prefix] || 0) + 1;
                analysis.commonSuffixes[suffix] = (analysis.commonSuffixes[suffix] || 0) + 1;
            }
        }
        
        analysis.avgLength = sampleData.length > 0 ? totalLength / sampleData.length : 0;
        
        return analysis;
    }

    /**
     * Calculate column-specific confidence
     */
    calculateColumnConfidence(patterns, dataAnalysis, aiClassification) {
        let confidence = 0;
        
        // AI confidence
        if (aiClassification && aiClassification.confidence > 0) {
            confidence += aiClassification.confidence * 0.5;
        }
        
        // Pattern confidence
        const totalSamples = Object.values(patterns).reduce((sum, val) => 
            typeof val === 'number' ? sum + val : sum, 0);
        
        if (totalSamples > 0) {
            const patternScore = Math.max(
                patterns.containerIds / totalSamples,
                patterns.temperatures / totalSamples,
                patterns.stowagePositions / totalSamples
            );
            confidence += patternScore * 0.3;
        }
        
        // Data quality confidence
        if (dataAnalysis.nullCount / (dataAnalysis.nullCount + totalSamples) < 0.5) {
            confidence += 0.2;
        }
        
        return Math.min(confidence, 1.0);
    }

    /**
     * Calculate overall column confidence
     */
    calculateOverallColumnConfidence(columnAnalysis) {
        if (columnAnalysis.length === 0) return 0;
        
        const confidences = columnAnalysis.map(col => col.confidence);
        return confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;
    }

    /**
     * Infer data type from samples
     */
    inferDataType(sampleData) {
        if (sampleData.length === 0) return 'empty';

        let numeric = 0;
        let text = 0;
        let dates = 0;

        for (const sample of sampleData) {
            if (sample == null) continue;
            const str = sample.toString().trim();

            if (!isNaN(parseFloat(str))) numeric++;
            else if (/\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/.test(str)) dates++;
            else text++;
        }

        const total = numeric + text + dates;
        if (dates / total > 0.5) return 'date';
        if (numeric / total > 0.7) return 'numeric';
        return 'text';
    }

    /**
     * Assess column data quality
     */
    assessColumnQuality(sampleData) {
        if (sampleData.length === 0) return { score: 0, issues: ['No data'] };

        const issues = [];
        let score = 1.0;

        // Check for missing data
        const emptyCount = sampleData.filter(s => s == null || s.toString().trim() === '').length;
        const missingRate = emptyCount / sampleData.length;
        
        if (missingRate > 0.5) {
            issues.push('High missing data rate');
            score -= 0.3;
        } else if (missingRate > 0.2) {
            issues.push('Some missing data');
            score -= 0.1;
        }

        // Check for consistency
        const types = new Set();
        for (const sample of sampleData) {
            if (sample != null) {
                const str = sample.toString().trim();
                if (!isNaN(parseFloat(str))) types.add('numeric');
                else types.add('text');
            }
        }

        if (types.size > 1) {
            issues.push('Mixed data types');
            score -= 0.2;
        }

        return { score: Math.max(0, score), issues };
    }

    /**
     * Analyze overall data quality
     */
    analyzeDataQuality(data) {
        const structure = this.analyzeStructure(data);
        if (!structure.valid) {
            return {
                score: 0,
                issues: ['Invalid document structure'],
                recommendations: ['Check file format and content']
            };
        }

        const issues = [];
        const recommendations = [];
        let score = 1.0;

        // Check data density
        if (structure.dataDensity < 0.5) {
            issues.push('Low data density - many empty rows');
            recommendations.push('Remove empty rows or check data source');
            score -= 0.2;
        }

        // Check column count
        if (structure.totalColumns < 2) {
            issues.push('Too few columns detected');
            recommendations.push('Ensure file has proper column structure');
            score -= 0.3;
        }

        // Check row count
        if (structure.dataRows < 5) {
            issues.push('Very few data rows');
            recommendations.push('Ensure file contains sufficient data');
            score -= 0.2;
        }

        return {
            score: Math.max(0, score),
            issues,
            recommendations
        };
    }

    /**
     * Generate AI-driven processing recommendations
     */
    generateProcessingPlan(analysis) {
        const plan = {
            canProcess: false,
            requiredColumns: [],
            columnMappings: {},
            processingSteps: [],
            warnings: [],
            criticalIssues: [],
            detectionSummary: []
        };

        if (!analysis.structure.valid) {
            plan.criticalIssues.push('Document structure is invalid');
            return plan;
        }

        // Find required columns based on enhanced analysis
        const columns = analysis.columnAnalysis.columns;
        
        // Look for container ID column
        const containerColumn = this.findBestColumn(columns, 'container_id');
        if (containerColumn) {
            plan.columnMappings.containerId = containerColumn.index;
            plan.processingSteps.push(`✅ Container IDs: Column ${containerColumn.index} [${containerColumn.header}]`);
            plan.detectionSummary.push(`Container IDs found: ${containerColumn.patterns.containerIds} in column ${containerColumn.index}`);
        } else {
            plan.criticalIssues.push('❌ No container ID column detected');
            // Show what was found
            const containerCandidates = columns.filter(col => col.patterns.containerIds > 0);
            if (containerCandidates.length > 0) {
                plan.detectionSummary.push(`Container IDs found but score too low: ${containerCandidates.map(c => `Col ${c.index}(${c.patterns.containerIds})`).join(', ')}`);
            }
        }

        // Look for temperature columns
        const tempSetColumn = this.findBestColumn(columns, 'temperature_set');
        const tempActualColumn = this.findBestColumn(columns, 'temperature_actual');
        
        if (tempSetColumn) {
            plan.columnMappings.setTemp = tempSetColumn.index;
            plan.processingSteps.push(`✅ Set Temperatures: Column ${tempSetColumn.index} [${tempSetColumn.header}]`);
            plan.detectionSummary.push(`Set temperatures found: ${tempSetColumn.patterns.temperatures} in column ${tempSetColumn.index}`);
        }
        
        if (tempActualColumn) {
            plan.columnMappings.actualTemp = tempActualColumn.index;
            plan.processingSteps.push(`✅ Actual Temperatures: Column ${tempActualColumn.index} [${tempActualColumn.header}]`);
            plan.detectionSummary.push(`Actual temperatures found: ${tempActualColumn.patterns.temperatures} in column ${tempActualColumn.index}`);
        }
        
        // If no temperature columns found, show what was detected
        if (!tempSetColumn && !tempActualColumn) {
            plan.criticalIssues.push('❌ No temperature columns detected');
            const tempCandidates = columns.filter(col => col.patterns.temperatures > 0);
            if (tempCandidates.length > 0) {
                plan.detectionSummary.push(`Temperature values found but score too low: ${tempCandidates.map(c => `Col ${c.index}(${c.patterns.temperatures})`).join(', ')}`);
            }
        }

        // Determine if we can process
        plan.canProcess = plan.columnMappings.containerId !== undefined && 
                         (plan.columnMappings.setTemp !== undefined || plan.columnMappings.actualTemp !== undefined);

        if (!plan.canProcess && plan.criticalIssues.length === 0) {
            plan.criticalIssues.push('Missing required columns for processing');
        }

        // Add data quality warnings
        if (analysis.dataQuality.score < 0.7) {
            plan.warnings.push('Data quality issues detected');
        }

        return plan;
    }

    /**
     * Find best column for a specific type
     */
    findBestColumn(columns, targetType) {
        let bestColumn = null;
        let bestScore = 0;

        for (const column of columns) {
            let score = 0;

            // Enhanced pattern matching with header analysis
            const patterns = column.patterns;
            const header = (column.header || '').toString().toLowerCase();
            
            switch (targetType) {
                case 'container_id':
                    // Strong container ID patterns
                    if (patterns.containerIds > 0) {
                        score += (patterns.containerIds / Math.max(1, column.fullSampleSize)) * 0.8;
                    }
                    // Header matching
                    if (/cont|container|cntr|id/.test(header)) {
                        score += 0.3;
                    }
                    break;
                    
                case 'temperature_set':
                    // Temperature patterns with setpoint indicators
                    if (patterns.temperatures > 0) {
                        score += (patterns.temperatures / Math.max(1, column.fullSampleSize)) * 0.6;
                    }
                    // Header matching for setpoint
                    if (/set.*point|target|setpoint|set.*temp/i.test(header)) {
                        score += 0.4;
                    }
                    // Temperature units bonus
                    if (patterns.hasUnits || /°|deg|temp/i.test(header)) {
                        score += 0.2;
                    }
                    break;
                    
                case 'temperature_actual':
                    // Temperature patterns with actual indicators
                    if (patterns.temperatures > 0) {
                        score += (patterns.temperatures / Math.max(1, column.fullSampleSize)) * 0.6;
                    }
                    // Header matching for actual readings
                    if (/actual|measured|probe|supply|return|sensor/i.test(header)) {
                        score += 0.4;
                    }
                    // Temperature units bonus
                    if (patterns.hasUnits || /°|deg|temp/i.test(header)) {
                        score += 0.2;
                    }
                    break;
            }

            // AI classification bonus (if working)
            if (column.aiClassification && column.aiClassification.type === targetType) {
                score += column.aiClassification.confidence * 0.3;
            }

            // Quality bonus
            score += column.quality.score * 0.1;

            if (score > bestScore) {
                bestScore = score;
                bestColumn = column;
            }
        }

        // Adaptive threshold based on data quality
        const threshold = bestColumn && bestColumn.patterns.containerIds > 5 ? 0.05 : 0.1;
        return bestScore > threshold ? bestColumn : null;
    }

    /**
     * Calculate overall confidence
     */
    calculateOverallConfidence(analysis) {
        if (!analysis.structure.valid) return 0;

        let confidence = 0;
        
        // Structure confidence
        confidence += analysis.structure.dataDensity * 0.3;
        
        // Column analysis confidence
        confidence += analysis.columnAnalysis.confidence * 0.4;
        
        // Data quality confidence
        confidence += analysis.dataQuality.score * 0.3;

        return Math.min(1.0, confidence);
    }

    /**
     * Calculate column analysis confidence
     */
    calculateColumnConfidence(columnAnalysis) {
        // Handle both array and object with columns property
        const columns = Array.isArray(columnAnalysis) ? columnAnalysis : columnAnalysis.columns;
        
        if (!columns || columns.length === 0) return 0;

        let totalConfidence = 0;
        let validColumns = 0;

        for (const column of columns) {
            if (column.aiClassification && column.aiClassification.confidence > 0.3) {
                totalConfidence += column.aiClassification.confidence;
                validColumns++;
            }
        }

        return validColumns > 0 ? totalConfidence / validColumns : 0;
    }
}

module.exports = DocumentAnalyzer;