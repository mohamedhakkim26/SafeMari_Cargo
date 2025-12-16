const mammoth = require('mammoth');
const fs = require('fs');

async function debugDOCX() {
    const filePath = "C:\\Users\\KAVIN KUMAR\\Downloads\\Reefer and Heated Manifest MSC SERENA NX547R RODMAN.docx";
    
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const result = await mammoth.convertToHtml({ buffer: dataBuffer });
        
        console.log('=== RAW HTML OUTPUT ===');
        console.log(result.value.substring(0, 2000)); // First 2000 chars
        console.log('\n=== SEARCHING FOR PATTERNS ===');
        
        // Check for different patterns
        const manifestMatches = result.value.match(/Reefer and Heated Manifest/gi);
        console.log('Manifest sections found:', manifestMatches ? manifestMatches.length : 0);
        
        const tableMatches = result.value.match(/<table[^>]*>/gi);
        console.log('Tables found:', tableMatches ? tableMatches.length : 0);
        
        const containerMatches = result.value.match(/[A-Z]{4}\d{7}/g);
        console.log('Container IDs found:', containerMatches ? containerMatches.length : 0);
        console.log('Sample containers:', containerMatches ? containerMatches.slice(0, 5) : []);
        
        const tempMatches = result.value.match(/-?\d+(?:\.\d+)?\s*C/gi);
        console.log('Temperature patterns found:', tempMatches ? tempMatches.length : 0);
        console.log('Sample temperatures:', tempMatches ? tempMatches.slice(0, 5) : []);
        
    } catch (error) {
        console.error('Debug failed:', error);
    }
}

debugDOCX();