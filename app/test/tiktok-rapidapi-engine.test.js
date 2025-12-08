/**
 * Test suite for TikTok RapidAPI TTS Engine
 * Tests the basic functionality of the TikTok RapidAPI engine
 */

const assert = require('assert');
const TikTokRapidAPIEngine = require('../plugins/tts/engines/tiktok-rapidapi-engine');

// Mock logger
const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
};

console.log('🧪 Running TikTok RapidAPI Engine Tests...\n');

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

// Test 1: Engine initialization
runTest('TikTok RapidAPI Engine should initialize with API key', () => {
    const engine = new TikTokRapidAPIEngine('test-api-key', mockLogger);
    assert.strictEqual(engine.apiKey, 'test-api-key');
    assert.strictEqual(engine.apiHost, 'tts-tiktok.p.rapidapi.com');
    assert.strictEqual(engine.apiUrl, 'https://tts-tiktok.p.rapidapi.com/tts');
});

// Test 2: Engine should have predefined voices
runTest('TikTok RapidAPI Engine should have predefined voices', () => {
    const voices = TikTokRapidAPIEngine.getVoices();
    assert.ok(voices);
    assert.ok(Object.keys(voices).length > 0);
    assert.ok(voices['en_us_001']);
    assert.ok(voices['de_002']);
});

// Test 3: Engine should return German default voice
runTest('TikTok RapidAPI Engine should return German default voice', () => {
    const voice = TikTokRapidAPIEngine.getDefaultVoiceForLanguage('de');
    assert.strictEqual(voice, 'de_002');
});

// Test 4: Engine should return English default voice
runTest('TikTok RapidAPI Engine should return English default voice', () => {
    const voice = TikTokRapidAPIEngine.getDefaultVoiceForLanguage('en');
    assert.strictEqual(voice, 'en_us_001');
});

// Test 5: Engine should fallback to English for unknown language
runTest('TikTok RapidAPI Engine should fallback to English for unknown language', () => {
    const voice = TikTokRapidAPIEngine.getDefaultVoiceForLanguage('xyz');
    assert.strictEqual(voice, 'en_us_001');
});

// Test 6: Engine should have various language voices
runTest('TikTok RapidAPI Engine should have voices for multiple languages', () => {
    const voices = TikTokRapidAPIEngine.getVoices();
    
    // Check for German voices
    assert.ok(voices['de_001']);
    assert.ok(voices['de_002']);
    
    // Check for English voices
    assert.ok(voices['en_us_001']);
    assert.ok(voices['en_uk_001']);
    
    // Check for other languages
    assert.ok(voices['es_002']); // Spanish
    assert.ok(voices['fr_001']); // French
    assert.ok(voices['jp_001']); // Japanese
    assert.ok(voices['kr_003']); // Korean
});

// Test 7: Engine should have character voices
runTest('TikTok RapidAPI Engine should have character voices', () => {
    const voices = TikTokRapidAPIEngine.getVoices();
    
    assert.ok(voices['en_us_ghostface']);
    assert.ok(voices['en_us_stormtrooper']);
    assert.ok(voices['en_us_c3po']);
    assert.strictEqual(voices['en_us_ghostface'].style, 'character');
});

// Test 8: Voice objects should have correct structure
runTest('Voice objects should contain required properties', () => {
    const voices = TikTokRapidAPIEngine.getVoices();
    const testVoice = voices['en_us_001'];
    
    assert.ok(testVoice.name);
    assert.ok(testVoice.lang);
    assert.ok(testVoice.gender);
    assert.ok(testVoice.style);
    assert.strictEqual(testVoice.lang, 'en');
});

// Test 9: Performance modes should set correct timeouts
runTest('Performance modes should configure engine correctly', () => {
    const fastEngine = new TikTokRapidAPIEngine('test-key', mockLogger, { performanceMode: 'fast' });
    assert.strictEqual(fastEngine.timeout, 5000);
    assert.strictEqual(fastEngine.maxRetries, 1);
    
    const balancedEngine = new TikTokRapidAPIEngine('test-key', mockLogger, { performanceMode: 'balanced' });
    assert.strictEqual(balancedEngine.timeout, 10000);
    assert.strictEqual(balancedEngine.maxRetries, 2);
    
    const qualityEngine = new TikTokRapidAPIEngine('test-key', mockLogger, { performanceMode: 'quality' });
    assert.strictEqual(qualityEngine.timeout, 20000);
    assert.strictEqual(qualityEngine.maxRetries, 3);
});

// Test 10: Max text length should be defined
runTest('Engine should have max text length defined', () => {
    const engine = new TikTokRapidAPIEngine('test-key', mockLogger);
    assert.strictEqual(engine.maxTextLength, 300);
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Tests completed: ${passed + failed}`);
console.log(`✓ Passed: ${passed}`);
console.log(`✗ Failed: ${failed}`);
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
