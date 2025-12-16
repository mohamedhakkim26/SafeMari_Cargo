const ReeferChecker = require('./safemari-cargo-tools/modules/reefer.js');

console.log('🚀 Starting reefer check test...');

async function test() {
    const checker = new ReeferChecker();
    
    try {
        console.log('📁 Processing files...');
        
        const checkFile = 'C:\\Users\\KAVIN KUMAR\\Downloads\\PAITA ALL REFERS.xlsx';
        const manifestFile = 'C:\\Users\\KAVIN KUMAR\\Downloads\\Reefer and Heated Manifest - MSC SERENA NX547R PEPAI.xlsx';
        
        console.log('CHECK file:', checkFile);
        console.log('MANIFEST file:', manifestFile);
        
        const result = await checker.processReeferCheck({
            checkFilePath: checkFile,
            manifestFilePath: manifestFile
        });
        
        console.log('✅ Result received');
        
        if (result.success) {
            console.log('\n🎉 SUCCESS!');
            console.log('📊 Summary:');
            console.log('  - CHECK containers:', result.summary.totalCheck);
            console.log('  - MANIFEST containers:', result.summary.totalManifest);
            console.log('  - Matches found:', result.summary.found);
            console.log('  - Mismatches:', result.summary.mismatches);
            console.log('  - Missing:', result.summary.missing);
            console.log('  - Accuracy:', result.summary.accuracy + '%');
        } else {
            console.log('\n❌ FAILED:', result.error);
        }
    } catch (error) {
        console.log('\n💥 ERROR:', error.message);
        console.log('📍 Stack:', error.stack);
    }
}

test().then(() => {
    console.log('\n✨ Test completed');
}).catch(err => {
    console.log('\n💥 Test failed:', err.message);
});