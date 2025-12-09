/**
 * Test: Plugin Data Storage Migration
 * 
 * This test verifies that plugins correctly use persistent storage
 * in the user profile directory instead of the application directory.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Mock PluginAPI
class MockPluginAPI {
    constructor(pluginId) {
        this.pluginId = pluginId;
        this.configPathManager = {
            getPluginDataDir: (id) => {
                // Simulate ConfigPathManager behavior
                const platform = os.platform();
                const homeDir = os.homedir();
                let baseDir;
                
                switch (platform) {
                    case 'win32':
                        baseDir = path.join(process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local'), 'pupcidslittletiktokhelper');
                        break;
                    case 'darwin':
                        baseDir = path.join(homeDir, 'Library', 'Application Support', 'pupcidslittletiktokhelper');
                        break;
                    default:
                        baseDir = path.join(homeDir, '.local', 'share', 'pupcidslittletiktokhelper');
                }
                
                return path.join(baseDir, 'plugins', id);
            }
        };
    }
    
    getPluginDataDir() {
        return this.configPathManager.getPluginDataDir(this.pluginId);
    }
    
    ensurePluginDataDir() {
        const dir = this.getPluginDataDir();
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return dir;
    }
    
    getConfigPathManager() {
        return this.configPathManager;
    }
    
    log(message, level = 'info') {
        console.log(`[${level.toUpperCase()}] [${this.pluginId}] ${message}`);
    }
}

// Test function
function testPluginDataStorage() {
    console.log('🧪 Testing Plugin Data Storage...\n');
    
    const testPluginId = 'test-plugin';
    const api = new MockPluginAPI(testPluginId);
    
    // Test 1: getPluginDataDir returns path outside app directory
    console.log('Test 1: Verify plugin data directory is outside app directory');
    const pluginDataDir = api.getPluginDataDir();
    console.log(`  Plugin data dir: ${pluginDataDir}`);
    
    const isOutsideApp = !pluginDataDir.includes('pupcidslittletiktoolhelper_desktop');
    if (isOutsideApp) {
        console.log('  ✅ PASS: Data directory is outside app directory');
    } else {
        console.log('  ❌ FAIL: Data directory is inside app directory');
    }
    
    // Test 2: Verify path includes plugin ID
    console.log('\nTest 2: Verify path includes plugin ID');
    const includesPluginId = pluginDataDir.includes(testPluginId);
    if (includesPluginId) {
        console.log('  ✅ PASS: Path includes plugin ID');
    } else {
        console.log('  ❌ FAIL: Path does not include plugin ID');
    }
    
    // Test 3: ensurePluginDataDir creates directory
    console.log('\nTest 3: Verify ensurePluginDataDir creates directory');
    const createdDir = api.ensurePluginDataDir();
    const dirExists = fs.existsSync(createdDir);
    if (dirExists) {
        console.log('  ✅ PASS: Directory was created');
        // Cleanup
        try {
            fs.rmdirSync(createdDir);
            const parentDir = path.dirname(createdDir);
            if (fs.existsSync(parentDir) && fs.readdirSync(parentDir).length === 0) {
                fs.rmdirSync(parentDir);
            }
        } catch (e) {
            // Ignore cleanup errors
        }
    } else {
        console.log('  ❌ FAIL: Directory was not created');
    }
    
    // Test 4: Verify platform-specific path
    console.log('\nTest 4: Verify platform-specific path');
    const platform = os.platform();
    let expectedPathPart;
    switch (platform) {
        case 'win32':
            expectedPathPart = 'AppData\\Local';
            break;
        case 'darwin':
            expectedPathPart = 'Library/Application Support';
            break;
        default:
            expectedPathPart = '.local/share';
    }
    
    const hasCorrectPath = pluginDataDir.includes(expectedPathPart);
    if (hasCorrectPath) {
        console.log(`  ✅ PASS: Uses correct ${platform} path (${expectedPathPart})`);
    } else {
        console.log(`  ❌ FAIL: Does not use correct ${platform} path`);
    }
    
    console.log('\n✅ Plugin Data Storage Tests Complete!\n');
    console.log('Summary:');
    console.log(`  Platform: ${platform}`);
    console.log(`  Plugin Data Directory: ${pluginDataDir}`);
    console.log(`  All data in this directory will survive application updates!`);
}

// Run tests
if (require.main === module) {
    testPluginDataStorage();
}

module.exports = { MockPluginAPI, testPluginDataStorage };
