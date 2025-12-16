/**
 * Smart Document Detector for Formatted Excel Files
 * Handles merged cells, page headers, and complex document structures
 */
class SmartDocumentDetector {
    /**
     * Analyze formatted Excel document and find actual data
     */
    static analyzeDocument(data, fileType) {
        if (!data || data.length === 0) {
            throw new Error(`No data found in ${fileType} file`);
        }

        console.log(`\n=== Smart Document Analysis for ${fileType.toUpperCase()} ===`);
        console.log(`Total rows: ${data.length}`);

        // Step 1: Find the actual header row
        const headerInfo = this.findHeaderRow(data, fileType);
        if (!headerInfo) {
            return { confidence: 0, method: 'smart_document', error: 'No data structure found' };
        }

        // Step 2: Detect columns based on headers and data
        const columns = this.detectColumnsFromData(data, headerInfo, fileType);
        
        // Step 3: Calculate confidence
        const confidence = this.calculateConfidence(columns, data, headerInfo);

        return {
            ...columns,
            confidence,
            method: 'smart_document',
            headerRow: headerInfo.headerRow,
            dataStartRow: headerInfo.dataStartRow
        };
    }

    /**
     * Find the actual header row in formatted documents
     */
    static findHeaderRow(data, fileType) {
        console.log(`Scanning for header row...`);
        
        let bestHeaderRow = -1;
        let dataStartRow = -1;
        
        // Scan through rows looking for patterns
        for (let i = 0; i < Math.min(30, data.length); i++) {
            const row = data[i] || [];
            const rowText = row.map(cell => this.normalizeCell(cell));
            
            // Skip empty rows
            if (rowText.every(cell => !cell)) continue;
            
            // Skip page headers/footers
            if (this.isPageHeader(rowText)) {
                console.log(`  Row ${i}: Page header/footer - skipping`);
                continue;
            }
            
            // Skip merged cell rows (all same value)
            if (this.isMergedCellRow(rowText)) {
                console.log(`  Row ${i}: Merged cells ("${rowText[0]}") - skipping`);
                continue;
            }
            
            // Look for container ID patterns in this row or next few rows
            const containerFound = this.scanForContainerData(data, i, 5);
            if (containerFound.found) {
                console.log(`  Row ${i}: Found container data at row ${containerFound.dataRow}`);
                bestHeaderRow = Math.max(0, containerFound.dataRow - 1); // Header is usually before data
                dataStartRow = containerFound.dataRow;
                break;
            }
            
            // Check if this row has header-like keywords
            const headerKeywords = this.countHeaderKeywords(rowText, fileType);
            if (headerKeywords > 0) {
                console.log(`  Row ${i}: Found ${headerKeywords} header keywords`);
                bestHeaderRow = i;
                dataStartRow = i + 1;
                break;
            }
        }
        
        if (bestHeaderRow === -1) {
            // Fallback: scan for any container data without clear headers
            const containerScan = this.scanForContainerData(data, 0, Math.min(50, data.length));
            if (containerScan.found) {
                console.log(`  Fallback: Using synthetic headers for data at row ${containerScan.dataRow}`);
                return {
                    headerRow: containerScan.dataRow,
                    dataStartRow: containerScan.dataRow,
                    headers: (data[containerScan.dataRow] || []).map((_, idx) => `col_${idx}`),
                    synthetic: true
                };
            }
            return null;
        }
        
        const headers = (data[bestHeaderRow] || []).map(cell => this.normalizeCell(cell));
        console.log(`  Selected header row ${bestHeaderRow}:`, headers.slice(0, 10));
        
        return {
            headerRow: bestHeaderRow,
            dataStartRow: dataStartRow,
            headers: headers,
            synthetic: false
        };
    }

