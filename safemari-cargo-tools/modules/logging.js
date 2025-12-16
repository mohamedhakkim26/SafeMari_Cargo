const sqlite3 = require('sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Local Logging System
 * Manages SQLite database for storing application activity logs
 */
class LoggingSystem {
    constructor() {
        this.dbPath = null;
        this.db = null;
        this.initialized = false;
        this.setupDatabase();
    }

    /**
     * Initialize SQLite database
     */
    async setupDatabase() {
        try {
            // Ensure storage directory exists
            const storageDir = path.join(os.homedir(), 'AppData', 'Local', 'SafemariCargoTools');
            if (!fs.existsSync(storageDir)) {
                fs.mkdirSync(storageDir, { recursive: true });
            }

            this.dbPath = path.join(storageDir, 'logs.db');

            // Initialize database
            this.db = new sqlite3.Database(this.dbPath);

            // Create tables if they don't exist
            await this.createTables();
            
            this.initialized = true;
            console.log('Logging system initialized successfully');

        } catch (error) {
            console.error('Failed to initialize logging system:', error);
            throw error;
        }
    }

    /**
     * Create database tables
     */
    createTables() {
        return new Promise((resolve, reject) => {
            const createTableSQL = `
                CREATE TABLE IF NOT EXISTS activity_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    username TEXT,
                    module TEXT NOT NULL,
                    fileA TEXT,
                    fileB TEXT,
                    result_summary TEXT,
                    machine_id_hash TEXT,
                    license_days_remaining INTEGER,
                    operation_duration INTEGER,
                    success BOOLEAN NOT NULL,
                    error_message TEXT,
                    additional_data TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `;

            this.db.run(createTableSQL, (error) => {
                if (error) {
                    console.error('Failed to create logs table:', error);
                    reject(error);
                } else {
                    console.log('Logs table created or verified successfully');
                    resolve();
                }
            });
        });
    }

    /**
     * Add a log entry
     * @param {Object} logData - Log data to insert
     */
    async addLog(logData) {
        if (!this.initialized) {
            console.warn('Logging system not initialized, skipping log entry');
            return { success: false, error: 'Logging system not initialized' };
        }

        try {
            const {
                username,
                module,
                fileA = null,
                fileB = null,
                resultSummary = null,
                machineId = null,
                licenseDaysRemaining = null,
                operationDuration = null,
                success = true,
                errorMessage = null,
                additionalData = null
            } = logData;

            // Hash machine ID for privacy
            const machineIdHash = machineId ? this.hashMachineId(machineId) : null;

            // Serialize additional data
            const additionalDataString = additionalData ? JSON.stringify(additionalData) : null;

            const insertSQL = `
                INSERT INTO activity_logs (
                    timestamp, username, module, fileA, fileB, 
                    result_summary, machine_id_hash, license_days_remaining,
                    operation_duration, success, error_message, additional_data
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const timestamp = new Date().toISOString();

            return new Promise((resolve) => {
                this.db.run(insertSQL, [
                    timestamp,
                    username,
                    module,
                    fileA,
                    fileB,
                    resultSummary,
                    machineIdHash,
                    licenseDaysRemaining,
                    operationDuration,
                    success ? 1 : 0,
                    errorMessage,
                    additionalDataString
                ], function(error) {
                    if (error) {
                        console.error('Failed to insert log entry:', error);
                        resolve({ success: false, error: error.message });
                    } else {
                        console.log('Log entry added successfully, ID:', this.lastID);
                        resolve({ success: true, logId: this.lastID });
                    }
                });
            });

        } catch (error) {
            console.error('Error adding log entry:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get logs with optional filtering
     * @param {Object} filters - Filter options
     */
    async getLogs(filters = {}) {
        if (!this.initialized) {
            return { success: false, error: 'Logging system not initialized' };
        }

        try {
            const {
                module = null,
                startDate = null,
                endDate = null,
                success = null,
                limit = 100,
                offset = 0
            } = filters;

            let query = 'SELECT * FROM activity_logs WHERE 1=1';
            const params = [];

            // Apply filters
            if (module) {
                query += ' AND module = ?';
                params.push(module);
            }

            if (startDate) {
                query += ' AND date(timestamp) >= date(?)';
                params.push(startDate);
            }

            if (endDate) {
                query += ' AND date(timestamp) <= date(?)';
                params.push(endDate);
            }

            if (success !== null) {
                query += ' AND success = ?';
                params.push(success ? 1 : 0);
            }

            // Order by most recent first
            query += ' ORDER BY timestamp DESC';

            // Apply limit and offset
            query += ' LIMIT ? OFFSET ?';
            params.push(limit, offset);

            return new Promise((resolve) => {
                this.db.all(query, params, (error, rows) => {
                    if (error) {
                        console.error('Failed to retrieve logs:', error);
                        resolve({ success: false, error: error.message });
                    } else {
                        // Process rows to parse additional data
                        const processedRows = rows.map(row => ({
                            ...row,
                            success: row.success === 1,
                            additional_data: row.additional_data ? 
                                this.safeJSONParse(row.additional_data) : null
                        }));

                        resolve({ 
                            success: true, 
                            logs: processedRows,
                            count: processedRows.length
                        });
                    }
                });
            });

        } catch (error) {
            console.error('Error getting logs:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get log statistics
     */
    async getLogStatistics() {
        if (!this.initialized) {
            return { success: false, error: 'Logging system not initialized' };
        }

        try {
            const queries = {
                total: 'SELECT COUNT(*) as count FROM activity_logs',
                byModule: `
                    SELECT module, COUNT(*) as count 
                    FROM activity_logs 
                    GROUP BY module 
                    ORDER BY count DESC
                `,
                recent: `
                    SELECT COUNT(*) as count 
                    FROM activity_logs 
                    WHERE date(timestamp) >= date('now', '-7 days')
                `,
                successful: 'SELECT COUNT(*) as count FROM activity_logs WHERE success = 1',
                failed: 'SELECT COUNT(*) as count FROM activity_logs WHERE success = 0'
            };

            const stats = {};

            for (const [key, query] of Object.entries(queries)) {
                const result = await new Promise((resolve) => {
                    this.db.all(query, (error, rows) => {
                        if (error) {
                            console.error(`Failed to get ${key} stats:`, error);
                            resolve(null);
                        } else {
                            resolve(rows);
                        }
                    });
                });

                if (result) {
                    if (key === 'byModule') {
                        stats[key] = result;
                    } else {
                        stats[key] = result[0]?.count || 0;
                    }
                }
            }

            return { success: true, statistics: stats };

        } catch (error) {
            console.error('Error getting log statistics:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Export logs to file
     * @param {string} outputPath - Output file path
     * @param {Object} filters - Filter options
     */
    async exportLogs(outputPath, filters = {}) {
        try {
            const logsResult = await this.getLogs({ ...filters, limit: 10000 });
            
            if (!logsResult.success) {
                return logsResult;
            }

            const logs = logsResult.logs;

            if (outputPath.toLowerCase().endsWith('.json')) {
                // Export as JSON
                fs.writeFileSync(outputPath, JSON.stringify(logs, null, 2));
            } else {
                // Export as CSV
                const csvContent = this.convertLogsToCSV(logs);
                fs.writeFileSync(outputPath, csvContent);
            }

            return {
                success: true,
                outputPath: outputPath,
                exportedCount: logs.length
            };

        } catch (error) {
            console.error('Error exporting logs:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Convert logs to CSV format
     */
    convertLogsToCSV(logs) {
        if (logs.length === 0) {
            return 'No logs to export';
        }

        const headers = [
            'ID', 'Timestamp', 'Username', 'Module', 'File A', 'File B',
            'Result Summary', 'Operation Duration', 'Success', 'Error Message'
        ];

        const csvRows = [headers.join(',')];

        logs.forEach(log => {
            const row = [
                log.id,
                this.escapeCsvValue(log.timestamp),
                this.escapeCsvValue(log.username),
                this.escapeCsvValue(log.module),
                this.escapeCsvValue(log.fileA),
                this.escapeCsvValue(log.fileB),
                this.escapeCsvValue(log.result_summary),
                log.operation_duration || '',
                log.success ? 'Yes' : 'No',
                this.escapeCsvValue(log.error_message)
            ];
            csvRows.push(row.join(','));
        });

        return csvRows.join('\n');
    }

    /**
     * Escape CSV values
     */
    escapeCsvValue(value) {
        if (value === null || value === undefined) {
            return '';
        }
        
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
        }
        
        return stringValue;
    }

    /**
     * Clear old logs (older than specified days)
     * @param {number} daysToKeep - Number of days to keep logs
     */
    async clearOldLogs(daysToKeep = 90) {
        if (!this.initialized) {
            return { success: false, error: 'Logging system not initialized' };
        }

        try {
            const deleteSQL = `
                DELETE FROM activity_logs 
                WHERE datetime(timestamp) < datetime('now', '-${daysToKeep} days')
            `;

            return new Promise((resolve) => {
                this.db.run(deleteSQL, function(error) {
                    if (error) {
                        console.error('Failed to clear old logs:', error);
                        resolve({ success: false, error: error.message });
                    } else {
                        console.log(`Cleared ${this.changes} old log entries`);
                        resolve({ 
                            success: true, 
                            deletedCount: this.changes 
                        });
                    }
                });
            });

        } catch (error) {
            console.error('Error clearing old logs:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get database info
     */
    async getDatabaseInfo() {
        if (!this.initialized) {
            return { success: false, error: 'Logging system not initialized' };
        }

        try {
            const stats = fs.statSync(this.dbPath);
            
            return {
                success: true,
                info: {
                    path: this.dbPath,
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime
                }
            };

        } catch (error) {
            console.error('Error getting database info:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Helper methods
     */
    hashMachineId(machineId) {
        return crypto
            .createHash('sha256')
            .update(machineId)
            .digest('hex')
            .substring(0, 16)
            .toUpperCase();
    }

    safeJSONParse(jsonString) {
        try {
            return JSON.parse(jsonString);
        } catch {
            return null;
        }
    }

    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close((error) => {
                if (error) {
                    console.error('Error closing database:', error);
                } else {
                    console.log('Database connection closed');
                }
            });
            this.initialized = false;
        }
    }

    /**
     * Helper method to log cargo operations
     */
    async logCargoOperation(operationType, files, results, username, machineId, licenseDays, duration) {
        const logData = {
            username: username,
            module: operationType,
            fileA: files.fileA || null,
            fileB: files.fileB || null,
            resultSummary: this.formatResultSummary(results),
            machineId: machineId,
            licenseDaysRemaining: licenseDays,
            operationDuration: duration,
            success: results.success,
            errorMessage: results.success ? null : results.error,
            additionalData: {
                resultData: results.success ? results.summary : null,
                fileNames: {
                    fileA: files.fileA ? path.basename(files.fileA) : null,
                    fileB: files.fileB ? path.basename(files.fileB) : null
                }
            }
        };

        return await this.addLog(logData);
    }

    /**
     * Format result summary for logging
     */
    formatResultSummary(results) {
        if (!results.success) {
            return `Operation failed: ${results.error}`;
        }

        if (results.summary) {
            const summary = results.summary;
            switch (results.module || 'unknown') {
                case 'reefer':
                    return `Processed ${summary.totalContainers} containers, ${summary.temperatureMatches} matches, ${summary.temperatureMismatches} mismatches`;
                case 'ct':
                    return `Sorted ${summary.processedContainers} containers into ${summary.ctBlockCount} CT blocks`;
                case 'dg':
                    return `Validated ${summary.pdfContainers} PDF containers vs ${summary.excelContainers} Excel containers, ${summary.matches} matches`;
                case 'compare':
                    return `Compared ${summary.listACount} vs ${summary.listBCount} containers, ${summary.commonCount} common`;
                default:
                    return 'Operation completed successfully';
            }
        }

        return 'Operation completed successfully';
    }
}

module.exports = LoggingSystem;