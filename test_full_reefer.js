const ReeferChecker = require('./safemari-cargo-tools/modules/reefer.js');

async function testFullReeferProcess() {
    console.log('Testing Full Reefer Processing with DOCX...\n');
    
    const checker = new ReeferChecker();
    
    const checkFile = "C:\\Users\\KAVIN KUMAR\\Downloads\\PAITA ALL REFERS.xlsx"; // Excel CHECK file
    const manifestFile = "C:\\Users\\KAVIN KUMAR\\Downloads\\Reefer and Heated Manifest MSC SERENA NX547R RODMAN.docx"; // DOCX MANIFEST file
    
    try {
        const result = await checker.processReeferCheck({
            checkFilePath: checkFile,
            manifestFilePath: manifestFile
        });
        
        if (result.success) {
            console.log('=== PROCESSING SUCCESS ===');
            console.log('CHECK containers:', result.summary.totalCheck);
            console.log('MANIFEST containers:', result.summary.totalManifest);
            console.log('Found matches:', result.summary.found);
            console.log('Missing containers:', result.summary.missing);
            console.log('Temperature mismatches:', result.summary.mismatches);
            
            if (result.summary.mismatchList && result.summary.mismatchList.length > 0) {
                console.log('\nSample mismatches:');
                result.summary.mismatchList.slice(0, 5).forEach(m => {
                    console.log(`  ${m.id}: CHECK=${m.setT}°C vs MANIFEST=${m.manT}°C (diff=${m.diff.toFixed(2)}°C)`);
                });
            }
            
            if (result.summary.missingList && result.summary.missingList.length > 0) {
                console.log('\nSample missing containers:');
                console.log('  ', result.summary.missingList.slice(0, 10).join(', '));
            }
            
        } else {
            console.error('Processing failed:', result.error);
        }
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testFullReeferProcess();