    /**
     * Detect columns based on headers and data content
     */
    static detectColumnsFromData(data, headerInfo, fileType) {
        const { headers, dataStartRow } = headerInfo;
        const dataRows = data.slice(dataStartRow);
        
        console.log(`Analyzing ${dataRows.length} data rows...`);
        
        const result = {};
        
        // Find container ID column
        const containerCol = this.findContainerColumn(headers, dataRows);
        if (containerCol !== -1) {
            result.containerId = containerCol;
            console.log(`  Container ID column: ${containerCol} (${headers[containerCol]})`);
        }
        
        // Find temperature column
        const tempCol = this.findTemperatureColumn(headers, dataRows, fileType);
        if (tempCol !== -1) {
            if (fileType === 'check') {
                result.setTemp = tempCol;
                console.log(`  Set temperature column: ${tempCol} (${headers[tempCol]})`);
            } else {
                result.manifestTemp = tempCol;
                console.log(`  Manifest temperature column: ${tempCol} (${headers[tempCol]})`);
            }
        }
        
        // Find stowage column (for CT processing)
        const stowageCol = this.findStowageColumn(headers, dataRows);
        if (stowageCol !== -1) {
            result.stowage = stowageCol;
            console.log(`  Stowage column: ${stowageCol} (${headers[stowageCol]})`);
        }
        
        return result;
    }

    /**
     * Find container ID column by analyzing data patterns
     */
    static findContainerColumn(headers, dataRows) {
        let bestCol = -1;
        let bestScore = 0;
        
        for (let col = 0; col < headers.length; col++) {
            const header = headers[col] || '';
            let score = 0;
            
            // Header-based scoring
            if (/container|cntr|cont|id|number|no\b|box|unit|equipment/i.test(header)) {
                score += 0.3;
            }
            
            // Data-based scoring
            let containerCount = 0;
            let totalNonEmpty = 0;
            
            for (let row = 0; row < Math.min(100, dataRows.length); row++) {
                const cell = this.normalizeCell(dataRows[row]?.[col]);
                if (!cell) continue;
                
                totalNonEmpty++;
                
                // Check for container ID pattern: 4 letters + 7 digits
                if (/^[A-Z]{4}\d{7}$/.test(cell.toUpperCase())) {
                    containerCount++;
                }
            }
            
            if (totalNonEmpty > 0) {
                const dataScore = containerCount / totalNonEmpty;
                score += dataScore;
                
                if (dataScore > 0.5) { // More than 50% valid container IDs
                    console.log(`    Col ${col}: ${containerCount}/${totalNonEmpty} container IDs (${(dataScore * 100).toFixed(1)}%)`);
                }
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestCol = col;
            }
        }
        
        return bestScore > 0.3 ? bestCol : -1;
    }

    /**
     * Find temperature column by analyzing data patterns
     */
    static findTemperatureColumn(headers, dataRows, fileType) {
        let bestCol = -1;
        let bestScore = 0;
        
        const tempKeywords = fileType === 'check' 
            ? ['set', 'target', 'required', 'temp', 'temperature', '°c', 'celsius']
            : ['actual', 'manifest', 'current', 'temp', 'temperature', '°c', 'celsius', 'probe'];
        
        for (let col = 0; col < headers.length; col++) {
            const header = headers[col] || '';
            let score = 0;
            
            // Header-based scoring
            for (const keyword of tempKeywords) {
                if (header.toLowerCase().includes(keyword)) {
                    score += 0.3;
                    break;
                }
            }
            
            // Data-based scoring
            let tempCount = 0;
            let totalNonEmpty = 0;
            let hasTemperatureFormat = 0; // Count cells with "C" suffix or negative values
            
            for (let row = 0; row < Math.min(100, dataRows.length); row++) {
                const cell = this.normalizeCell(dataRows[row]?.[col]);
                if (!cell) continue;
                
                totalNonEmpty++;
                
                // Check for temperature range: -50 to +60°C
                const num = parseFloat(cell);
                if (!isNaN(num) && num >= -50 && num <= 60) {
                    tempCount++;
                    
                    // Bonus for temperature-like formatting
                    const cellStr = cell.toString().toUpperCase();
                    if (cellStr.includes(' C') || cellStr.includes('°C') || cellStr.includes('DEG')) {
                        hasTemperatureFormat++;
                    }
                    // Bonus for negative values (common in reefer temps)
                    if (num < 0) {
                        hasTemperatureFormat += 0.5;
                    }
                }
            }
            
            if (totalNonEmpty > 0) {
                const dataScore = tempCount / totalNonEmpty;
                const formatScore = hasTemperatureFormat / totalNonEmpty;
                
                // Combine data score with format score, giving high weight to temperature formatting
                score += dataScore + (formatScore * 2); // Temperature format gets double weight
                
                if (dataScore > 0.3) { // More than 30% valid temperatures
                    console.log(`    Col ${col}: ${tempCount}/${totalNonEmpty} temperatures (${(dataScore * 100).toFixed(1)}%) [format: ${(formatScore * 100).toFixed(1)}%, total score: ${score.toFixed(2)}]`);
                    
                    // Debug: show first few temperature values for best columns
                    if (dataScore >= 0.8) {
                        console.log(`      Sample values: ${dataRows.slice(0, 5).map(row => row?.[col]).filter(v => v !== undefined && v !== null && v !== '').join(', ')}`);
                    }
                }
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestCol = col;
            }
        }
        
        console.log(`  Selected temperature column ${bestCol} with score ${bestScore.toFixed(2)}`);
        return bestScore > 0.2 ? bestCol : -1;
    }

