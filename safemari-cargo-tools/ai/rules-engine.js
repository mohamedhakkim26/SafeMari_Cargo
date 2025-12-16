/**
 * Maritime Rules Engine
 * Deterministic validation rules for cargo processing
 */
class MaritimeRulesEngine {
    constructor() {
        this.rules = {
            containerValidation: this.containerValidationRules(),
            temperatureValidation: this.temperatureValidationRules(),
            stowageValidation: this.stowageValidationRules(),
            dangerousGoodsRules: this.dangerousGoodsRules()
        };
    }

    /**
     * Container ID validation rules
     */
    containerValidationRules() {
        return {
            // Standard ISO 6346 format
            validateFormat: (containerId) => {
                if (!containerId) return { valid: false, error: 'Container ID is empty' };
                
                const id = containerId.toString().trim().toUpperCase();
                const pattern = /^[A-Z]{4}\d{7}$/;
                
                if (!pattern.test(id)) {
                    return { 
                        valid: false, 
                        error: `Invalid format: ${id}. Expected: 4 letters + 7 digits (e.g., ABCD1234567)` 
                    };
                }
                
                // Check digit validation (ISO 6346)
                const isValidCheckDigit = this.validateContainerCheckDigit(id);
                if (!isValidCheckDigit) {
                    return { 
                        valid: false, 
                        error: `Invalid check digit for: ${id}` 
                    };
                }
                
                return { valid: true, normalized: id };
            },

            // Detect duplicates in a list
            findDuplicates: (containerList) => {
                const seen = new Set();
                const duplicates = new Set();
                
                containerList.forEach(id => {
                    const normalized = id ? id.toString().trim().toUpperCase() : '';
                    if (normalized) {
                        if (seen.has(normalized)) {
                            duplicates.add(normalized);
                        } else {
                            seen.add(normalized);
                        }
                    }
                });
                
                return Array.from(duplicates);
            }
        };
    }

    /**
     * Temperature validation rules
     */
    temperatureValidationRules() {
        return {
            // Standard reefer temperature ranges
            validateRange: (temperature, cargoType = 'general') => {
                if (temperature == null) return { valid: false, error: 'Temperature is null' };
                
                const temp = parseFloat(temperature);
                if (isNaN(temp)) return { valid: false, error: `Invalid temperature: ${temperature}` };
                
                const ranges = {
                    'general': { min: -30, max: 30 },
                    'frozen': { min: -30, max: -10 },
                    'chilled': { min: -5, max: 15 },
                    'pharmaceutical': { min: 2, max: 8 },
                    'banana': { min: 12.5, max: 14.5 },
                    'citrus': { min: -1, max: 15 }
                };
                
                const range = ranges[cargoType] || ranges.general;
                
                if (temp < range.min || temp > range.max) {
                    return { 
                        valid: false, 
                        error: `Temperature ${temp}°C outside ${cargoType} range: ${range.min}°C to ${range.max}°C` 
                    };
                }
                
                return { valid: true, temperature: temp, range };
            },

            // Compare set vs actual temperatures
            validateMismatch: (setTemp, actualTemp, tolerance = 0.5) => {
                const setVal = parseFloat(setTemp);
                const actualVal = parseFloat(actualTemp);
                
                if (isNaN(setVal) || isNaN(actualVal)) {
                    return { valid: false, error: 'Invalid temperature values' };
                }
                
                const difference = Math.abs(setVal - actualVal);
                const withinTolerance = difference <= tolerance;
                
                return {
                    valid: withinTolerance,
                    difference: difference,
                    tolerance: tolerance,
                    setTemp: setVal,
                    actualTemp: actualVal,
                    status: withinTolerance ? 'OK' : 'MISMATCH'
                };
            }
        };
    }

    /**
     * Stowage validation rules
     */
    stowageValidationRules() {
        return {
            // Validate stowage position format
            validateFormat: (stowage) => {
                if (!stowage) return { valid: false, error: 'Stowage position is empty' };
                
                const pos = stowage.toString().trim();
                
                // Common formats: 123456, 12.34.56, 12 34 56
                const patterns = [
                    /^\d{6}$/, // 123456
                    /^\d{2,3}\.\d{2}\.\d{2}$/, // 12.34.56 or 123.34.56
                    /^\d{2,3}\s\d{2}\s\d{2}$/, // 12 34 56 or 123 34 56
                ];
                
                const isValid = patterns.some(pattern => pattern.test(pos));
                
                if (!isValid) {
                    return { 
                        valid: false, 
                        error: `Invalid stowage format: ${pos}. Expected: BBRRTT (e.g., 123456, 12.34.56)` 
                    };
                }
                
                // Normalize to 6-digit format
                const normalized = pos.replace(/[\.\s]/g, '').padStart(6, '0');
                const bay = normalized.substring(0, normalized.length - 4);
                const row = normalized.substring(normalized.length - 4, normalized.length - 2);
                const tier = normalized.substring(normalized.length - 2);
                
                return {
                    valid: true,
                    original: pos,
                    normalized: normalized,
                    bay: bay,
                    row: row,
                    tier: tier
                };
            },

            // Check stowage conflicts (same position for different containers)
            findConflicts: (stowageList) => {
                const positions = {};
                const conflicts = [];
                
                stowageList.forEach(({ containerId, stowage }) => {
                    if (!stowage) return;
                    
                    const validation = this.rules.stowageValidation.validateFormat(stowage);
                    if (validation.valid) {
                        const pos = validation.normalized;
                        
                        if (positions[pos]) {
                            conflicts.push({
                                position: pos,
                                containers: [positions[pos], containerId]
                            });
                        } else {
                            positions[pos] = containerId;
                        }
                    }
                });
                
                return conflicts;
            }
        };
    }

