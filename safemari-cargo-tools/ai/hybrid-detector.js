const ProductionAIDetector = require('./production-detector');
const SmartDocumentDetector = require('./smart-detector');
const MaritimeRulesEngine = require('./rules-engine');

/**
 * Hybrid column detector that combines JavaScript pattern matching with Production AI
 * Uses MiniLM transformer model and maritime rules for maximum accuracy
 */
class HybridColumnDetector {
    constructor() {
        this.aiDetector = new ProductionAIDetector();
        this.rulesEngine = new MaritimeRulesEngine();
        this.useAI = false;
    }

    /**
     * Initialize the hybrid detector
     */
    async initialize() {
        try {
            this.useAI = await this.aiDetector.initialize();
            console.log(`Production AI detector initialized. AI support: ${this.useAI}`);
            return true;
        } catch (error) {
            console.warn('Production AI initialization failed, using JS fallback:', error);
            this.useAI = false;
            return true; // Still usable with JS fallback
        }
    }

    /**
     * Enhanced JavaScript-based column detection (fallback)
     */
    detectColumnsJS(data, fileType) {
        if (!data || data.length === 0) {
            throw new Error(`No data found in ${fileType} file`);
        }

        const headers = data[0].map(h => String(h || '').toLowerCase());
        console.log(`Analyzing headers in ${fileType}:`, headers);
        
        const result = {};

        // Much more flexible container ID patterns
        const containerPatterns = [
            /container.*id/i, /container.*number/i, /container.*no/i, /container.*num/i,
            /cntr.*id/i, /cntr.*no/i, /cntr.*num/i, /^container$/i, /^cntr$/i, /^ctnr$/i,
            /^id$/i, /container/i, /cntr/i, /ctnr/i, /cont.*no/i, /cont.*id/i, /cont.*num/i,
            /box.*no/i, /unit.*no/i, /unit.*id/i, /^cont$/i, /equipment/i, /equip/i,
            /container.*code/i, /^no$/i, /number/i, /numero/i
        ];

        // Much more flexible temperature patterns
        const tempPatterns = {
            check: [
                /set.*temp/i, /target.*temp/i, /required.*temp/i, /preset/i,
                /temp.*set/i, /°c.*set/i, /set.*°c/i, /^temp$/i, /^temperature$/i,
                /set/i, /target/i, /required/i, /temp/i, /°c/i, /celsius/i, /degree/i,
                /chill/i, /cold/i, /frozen/i, /reefer.*temp/i, /cargo.*temp/i,
                /setting/i, /setpoint/i, /pre.*set/i, /programmed/i, /desired/i
            ],
            manifest: [
                /actual.*temp/i, /manifest.*temp/i, /current.*temp/i, /real.*temp/i,
                /temp.*actual/i, /°c.*actual/i, /actual.*°c/i, /temp.*manifest/i,
                /actual/i, /manifest/i, /current/i, /measured/i, /real/i, /live/i,
                /temp/i, /°c/i, /celsius/i, /reefer.*temp/i, /probe/i, /sensor/i,
                /reading/i, /value/i, /recorded/i, /monitored/i
            ]
        };

        // Find container ID column with better scoring
        let bestContainerMatch = { index: -1, score: 0, reason: '' };
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i];
            for (let j = 0; j < containerPatterns.length; j++) {
                if (containerPatterns[j].test(header)) {
                    const contentScore = this.calculateColumnScore(data, i, 'container');
                    const patternScore = j === 0 ? 1.0 : (1.0 - j * 0.05); // Prefer earlier patterns
                    const totalScore = contentScore * 0.7 + patternScore * 0.3;
                    
                    if (totalScore > bestContainerMatch.score) {
                        bestContainerMatch = { 
                            index: i, 
                            score: totalScore,
                            reason: `Pattern: ${containerPatterns[j]}, Content: ${contentScore.toFixed(2)}, Total: ${totalScore.toFixed(2)}`
                        };
                    }
                    break;
                }
            }
        }
        
        if (bestContainerMatch.index !== -1) {
            result.containerId = bestContainerMatch.index;
            console.log(`Container ID column found: ${bestContainerMatch.index} (${headers[bestContainerMatch.index]}) - ${bestContainerMatch.reason}`);
        } else {
            console.log('No container ID column found. Headers:', headers);
        }

        // Find temperature columns with better scoring
        const patterns = tempPatterns[fileType] || tempPatterns.check;
        let bestTempMatch = { index: -1, score: 0, reason: '' };
        
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i];
            for (let j = 0; j < patterns.length; j++) {
                if (patterns[j].test(header)) {
                    const contentScore = this.calculateColumnScore(data, i, 'temperature');
                    const patternScore = j === 0 ? 1.0 : (1.0 - j * 0.05);
                    const totalScore = contentScore * 0.8 + patternScore * 0.2;
                    
                    if (totalScore > bestTempMatch.score) {
                        bestTempMatch = { 
                            index: i, 
                            score: totalScore,
                            reason: `Pattern: ${patterns[j]}, Content: ${contentScore.toFixed(2)}, Total: ${totalScore.toFixed(2)}`
                        };
                    }
                    break;
                }
            }
        }

        if (bestTempMatch.index !== -1) {
            if (fileType === 'check') {
                result.setTemp = bestTempMatch.index;
            } else {
                result.manifestTemp = bestTempMatch.index;
            }
            console.log(`Temperature column found: ${bestTempMatch.index} (${headers[bestTempMatch.index]}) - ${bestTempMatch.reason}`);
        } else {
            console.log('No temperature column found. Headers:', headers);
        }

        // Add confidence scoring
        result.confidence = this.calculateOverallConfidence(result, data);
        result.method = 'enhanced_javascript';

        console.log(`Detection result for ${fileType}:`, result);
        return result;
    }

    /**
     * Calculate score for a column based on data content
     */
    calculateColumnScore(data, columnIndex, type) {
        const maxRows = Math.min(50, data.length);
        let validCount = 0;
        let totalCount = 0;

        for (let i = 1; i < maxRows; i++) {
            const cell = data[i]?.[columnIndex];
            if (cell == null || cell === '') continue;
            
            totalCount++;
            const value = String(cell).trim();

            switch (type) {
                case 'container':
                    if (/^[A-Z]{4}\d{7}$/i.test(value)) validCount++;
                    break;
                case 'temperature':
                    const temp = parseFloat(value);
                    if (!isNaN(temp) && temp >= -50 && temp <= 60) validCount++;
                    break;
                case 'stowage':
                    if (/^\d{2,3}[\.\s]?\d{2}[\.\s]?\d{2}$|^\d{6}$/.test(value)) validCount++;
                    break;
            }
        }

        return totalCount > 0 ? validCount / totalCount : 0;
    }

    /**
     * Calculate overall confidence score
     */
    calculateOverallConfidence(result, data) {
        let totalScore = 0;
        let scoreCount = 0;

        Object.entries(result).forEach(([key, value]) => {
            if (typeof value === 'number' && value >= 0) {
                const score = this.calculateColumnScore(data, value, this.getColumnType(key));
                totalScore += score;
                scoreCount++;
            }
        });

        return scoreCount > 0 ? totalScore / scoreCount : 0;
    }

    /**
     * Map result key to column type
     */
    getColumnType(key) {
        const mapping = {
            'containerId': 'container',
            'setTemp': 'temperature',
            'manifestTemp': 'temperature',
            'stowage': 'stowage'
        };
        return mapping[key] || 'unknown';
    }

    /**
     * Main detection method that uses Smart Document Analysis + Production AI
     */
    async detectColumns(data, fileType) {
        try {
            // First try smart document detection for formatted files
            const smartResult = SmartDocumentDetector.analyzeDocument(data, fileType);
            
            if (smartResult.confidence > 0.3) {
                console.log(`Smart detection successful (confidence: ${smartResult.confidence.toFixed(2)})`);
                return smartResult;
            }
            
            // Fallback to enhanced JavaScript detection
            console.log(`Smart detection failed (confidence: ${smartResult.confidence.toFixed(2)}), trying enhanced JS...`);
            const jsResult = this.detectColumnsJS(data, fileType);

            // If AI is available and both methods have low confidence, try AI
            if (this.useAI && Math.max(smartResult.confidence, jsResult.confidence) < 0.6) {
                try {
                    const headers = smartResult.headerRow !== undefined ? 
                        (data[smartResult.headerRow] || []) : (data[0] || []);
                    
                    const headersWithData = headers.map((header, index) => ({
                        header,
                        sampleData: data.slice(smartResult.dataStartRow || 1, (smartResult.dataStartRow || 1) + 20)
                            .map(row => row[index]).filter(cell => cell != null)
                    }));

                    console.log(`Trying Production AI detection...`);
                    const aiAnalysis = await this.aiDetector.analyzeColumns(headersWithData);
                    
                    if (aiAnalysis) {
                        const targetTypes = fileType === 'check' 
                            ? ['container_id', 'temperature_set']
                            : ['container_id', 'temperature_actual'];
                        
                        const aiColumns = this.aiDetector.findBestColumns(aiAnalysis, targetTypes);
                        const aiResult = this.convertAIResult(aiColumns, fileType);
                        aiResult.confidence = this.calculateAIConfidence(aiColumns);
                        aiResult.method = 'production_ai';

                        // Use AI result if it has better confidence
                        if (aiResult.confidence > Math.max(smartResult.confidence, jsResult.confidence)) {
                            console.log(`Using Production AI detection (confidence: ${aiResult.confidence.toFixed(2)})`);
                            return aiResult;
                        }
                    }
                } catch (aiError) {
                    console.warn('Production AI detection failed:', aiError.message);
                }
            }

            // Return the best result between smart and JS detection
            const bestResult = smartResult.confidence > jsResult.confidence ? smartResult : jsResult;
            
            // Apply rules engine validation
            const validatedResult = this.applyRulesValidation(bestResult, data, fileType);
            return validatedResult;
            
        } catch (error) {
            console.error('Column detection error:', error);
            throw error;
        }
    }

    /**
     * Convert AI analysis result to expected format
     */
    convertAIResult(aiColumns, fileType) {
        const result = {};

        if (aiColumns.container_id) {
            result.containerId = aiColumns.container_id.index;
        }

        if (fileType === 'check' && aiColumns.temperature_set) {
            result.setTemp = aiColumns.temperature_set.index;
        } else if (fileType === 'manifest' && aiColumns.temperature_actual) {
            result.manifestTemp = aiColumns.temperature_actual.index;
        }

        if (aiColumns.stowage) {
            result.stowage = aiColumns.stowage.index;
        }

        return result;
    }

    /**
     * Calculate confidence from AI results
     */
    calculateAIConfidence(aiColumns) {
        const confidences = Object.values(aiColumns).map(col => col.confidence);
        return confidences.length > 0 
            ? confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length 
            : 0;
    }

    /**
     * Apply rules engine validation to results
     */
    applyRulesValidation(result, data, fileType) {
        try {
            // Validate detected columns using sample data
            if (result.containerId !== undefined) {
                const containerSamples = data.slice(1, 11).map(row => row[result.containerId]).filter(id => id);
                const validContainers = containerSamples.filter(id => {
                    const validation = this.rulesEngine.rules.containerValidation.validateFormat(id);
                    return validation.valid;
                });
                
                const containerAccuracy = containerSamples.length > 0 ? 
                    validContainers.length / containerSamples.length : 0;
                
                if (containerAccuracy < 0.5) {
                    console.warn(`Low container ID accuracy: ${containerAccuracy.toFixed(2)}`);
                    result.confidence = Math.min(result.confidence || 0.5, 0.6);
                }
            }
            
            result.rulesValidated = true;
            return result;
        } catch (error) {
            console.warn('Rules validation failed:', error);
            return result;
        }
    }

    /**
     * Get detector status
     */
    getStatus() {
        const status = {
            hybridReady: true,
            jsReady: true,
            aiReady: this.useAI,
            rulesReady: true
        };

        if (this.useAI) {
            status.aiStatus = this.aiDetector.getStatus();
        }

        return status;
    }
}

module.exports = HybridColumnDetector;