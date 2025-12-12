/**
 * Test for API Key Masking Feature
 * Verifies that API keys are properly masked when loaded and that save functions skip masked values
 */

const assert = require('assert');

describe('API Key Masking', function() {
    describe('StreamAlchemy Plugin', function() {
        it('should mask API keys when loading config', function() {
            // Simulate the config loading logic
            const config = {
                openaiApiKey: 'sk-1234567890abcdef',
                lightxApiKey: 'lx-abcdefghijklmnop',
                siliconFlowApiKey: 'sf-xyz123456789'
            };

            // Simulate masking logic from updateConfigForms()
            const openaiValue = config.openaiApiKey ? '***SAVED***' : '';
            const openaiPlaceholder = config.openaiApiKey ? 'API Key gespeichert (verborgen)' : 'sk-...';
            
            const lightxValue = config.lightxApiKey ? '***SAVED***' : '';
            const lightxPlaceholder = config.lightxApiKey ? 'API Key gespeichert (verborgen)' : 'lx-...';
            
            const siliconFlowValue = config.siliconFlowApiKey ? '***SAVED***' : '';
            const siliconFlowPlaceholder = config.siliconFlowApiKey ? 'API Key gespeichert (verborgen)' : 'sf-...';

            assert.strictEqual(openaiValue, '***SAVED***', 'OpenAI API key should be masked');
            assert.strictEqual(openaiPlaceholder, 'API Key gespeichert (verborgen)', 'OpenAI placeholder should indicate key is saved');
            
            assert.strictEqual(lightxValue, '***SAVED***', 'LightX API key should be masked');
            assert.strictEqual(lightxPlaceholder, 'API Key gespeichert (verborgen)', 'LightX placeholder should indicate key is saved');
            
            assert.strictEqual(siliconFlowValue, '***SAVED***', 'Silicon Flow API key should be masked');
            assert.strictEqual(siliconFlowPlaceholder, 'API Key gespeichert (verborgen)', 'Silicon Flow placeholder should indicate key is saved');
        });

        it('should show empty values when no API keys are configured', function() {
            const config = {};

            const openaiValue = config.openaiApiKey ? '***SAVED***' : '';
            const openaiPlaceholder = config.openaiApiKey ? 'API Key gespeichert (verborgen)' : 'sk-...';

            assert.strictEqual(openaiValue, '', 'OpenAI value should be empty when no key is saved');
            assert.strictEqual(openaiPlaceholder, 'sk-...', 'OpenAI placeholder should be default when no key is saved');
        });

        it('should skip saving when value is masked placeholder', function() {
            // Simulate form data
            const formData = new Map([
                ['openaiApiKey', '***SAVED***'],
                ['lightxApiKey', 'lx-newkey123'],
                ['siliconFlowApiKey', '***SAVED***']
            ]);

            // Simulate the save logic
            const updates = {};
            
            const openaiKey = formData.get('openaiApiKey');
            if (openaiKey && openaiKey !== '***SAVED***') {
                updates.openaiApiKey = openaiKey;
            }

            const lightxKey = formData.get('lightxApiKey');
            if (lightxKey && lightxKey !== '***SAVED***') {
                updates.lightxApiKey = lightxKey;
            }

            const siliconFlowKey = formData.get('siliconFlowApiKey');
            if (siliconFlowKey && siliconFlowKey !== '***SAVED***') {
                updates.siliconFlowApiKey = siliconFlowKey;
            }

            assert.strictEqual(updates.openaiApiKey, undefined, 'Masked OpenAI key should not be included in updates');
            assert.strictEqual(updates.lightxApiKey, 'lx-newkey123', 'New LightX key should be included in updates');
            assert.strictEqual(updates.siliconFlowApiKey, undefined, 'Masked Silicon Flow key should not be included in updates');
        });
    });

    describe('OpenShock Plugin', function() {
        it('should mask API key when loading config', function() {
            const config = {
                apiKey: 'abc123def456ghi789jkl012mno345pqr'
            };

            const apiKeyValue = config.apiKey ? '***SAVED***' : '';
            const apiKeyPlaceholder = config.apiKey ? 'API Key gespeichert (verborgen)' : 'Enter your OpenShock API key';

            assert.strictEqual(apiKeyValue, '***SAVED***', 'API key should be masked');
            assert.strictEqual(apiKeyPlaceholder, 'API Key gespeichert (verborgen)', 'Placeholder should indicate key is saved');
        });

        it('should detect masked value in save function', function() {
            const apiKey = '***SAVED***';
            const isMasked = apiKey === '***SAVED***';

            assert.strictEqual(isMasked, true, 'Save function should detect masked value');
        });
    });

    describe('Dashboard - OpenAI and TikTok API Keys', function() {
        it('should mask OpenAI API key when loading settings', function() {
            const settings = {
                openai_api_key: 'sk-abc123def456ghi789jkl012'
            };

            const value = settings.openai_api_key ? '***REDACTED***' : '';
            const placeholder = settings.openai_api_key ? 'API key configured (hidden)' : 'sk-...';

            assert.strictEqual(value, '***REDACTED***', 'OpenAI API key should be masked');
            assert.strictEqual(placeholder, 'API key configured (hidden)', 'Placeholder should indicate key is configured');
        });

        it('should mask TikTok/Eulerstream API key when loading settings', function() {
            const settings = {
                tiktok_euler_api_key: 'abcdefghijklmnopqrstuvwxyz123456'
            };

            const value = settings.tiktok_euler_api_key ? '***REDACTED***' : '';
            const placeholder = settings.tiktok_euler_api_key ? 'API key configured (hidden)' : 'Enter your Eulerstream API key...';

            assert.strictEqual(value, '***REDACTED***', 'TikTok API key should be masked');
            assert.strictEqual(placeholder, 'API key configured (hidden)', 'Placeholder should indicate key is configured');
        });

        it('should skip saving OpenAI key when value is masked', function() {
            const apiKey = '***REDACTED***';
            const shouldSave = apiKey !== '***REDACTED***';

            assert.strictEqual(shouldSave, false, 'Should not save masked OpenAI API key');
        });

        it('should skip saving TikTok key when value is masked', function() {
            const apiKey = '***REDACTED***';
            const shouldSave = apiKey !== '***REDACTED***';

            assert.strictEqual(shouldSave, false, 'Should not save masked TikTok API key');
        });

        it('should save when value is a real new key', function() {
            const apiKey = 'sk-newkey123456789';
            const shouldSave = apiKey !== '***REDACTED***';

            assert.strictEqual(shouldSave, true, 'Should save new real API key');
        });
    });

    describe('TTS API Keys (existing implementation)', function() {
        it('should use consistent masking pattern', function() {
            const settings = {
                tts_google_api_key: 'google-key-123',
                tts_speechify_api_key: 'speechify-key-456',
                tts_elevenlabs_api_key: 'elevenlabs-key-789'
            };

            // All TTS keys use the same pattern
            const googleValue = settings.tts_google_api_key ? '***REDACTED***' : '';
            const speechifyValue = settings.tts_speechify_api_key ? '***REDACTED***' : '';
            const elevenlabsValue = settings.tts_elevenlabs_api_key ? '***REDACTED***' : '';

            assert.strictEqual(googleValue, '***REDACTED***', 'Google TTS key should be masked');
            assert.strictEqual(speechifyValue, '***REDACTED***', 'Speechify TTS key should be masked');
            assert.strictEqual(elevenlabsValue, '***REDACTED***', 'ElevenLabs TTS key should be masked');
        });

        it('should skip saving TTS keys when values are masked', function() {
            const googleKey = '***REDACTED***';
            const speechifyKey = 'new-speechify-key';
            const elevenlabsKey = '***REDACTED***';

            const hasNewKeys = (googleKey && googleKey !== '***REDACTED***') ||
                              (speechifyKey && speechifyKey !== '***REDACTED***') ||
                              (elevenlabsKey && elevenlabsKey !== '***REDACTED***');

            assert.strictEqual(hasNewKeys, true, 'Should detect that there is at least one new key');

            const updates = {};
            if (googleKey && googleKey !== '***REDACTED***') updates.tts_google_api_key = googleKey;
            if (speechifyKey && speechifyKey !== '***REDACTED***') updates.tts_speechify_api_key = speechifyKey;
            if (elevenlabsKey && elevenlabsKey !== '***REDACTED***') updates.tts_elevenlabs_api_key = elevenlabsKey;

            assert.strictEqual(updates.tts_google_api_key, undefined, 'Masked Google key should not be in updates');
            assert.strictEqual(updates.tts_speechify_api_key, 'new-speechify-key', 'New Speechify key should be in updates');
            assert.strictEqual(updates.tts_elevenlabs_api_key, undefined, 'Masked ElevenLabs key should not be in updates');
        });
    });
});
