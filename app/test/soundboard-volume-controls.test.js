/**
 * Test for soundboard volume controls
 * Verifies that volume sliders are properly integrated with preview functionality
 */

const fs = require('fs');
const path = require('path');

describe('Soundboard Volume Controls', () => {
    let dashboardSoundboardJs;
    
    beforeAll(() => {
        // Read the dashboard-soundboard.js file
        const filePath = path.join(__dirname, '../public/js/dashboard-soundboard.js');
        dashboardSoundboardJs = fs.readFileSync(filePath, 'utf8');
    });
    
    test('should have generateUniqueSoundId helper function', () => {
        expect(dashboardSoundboardJs).toContain('function generateUniqueSoundId()');
        expect(dashboardSoundboardJs).toContain('soundIdCounter');
    });
    
    test('should create volume sliders in MyInstants search results', () => {
        expect(dashboardSoundboardJs).toContain('type="range"');
        expect(dashboardSoundboardJs).toContain('min="0" max="100"');
        expect(dashboardSoundboardJs).toContain('Vol:');
    });
    
    test('should read volume from slider when testing sounds', () => {
        expect(dashboardSoundboardJs).toContain('volumeInputId');
        expect(dashboardSoundboardJs).toContain('dataset.volumeInputId');
        expect(dashboardSoundboardJs).toContain('parseFloat(volumeInput.value) / 100.0');
    });
    
    test('should update volume label when slider changes', () => {
        expect(dashboardSoundboardJs).toContain("addEventListener('input'");
        expect(dashboardSoundboardJs).toContain('volumeLabel.textContent');
    });
    
    test('should use unique IDs for each sound control', () => {
        // Check that we're using the helper function instead of inline generation
        expect(dashboardSoundboardJs).toContain('const soundId = generateUniqueSoundId()');
        
        // Should not have the old inline ID generation
        expect(dashboardSoundboardJs).not.toContain('Math.random().toString(36)');
    });
    
    test('should have volume controls in gift sound table', () => {
        expect(dashboardSoundboardJs).toContain('gift-vol-');
        expect(dashboardSoundboardJs).toContain('testContainer');
    });
    
    test('should have event sound volume labels in HTML', () => {
        const htmlPath = path.join(__dirname, '../plugins/soundboard/ui/index.html');
        const html = fs.readFileSync(htmlPath, 'utf8');
        
        expect(html).toContain('Volume (0.0 - 1.0)');
        expect(html).toContain('soundboard-follow-volume');
        expect(html).toContain('soundboard-subscribe-volume');
        expect(html).toContain('soundboard-share-volume');
        expect(html).toContain('soundboard-like-volume');
        expect(html).toContain('soundboard-gift-volume');
    });
});
