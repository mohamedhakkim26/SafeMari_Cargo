const { pipeline } = require('@xenova/transformers');

/**
 * Production-ready AI Column Detector using MiniLM-L6-v2
 * Lightweight transformer model for accurate column classification
 */
class ProductionAIDetector {
    constructor() {
        this.classifier = null;
        this.isInitialized = false;
        this.modelName = 'Xenova/all-MiniLM-L6-v2';
        
        // Column type definitions with maritime context
        this.columnTypes = {
            'container_id': ['container', 'cont', 'cntr', 'ctnr', 'id', 'number', 'box', 'unit'],
            'temperature_set': ['set', 'target', 'required', 'temp', 'temperature', 'cargo', 'reefer'],
            'temperature_actual': ['actual', 'manifest', 'current', 'measured', 'real', 'probe'],
            'stowage': ['stowage', 'position', 'location', 'bay', 'row', 'tier', 'hold', 'deck'],
            'weight': ['weight', 'kg', 'ton', 'mass', 'gross', 'net'],
            'cargo_type': ['cargo', 'commodity', 'goods', 'product', 'type'],
            'description': ['description', 'name', 'remarks', 'notes'],
            'other': ['other', 'misc', 'various']
        };
        
        // Pre-computed embeddings for column types (will be calculated on init)
        this.typeEmbeddings = null;
    }

    /**
     * Initialize the AI classifier
     */
    async initialize() {
        try {
            console.log('Loading MiniLM-L6-v2 model...');
            
            // Initialize the feature extraction pipeline
            this.classifier = await pipeline('feature-extraction', this.modelName, {
                local_files_only: false,
                cache_dir: './models/.cache'
            });
            
            // Pre-compute embeddings for all column types
            await this.precomputeTypeEmbeddings();
            
            this.isInitialized = true;
            console.log('Production AI detector initialized successfully');
            return true;
            
        } catch (error) {
            console.warn('Failed to initialize AI model:', error.message);
            this.isInitialized = false;
            return false;
        }
    }

    /**
     * Pre-compute embeddings for all column types for faster classification
     */
    async precomputeTypeEmbeddings() {
        this.typeEmbeddings = {};
        
        for (const [type, keywords] of Object.entries(this.columnTypes)) {
            const typeText = keywords.join(' ');
            try {
                const embedding = await this.classifier(typeText);
                this.typeEmbeddings[type] = embedding[0]; // First element is the embedding
            } catch (error) {
                console.warn(`Failed to compute embedding for ${type}:`, error);
            }
        }
    }

    /**
     * Calculate similarity between two embeddings
     */
    cosineSimilarity(embedding1, embedding2) {
        if (!embedding1 || !embedding2) return 0;
        
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;
        
        for (let i = 0; i < embedding1.length && i < embedding2.length; i++) {
            dotProduct += embedding1[i] * embedding2[i];
            norm1 += embedding1[i] * embedding1[i];
            norm2 += embedding2[i] * embedding2[i];
        }
        
        if (norm1 === 0 || norm2 === 0) return 0;
        
        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    }

    /**
     * Classify a single column header
     */
    async classifyColumn(headerText, sampleData = []) {
        if (!this.isInitialized || !this.typeEmbeddings) {
            throw new Error('AI model not initialized');
        }

        try {
            // Create context from header and sample data
            const context = this.createContext(headerText, sampleData);
            
            // Get embedding for the context
            const contextEmbedding = await this.classifier(context);
            const embedding = contextEmbedding[0];
            
            // Calculate similarities with all column types
            const similarities = {};
            let maxSimilarity = 0;
            let bestType = 'other';
            
            for (const [type, typeEmbedding] of Object.entries(this.typeEmbeddings)) {
                const similarity = this.cosineSimilarity(embedding, typeEmbedding);
                similarities[type] = similarity;
                
                if (similarity > maxSimilarity) {
                    maxSimilarity = similarity;
                    bestType = type;
                }
            }
            
            // Apply confidence threshold
            const confidence = maxSimilarity > 0.3 ? maxSimilarity : 0;
            
            return {
                type: bestType,
                confidence: confidence,
                similarities: similarities,
                context: context
            };
            
        } catch (error) {
            console.error('AI classification error:', error);
            throw error;
        }
    }

