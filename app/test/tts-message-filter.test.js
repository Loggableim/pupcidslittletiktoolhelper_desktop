/**
 * TTS Message Filter Tests
 * Tests for the message prefix filter functionality
 */

const TTSPlugin = require('../plugins/tts/main');

// Mock API and dependencies
const mockApi = {
    logger: {
        info: () => {},
        warn: () => {},
        error: () => {}
    },
    getConfig: (key) => {
        if (key === 'config') {
            return {
                messageFilterPrefixes: '!,/',
                enabledForChat: true,
                profanityFilter: 'off',
                maxTextLength: 300,
                defaultEngine: 'google',
                defaultVoice: 'de-DE-Wavenet-B',
                enableGoogleFallback: true
            };
        }
        return null;
    },
    setConfig: () => {},
    getDatabase: () => ({
        getSetting: (key) => {
            if (key === 'tts_enabled') return 'true';
            if (key === 'tts_google_api_key') return 'test-key';
            return null;
        },
        db: {
            exec: () => {},
            prepare: () => ({
                run: () => {},
                get: () => null,
                all: () => []
            })
        }
    }),
    getSocketIO: () => ({}),
    registerRoute: () => {},
    registerSocket: () => {},
    registerTikTokEvent: () => {},
    emit: () => {}
};

describe('TTS Message Filter', () => {
    let tts;

    beforeEach(() => {
        tts = new TTSPlugin(mockApi);
    });

    test('should filter messages starting with exclamation mark', async () => {
        const result = await tts.speak({
            text: '!hello world',
            userId: 'test123',
            username: 'testuser',
            teamLevel: 999,
            source: 'manual'
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('message_filtered');
        expect(result.matchedPrefix).toBe('!');
    });

    test('should filter messages starting with slash', async () => {
        const result = await tts.speak({
            text: '/command test',
            userId: 'test123',
            username: 'testuser',
            teamLevel: 999,
            source: 'manual'
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('message_filtered');
        expect(result.matchedPrefix).toBe('/');
    });

    test('should NOT filter messages with prefix in middle', async () => {
        // Mock to prevent actual TTS synthesis
        tts.engines.google = {
            synthesize: jest.fn().mockResolvedValue('fake-audio-data')
        };
        tts.queueManager.enqueue = jest.fn().mockReturnValue({
            success: true,
            position: 1,
            queueSize: 1
        });

        const result = await tts.speak({
            text: 'hello ! world',
            userId: 'test123',
            username: 'testuser',
            teamLevel: 999,
            source: 'manual'
        });

        expect(result.success).toBe(true);
    });

    test('should work with empty filter configuration', async () => {
        // Override config to have empty filter
        tts.config.messageFilterPrefixes = '';

        tts.engines.google = {
            synthesize: jest.fn().mockResolvedValue('fake-audio-data')
        };
        tts.queueManager.enqueue = jest.fn().mockReturnValue({
            success: true,
            position: 1,
            queueSize: 1
        });

        const result = await tts.speak({
            text: '!this should not be filtered',
            userId: 'test123',
            username: 'testuser',
            teamLevel: 999,
            source: 'manual'
        });

        expect(result.success).toBe(true);
    });

    test('should handle whitespace-only filter configuration', async () => {
        tts.config.messageFilterPrefixes = '  ,  ';

        tts.engines.google = {
            synthesize: jest.fn().mockResolvedValue('fake-audio-data')
        };
        tts.queueManager.enqueue = jest.fn().mockReturnValue({
            success: true,
            position: 1,
            queueSize: 1
        });

        const result = await tts.speak({
            text: '!this should not be filtered',
            userId: 'test123',
            username: 'testuser',
            teamLevel: 999,
            source: 'manual'
        });

        expect(result.success).toBe(true);
    });

    test('should filter with multiple character prefix', async () => {
        tts.config.messageFilterPrefixes = '!,//,##';

        const result = await tts.speak({
            text: '//comment here',
            userId: 'test123',
            username: 'testuser',
            teamLevel: 999,
            source: 'manual'
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('message_filtered');
        expect(result.matchedPrefix).toBe('//');
    });

    test('should trim message before checking prefix', async () => {
        const result = await tts.speak({
            text: '   !hello',
            userId: 'test123',
            username: 'testuser',
            teamLevel: 999,
            source: 'manual'
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('message_filtered');
        expect(result.matchedPrefix).toBe('!');
    });
});