    /**
     * Find stowage column by analyzing data patterns
     */
    static findStowageColumn(headers, dataRows) {
        let bestCol = -1;
        let bestScore = 0;
        
        for (let col = 0; col < headers.length; col++) {
            const header = headers[col] || '';
            let score = 0;
            
            // Header-based scoring
            if (/stowage|position|location|bay|row|tier|hold|deck|slot/i.test(header)) {
                score += 0.3;
            }
            
            // Data-based scoring
            let stowageCount = 0;
            let totalNonEmpty = 0;
            
            for (let row = 0; row < Math.min(100, dataRows.length); row++) {
                const cell = this.normalizeCell(dataRows[row]?.[col]);
                if (!cell) continue;
                
                totalNonEmpty++;
                
                // Check for stowage patterns: BBRRTT format
                if (/^\d{2,3}[\.\s]?\d{2}[\.\s]?\d{2}$|^\d{6}$/.test(cell)) {
                    stowageCount++;
                }
            }
            
            if (totalNonEmpty > 0) {
                const dataScore = stowageCount / totalNonEmpty;
                score += dataScore;
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestCol = col;
            }
        }
        
        return bestScore > 0.2 ? bestCol : -1;
    }

    /**
     * Helper methods
     */
    static normalizeCell(cell) {
        if (cell === null || cell === undefined) return '';
        return String(cell).trim();
    }

    static isPageHeader(rowText) {
        const text = rowText.join(' ').toLowerCase();
        return text.includes('page') && text.includes('of') ||
               text.includes('gmt') ||
               text.includes('standard time') ||
               text.match(/\d{4}-\d{2}-\d{2}/) ||
               text.match(/\w{3}\s+\w{3}\s+\d{2}\s+\d{4}/);
    }

    static isMergedCellRow(rowText) {
        const nonEmpty = rowText.filter(cell => cell);
        if (nonEmpty.length === 0) return false;
        const unique = [...new Set(nonEmpty)];
        return unique.length === 1 && nonEmpty.length > 3;
    }

    static countHeaderKeywords(rowText, fileType) {
        let count = 0;
        const text = rowText.join(' ').toLowerCase();
        
        const keywords = [
            'container', 'cntr', 'id', 'number', 'temp', 'temperature',
            'stowage', 'position', 'cargo', 'type', 'weight'
        ];
        
        if (fileType === 'check') keywords.push('set', 'target', 'required');
        if (fileType === 'manifest') keywords.push('actual', 'manifest', 'current');
        
        for (const keyword of keywords) {
            if (text.includes(keyword)) count++;
        }
        
        return count;
    }

    static scanForContainerData(data, startRow, maxRows) {
        for (let i = startRow; i < Math.min(startRow + maxRows, data.length); i++) {
            const row = data[i] || [];
            
            for (let j = 0; j < row.length; j++) {
                const cell = this.normalizeCell(row[j]);
                if (/^[A-Z]{4}\d{7}$/.test(cell.toUpperCase())) {
                    return { found: true, dataRow: i, column: j, containerId: cell };
                }
            }
        }
        
        return { found: false };
    }

    static calculateConfidence(columns, data, headerInfo) {
        let confidence = 0;
        let factors = 0;
        
        if (columns.containerId !== undefined) {
            confidence += 0.5;
            factors++;
        }
        
        if (columns.setTemp !== undefined || columns.manifestTemp !== undefined) {
            confidence += 0.3;
            factors++;
        }
        
        if (columns.stowage !== undefined) {
            confidence += 0.2;
            factors++;
        }
        
        // Bonus for non-synthetic headers
        if (!headerInfo.synthetic) {
            confidence += 0.1;
        }
        
        return Math.min(confidence, 1.0);
    }
}

module.exports = SmartDocumentDetector;