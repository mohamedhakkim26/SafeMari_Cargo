const ReeferChecker = require('./safemari-cargo-tools/modules/reefer.js');

async function testDOCXReefer() {
    console.log('Testing DOCX Reefer Processing...\n');
    
    const checker = new ReeferChecker();
    
    const checkFile = "PAITA ALL REFERS.xlsx"; // Excel CHECK file
    const manifestFile = "C:\\Users\\KAVIN KUMAR\\Downloads\\Reefer and Heated Manifest MSC SERENA NX547R RODMAN.docx"; // DOCX MANIFEST file
    
    try {
        console.log('=== TESTING DOCX MANIFEST LOADING ===');
        
        // Test DOCX loading directly
        const docxData = await checker.loadFile(manifestFile);
        console.log('DOCX Sheets found:', Object.keys(docxData.Sheets));
        
        // Show sample data from each sheet
        Object.entries(docxData.Sheets).forEach(([sheetName, rows]) => {
            console.log(`\n--- ${sheetName} ---`);
            console.log(`Total rows: ${rows.length}`);
            
            // Show first few rows
            rows.slice(0, 5).forEach((row, index) => {
                console.log(`Row ${index}:`, row.slice(0, 8)); // First 8 columns
            });
        });
        
        console.log('\n=== TESTING CONTAINER DETECTION ===');
        
        // Test container detection on DOCX data
        Object.entries(docxData.Sheets).forEach(([sheetName, rows]) => {
            console.log(`\nAnalyzing ${sheetName}:`);
            
            let containerCount = 0;
            let tempCount = 0;
            
            rows.forEach((row, rowIndex) => {
                row.forEach((cell, colIndex) => {
                    if (cell && checker.detectContainerId(cell)) {
                        console.log(`  Container found at Row ${rowIndex}, Col ${colIndex}: ${cell}`);
                        containerCount++;
                    }
                    
                    if (cell && checker.detectTempNumber(cell) !== null) {
                        console.log(`  Temperature found at Row ${rowIndex}, Col ${colIndex}: ${cell} -> ${checker.detectTempNumber(cell)}°C`);
                        tempCount++;
                    }
                });
            });
            
            console.log(`  Total containers: ${containerCount}, Total temperatures: ${tempCount}`);
        });
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testDOCXReefer();