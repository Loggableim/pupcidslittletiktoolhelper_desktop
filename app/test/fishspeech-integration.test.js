/**
 * Test suite for Fish Speech 1.5 Integration
 * Verifies that Fish Speech engine is properly integrated into TTS system
 */

const assert = require('assert');
const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');

console.log('🧪 Running Fish Speech Integration Tests...\n');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (error) {
        console.error(`✗ ${name}`);
        console.error(`  Error: ${error.message}`);
        failed++;
    }
}

// Mock logger for testing
const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {}
};

// Test 1: Fish Speech engine can be instantiated with API key
runTest('Fish Speech engine should initialize with valid API key', () => {
    const engine = new FishSpeechEngine('test-api-key', mockLogger);
    assert(engine !== null, 'Engine should be created');
    assert(engine.apiKey === 'test-api-key', 'API key should be set');
});

// Test 2: Fish Speech engine rejects empty API key
runTest('Fish Speech engine should reject empty API key', () => {
    try {
        new FishSpeechEngine('', mockLogger);
        throw new Error('Should have thrown error for empty API key');
    } catch (error) {
        assert(error.message.includes('required'), 'Error should mention API key is required');
    }
});

// Test 3: Fish Speech has static voices method
runTest('Fish Speech should have getVoices static method', () => {
    const voices = FishSpeechEngine.getVoices();
    assert(voices !== null, 'Voices should exist');
    assert(typeof voices === 'object', 'Voices should be an object');
    assert(Object.keys(voices).length > 0, 'Should have at least one voice');
});

// Test 4: Fish Speech voices include expected languages
runTest('Fish Speech should include English, German, Chinese voices', () => {
    const voices = FishSpeechEngine.getVoices();
    const voiceIds = Object.keys(voices);
    
    const hasEnglish = voiceIds.some(id => id.includes('en'));
    const hasGerman = voiceIds.some(id => id.includes('de'));
    const hasChinese = voiceIds.some(id => id.includes('zh'));
    
    assert(hasEnglish, 'Should have English voices');
    assert(hasGerman, 'Should have German voices');
    assert(hasChinese, 'Should have Chinese voices');
});

// Test 5: Fish Speech getDefaultVoiceForLanguage works
runTest('Fish Speech should return default voices for languages', () => {
    const enVoice = FishSpeechEngine.getDefaultVoiceForLanguage('en');
    const deVoice = FishSpeechEngine.getDefaultVoiceForLanguage('de');
    const zhVoice = FishSpeechEngine.getDefaultVoiceForLanguage('zh');
    
    assert(enVoice && enVoice.includes('en'), 'English default voice should exist');
    assert(deVoice && deVoice.includes('de'), 'German default voice should exist');
    assert(zhVoice && zhVoice.includes('zh'), 'Chinese default voice should exist');
});

// Test 6: Fish Speech engine has async getVoices method
runTest('Fish Speech instance should have async getVoices method', async () => {
    const engine = new FishSpeechEngine('test-api-key', mockLogger);
    const voices = await engine.getVoices();
    assert(voices !== null, 'Async getVoices should return voices');
    assert(typeof voices === 'object', 'Async getVoices should return object');
});

// Test 7: Fish Speech engine has performance mode settings
runTest('Fish Speech should support performance modes', () => {
    const fastEngine = new FishSpeechEngine('test-key', mockLogger, { performanceMode: 'fast' });
    const balancedEngine = new FishSpeechEngine('test-key', mockLogger, { performanceMode: 'balanced' });
    const qualityEngine = new FishSpeechEngine('test-key', mockLogger, { performanceMode: 'quality' });
    
    assert(fastEngine.performanceMode === 'fast', 'Fast mode should be set');
    assert(balancedEngine.performanceMode === 'balanced', 'Balanced mode should be set');
    assert(qualityEngine.performanceMode === 'quality', 'Quality mode should be set');
});

// Test 8: Fish Speech engine has correct API configuration
runTest('Fish Speech should have correct API endpoint and model', () => {
    const engine = new FishSpeechEngine('test-key', mockLogger);
    assert(engine.apiBaseUrl === 'https://api.siliconflow.cn/v1', 'API base URL should be correct');
    assert(engine.apiSynthesisUrl === 'https://api.siliconflow.cn/v1/audio/speech', 'Synthesis URL should be correct');
    assert(engine.model === 'fishaudio/fish-speech-1.5', 'Model should be correct');
});

// Test 9: Fish Speech engine has setApiKey method
runTest('Fish Speech should allow updating API key', () => {
    const engine = new FishSpeechEngine('test-key', mockLogger);
    engine.setApiKey('new-key');
    assert(engine.apiKey === 'new-key', 'API key should be updated');
});

// Test 10: Fish Speech setApiKey rejects empty key
runTest('Fish Speech should reject empty API key in setApiKey', () => {
    const engine = new FishSpeechEngine('test-key', mockLogger);
    try {
        engine.setApiKey('');
        throw new Error('Should have thrown error for empty API key');
    } catch (error) {
        assert(error.message.includes('non-empty'), 'Error should mention non-empty string requirement');
    }
});

// Print summary
console.log(`\n📊 Test Summary:`);
console.log(`   Passed: ${passed}`);
console.log(`   Failed: ${failed}`);
console.log(`   Total:  ${passed + failed}`);

if (failed > 0) {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
} else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
}