    /**
     * Dangerous goods rules
     */
    dangerousGoodsRules() {
        return {
            // IMDG class compatibility
            checkCompatibility: (class1, class2) => {
                const incompatibleCombinations = [
                    ['1', '3'], ['1', '4'], ['1', '5'], // Explosives with flammables/oxidizers
                    ['2.3', '3'], ['2.3', '4'], // Toxic gases with flammables
                    ['4.3', '5.1'], // Water-reactive with oxidizers
                    ['6.1', '3'] // Toxic substances with flammables
                ];
                
                const isIncompatible = incompatibleCombinations.some(([c1, c2]) => 
                    (class1 === c1 && class2 === c2) || (class1 === c2 && class2 === c1)
                );
                
                return {
                    compatible: !isIncompatible,
                    class1: class1,
                    class2: class2,
                    rule: isIncompatible ? 'IMDG segregation required' : 'Compatible'
                };
            },

            // Segregation distance requirements
            getSegregationDistance: (class1, class2) => {
                const distances = {
                    'same_class': 0,
                    'compatible': 3, // 3 meters minimum
                    'separate': 6, // 6 meters minimum  
                    'segregate': 12, // 12 meters minimum
                    'separate_longitudinally': 24 // 24 meters minimum
                };
                
                // Simplified logic - in real implementation, consult IMDG code
                if (class1 === class2) return distances.same_class;
                
                const compatibility = this.checkCompatibility(class1, class2);
                return compatibility.compatible ? distances.compatible : distances.segregate;
            }
        };
    }

    /**
     * Validate container check digit (ISO 6346)
     */
    validateContainerCheckDigit(containerId) {
        if (!containerId || containerId.length !== 11) return false;
        
        const id = containerId.toUpperCase();
        const letters = id.substring(0, 4);
        const numbers = id.substring(4, 10);
        const checkDigit = parseInt(id.substring(10));
        
        // Convert letters to numbers (A=10, B=12, C=13, etc.)
        const letterValues = {
            'A': 10, 'B': 12, 'C': 13, 'D': 14, 'E': 15, 'F': 16, 'G': 17,
            'H': 18, 'I': 19, 'J': 20, 'K': 21, 'L': 23, 'M': 24, 'N': 25,
            'O': 26, 'P': 27, 'Q': 28, 'R': 29, 'S': 30, 'T': 31, 'U': 32,
            'V': 34, 'W': 35, 'X': 36, 'Y': 37, 'Z': 38
        };
        
        let sum = 0;
        const multipliers = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512];
        
        // Calculate for letters
        for (let i = 0; i < 4; i++) {
            sum += letterValues[letters[i]] * multipliers[i];
        }
        
        // Calculate for numbers
        for (let i = 0; i < 6; i++) {
            sum += parseInt(numbers[i]) * multipliers[i + 4];
        }
        
        const calculatedCheckDigit = sum % 11;
        return calculatedCheckDigit === checkDigit;
    }

    /**
     * Apply all relevant rules to a data set
     */
    validateDataSet(data, type = 'reefer') {
        const results = {
            valid: true,
            errors: [],
            warnings: [],
            statistics: {}
        };
        
        if (type === 'reefer') {
            // Validate container IDs
            const containerErrors = [];
            const duplicates = this.rules.containerValidation.findDuplicates(
                data.map(item => item.containerId)
            );
            
            if (duplicates.length > 0) {
                results.warnings.push(`Duplicate containers found: ${duplicates.join(', ')}`);
            }
            
            // Validate temperatures
            data.forEach((item, index) => {
                if (item.setTemp !== undefined && item.actualTemp !== undefined) {
                    const tempValidation = this.rules.temperatureValidation.validateMismatch(
                        item.setTemp, item.actualTemp
                    );
                    
                    if (!tempValidation.valid) {
                        results.errors.push(`Row ${index + 1}: ${tempValidation.error}`);
                        results.valid = false;
                    }
                }
            });
            
            results.statistics = {
                totalContainers: data.length,
                duplicates: duplicates.length,
                temperatureMismatches: results.errors.length
            };
        }
        
        return results;
    }
}

module.exports = MaritimeRulesEngine;