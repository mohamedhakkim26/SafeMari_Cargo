const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Generate a new cryptographically secure private secret for HMAC signing
 */
function generatePrivateSecret() {
    // Generate 64 bytes of random data
    const randomBytes = crypto.randomBytes(64);
    
    // Convert to base64 for storage
    const privateSecret = randomBytes.toString('base64');
    
    const config = {
        private_secret: privateSecret,
        version: '1.0.0',
        created_at: new Date().toISOString().split('T')[0],
        description: 'Private HMAC secret for SafeMari Cargo Tools license generation - NEVER share this file',
        warning: '🔥 CRITICAL: This private secret must NEVER be included in the SafeMari Cargo Tools distribution',
        entropy_bytes: 64,
        algorithm: 'HMAC-SHA256'
    };
    
    return config;
}

/**
 * Save new private secret to config file
 */
function savePrivateSecret() {
    const configDir = path.join(__dirname, '..', 'generator', 'config');
    const configPath = path.join(configDir, 'private_secret.json');
    const backupPath = path.join(configDir, `private_secret_backup_${Date.now()}.json`);
    
    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
    
    // Backup existing secret if it exists
    if (fs.existsSync(configPath)) {
        console.log('⚠️  Backing up existing secret...');
        fs.copyFileSync(configPath, backupPath);
        console.log(`   Backup saved to: ${backupPath}`);
    }
    
    // Generate and save new secret
    const newSecret = generatePrivateSecret();
    fs.writeFileSync(configPath, JSON.stringify(newSecret, null, 2));
    
    console.log('\n✅ New private secret generated!');
    console.log(`   Saved to: ${configPath}`);
    console.log(`   Secret length: ${newSecret.private_secret.length} characters`);
    console.log('\n🔒 IMPORTANT SECURITY NOTES:');
    console.log('   • Keep this file absolutely secure');
    console.log('   • Never commit to version control');
    console.log('   • Never include in SafeMari Cargo Tools distribution');
    console.log('   • Store backups in secure location only');
    
    return configPath;
}

// Run if called directly
if (require.main === module) {
    console.log('🔐 SafeMari Private Secret Generator\n');
    
    try {
        savePrivateSecret();
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to generate private secret:');
        console.error(`   ${error.message}`);
        process.exit(1);
    }
}

module.exports = {
    generatePrivateSecret,
    savePrivateSecret
};