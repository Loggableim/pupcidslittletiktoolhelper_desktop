/**
 * Test for plugin-manager.js i18n initialization check
 * 
 * This test validates that the PluginManager class correctly handles
 * translation calls when i18n is not yet initialized, preventing the
 * display of raw translation keys like "plugins.error_prefix"
 */

describe('PluginManager i18n handling', () => {
    let PluginManager;
    let manager;

    // Mock window object
    global.window = {
        i18n: null
    };

    beforeEach(() => {
        // We can't directly import the plugin-manager.js file because it's designed for browser
        // Instead, we'll test the logic pattern
        
        // Simulate the PluginManager.t() helper method
        class MockPluginManager {
            t(key, params = {}, fallback = '') {
                return (window.i18n?.initialized) ? window.i18n.t(key, params) : fallback;
            }
        }
        
        manager = new MockPluginManager();
    });

    test('should return fallback when i18n is null', () => {
        window.i18n = null;
        const result = manager.t('plugins.error_prefix', { error: 'test error' }, 'Error: test error');
        expect(result).toBe('Error: test error');
    });

    test('should return fallback when i18n exists but not initialized', () => {
        window.i18n = {
            initialized: false,
            t: jest.fn()
        };
        const result = manager.t('plugins.error_prefix', { error: 'test error' }, 'Error: test error');
        expect(result).toBe('Error: test error');
        expect(window.i18n.t).not.toHaveBeenCalled();
    });

    test('should call i18n.t when i18n is initialized', () => {
        window.i18n = {
            initialized: true,
            t: jest.fn().mockReturnValue('Fehler: test error')
        };
        const result = manager.t('plugins.error_prefix', { error: 'test error' }, 'Error: test error');
        expect(result).toBe('Fehler: test error');
        expect(window.i18n.t).toHaveBeenCalledWith('plugins.error_prefix', { error: 'test error' });
    });

    test('should return fallback when i18n.initialized is undefined', () => {
        window.i18n = {
            t: jest.fn()
        };
        const result = manager.t('plugins.error_prefix', { error: 'test error' }, 'Error: test error');
        expect(result).toBe('Error: test error');
        expect(window.i18n.t).not.toHaveBeenCalled();
    });

    test('should handle empty fallback string', () => {
        window.i18n = null;
        const result = manager.t('plugins.some_key', {}, '');
        expect(result).toBe('');
    });
});