    /**
     * Create rich context from header text and sample data
     */
    createContext(headerText, sampleData = []) {
        // Ensure headerText is a string
        let context = '';
        if (headerText != null) {
            context = String(headerText);
        }
        
        // Add sample data analysis
        if (sampleData && sampleData.length > 0) {
            const validSamples = sampleData.filter(s => {
                if (s == null) return false;
                const strValue = String(s).trim();
                return strValue !== '' && strValue !== 'undefined' && strValue !== 'null';
            });
            
            if (validSamples.length > 0) {
                // Analyze patterns in sample data
                const patterns = this.analyzeSamplePatterns(validSamples);
                if (patterns) {
                    context += ` ${patterns}`;
                }
            }
        }
        
        return String(context).trim();
    }

    /**
     * Analyze patterns in sample data to enhance context
     */
    analyzeSamplePatterns(samples) {
        let patterns = [];
        
        for (const sample of samples.slice(0, 5)) { // Limit to first 5 samples
            try {
                // Handle different data types safely
                let str = '';
                if (sample instanceof Date) {
                    str = sample.toISOString();
                } else if (sample != null) {
                    str = String(sample).trim().toUpperCase();
                }
                
                if (str === '') continue;
                
                // Container ID pattern
                if (/^[A-Z]{4}\d{7}$/.test(str)) {
                    patterns.push('container_identifier');
                }
                
                // Temperature pattern
                const temp = parseFloat(str);
                if (!isNaN(temp) && temp >= -50 && temp <= 60) {
                    patterns.push('temperature_value');
                }
                
                // Stowage pattern
                if (/^\d{2,3}[\.\s]?\d{2}[\.\s]?\d{2}$|^\d{6}$/.test(str)) {
                    patterns.push('stowage_position');
                }
                
                // Weight pattern
                if (/\d+\.?\d*(KG|TON|LB)/i.test(str)) {
                    patterns.push('weight_measurement');
                }
                
                // Date pattern
                if (sample instanceof Date || /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/.test(str)) {
                    patterns.push('date_value');
                }
                
            } catch (error) {
                console.warn('Error analyzing sample pattern:', error);
                continue;
            }
        }
        
        return patterns.join(' ');
    }

    /**
     * Analyze multiple columns
     */
    async analyzeColumns(headersWithData) {
        if (!this.isInitialized) {
            return null;
        }

        const results = {};
        
        for (let i = 0; i < headersWithData.length; i++) {
            const { header, sampleData } = headersWithData[i];
            
            try {
                const classification = await this.classifyColumn(header, sampleData);
                results[i] = classification;
            } catch (error) {
                console.warn(`Failed to classify column ${i}: ${header}`, error);
                results[i] = {
                    type: 'other',
                    confidence: 0,
                    error: error.message
                };
            }
        }
        
        return results;
    }

    /**
     * Find best columns for specific target types
     */
    findBestColumns(analysisResults, targetTypes) {
        const columnMap = {};
        
        targetTypes.forEach(targetType => {
            let bestIdx = -1;
            let bestConfidence = 0;
            
            Object.entries(analysisResults).forEach(([idx, result]) => {
                if (result.type === targetType && result.confidence > bestConfidence) {
                    bestConfidence = result.confidence;
                    bestIdx = parseInt(idx);
                }
            });
            
            // Lower threshold for production use
            if (bestIdx !== -1 && bestConfidence > 0.25) {
                columnMap[targetType] = {
                    index: bestIdx,
                    confidence: bestConfidence
                };
            }
        });
        
        return columnMap;
    }

    /**
     * Get detector status
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            modelName: this.modelName,
            modelLoaded: !!this.classifier,
            typeEmbeddings: !!this.typeEmbeddings,
            supportedTypes: Object.keys(this.columnTypes)
        };
    }
}

module.exports = ProductionAIDetector;