# Fireworks Audio Files

This directory contains synchronized audio files for the fireworks plugin with realistic rocket launches, explosions, and atmospheric effects.

## 🎵 Audio System Overview

The fireworks plugin uses an intelligent audio system that automatically selects appropriate sounds based on:
- **Firework tier** (small, medium, big, massive)
- **Combo level** (consecutive gifts)
- **Visual effects** (instant explosions, rocket animations)

**All 22 audio files are synchronized with visual effects** - explosions trigger exactly when the visual firework explodes, and crackling effects layer for atmospheric depth.

## 📁 Available Audio Files (22 Total)

### Combined Audio (Launch + Explosion)
These files contain the complete firework sequence from launch to explosion, perfectly synchronized:

- **`woosh_abheben_crackling_bang.mp3`** (~4.9s)
  - Whoosh launch → crackling effects → big explosion
  - Used for: **Massive** and **Big** fireworks (50-60% chance)
  - Explosion timing: ~3.2 seconds from start

- **`woosh_abheben_mit-pfeifen_normal-bang.mp3`** (~3.4s)
  - Whoosh launch → whistling → normal explosion
  - Used for: **Medium** and **Massive** fireworks
  - Explosion timing: ~2.2 seconds from start

- **`woosh_abheben_mit-pfeifen_tiny-bang.mp3`** (~1.8s)
- **`woosh_abheben_mit-pfeifen_tiny-bang2.mp3`** (~1.8s)
- **`woosh_abheben_mit-pfeifen_tiny-bang3.mp3`** (~1.9s)
  - Whoosh launch → whistling → tiny explosion
  - Used for: **Small** fireworks (70% chance)
  - Explosion timing: ~1.2 seconds from start

- **`woosh_abheben_mit-pfeifen_tiny-bang4.mp3`** (~3.4s)
  - Whoosh launch → whistling → tiny explosion (longer variant)
  - Used for: High combos (5+) for variety
  - Explosion timing: ~1.2 seconds from start

### Launch-Only Audio (No Explosion)
These files contain only the launch/whoosh sound, explosion plays separately and is **synchronized via callback**:

- **`woosh_abheben_mit-pfeifen_no-bang.mp3`** (~1.3s)
  - Whoosh launch with whistling, no explosion
  - Used for: **Big** and **Massive** fireworks combinations

- **`woosh_abheben_nocrackling_no-bang.mp3`** (~1.5s)
- **`woosh_abheben_nocrackling_no-bang2.mp3`** (~1.7s)
  - Smooth whoosh launch without crackling or explosion
  - Used for: **Medium** fireworks (30% chance)

### Basic Launch Sounds

- **`abschussgeraeusch.mp3`** (~0.8s)
- **`abschussgeraeusch2.mp3`** (~0.6s)
  - Short launch/ignition sounds
  - Used for: **Small** and **Medium** fireworks (30% chance each)

- **`rocket.mp3`** (~0.4s)
  - Basic rocket whistle sound
  - Used for: **Small**, **Medium**, and **Big** fireworks

### NEW: Explosion Sounds (Tier-Matched)
These explosion sounds are **synchronized via callback** - they play exactly when the visual firework explodes:

**Small Explosions:**
- **`explosion.mp3`** (~0.3s) - Quick, sharp explosion
- **`explosion_small1.mp3`** (~3.7s) - Small explosion with reverb
- **`explosion2.mp3`** (~2.8s) - Alternative small explosion

**Medium Explosions:**
- **`explosion_medium.mp3`** (~3.2s) - Medium-sized explosion
- **`explosion3.mp3`** (~3.6s) - Alternative medium explosion
- **`explosion Pop,Sharp,.mp3`** (~4.6s) - Sharp popping explosion

**Big Explosions:**
- **`explosion_big.mp3`** (~3.5s) - Big powerful explosion
- **`explosion_huge.mp3`** (~5.9s) - Huge dramatic explosion

### NEW: Crackling Sounds (Atmospheric Effects)
These crackling sounds layer over fireworks for added atmospheric depth:

- **`crackling.mp3`** (~10.2s) - Long crackling effect
- **`crackling2.mp3`** (~5.9s) - Medium crackling effect

Used for: **Big** (30% chance) and **Massive** (40% chance) fireworks, plays simultaneously with explosion for dramatic effect.

## 🎯 Automatic Audio Selection with Synchronization

The system automatically chooses audio based on firework characteristics with high variety:

| Firework Type | Audio Selection | Notes |
|--------------|----------------|-------|
| **Small** (0-99 coins) | 70% combined tiny-bang, 30% basic launch+explosion | Mix of synchronized and separate audio |
| **Medium** (100-499 coins) | 40% normal-bang, 30% smooth launch, 30% varied launches | Maximum variety with different launch sounds |
| **Big** (500-999 coins) | 50% crackling-bang, 25% whistle, 25% varied launches | Emphasizes crackling effects |
| **Massive** (1000+ coins) | 80% crackling-bang, 20% whistle-normal | Maximum impact with variety |
| **Combo 5-7** | Random tiny-bang (1-4, includes longer variant) | Quick bursts for fast combos |
| **Combo 8+** | Only explosion sound | Instant explosions, no launch |

### Launch Sound Variety

The system now uses **all available launch sounds** to create variety:
- **Basic launches**: `abschussgeraeusch.mp3`, `abschussgeraeusch2.mp3`, `rocket.mp3` - Quick ignition sounds
- **Whistle launch**: `woosh_abheben_mit-pfeifen_no-bang.mp3` - Dramatic whistle effect
- **Smooth launches**: `woosh_abheben_nocrackling_no-bang.mp3`, `woosh_abheben_nocrackling_no-bang2.mp3` - Clean whoosh sounds

Different tiers use different combinations of these sounds to ensure every firework has a unique audio signature.

## ✅ Audio Status

✅ **All 22 audio files are installed and synchronized!**

The plugin automatically:
- Preloads all 22 audio files on page load
- Selects tier-appropriate audio (small/medium/big explosions match firework size)
- **Synchronizes explosions perfectly** - combined audio has pre-timed explosions, separate audio uses callbacks
- Adds optional crackling layers for Big and Massive fireworks
- Adjusts volume based on firework intensity and type

Audio requires user interaction (click/keypress) to enable due to browser autoplay policies.

## 🔧 Technical Details - Synchronization Methods

### Method 1: Pre-Synchronized Combined Audio
The audio system uses precise timing built into combined audio files:

1. **Combined audio files** contain both launch and explosion
2. Explosion timing is **baked into the audio file**:
   - Tiny explosions: explosion at ~1.2s mark in audio
   - Normal explosions: explosion at ~2.2s mark in audio  
   - Big explosions (crackling): explosion at ~3.2s mark in audio
3. Visual rocket is timed to match these audio explosion points

### Method 2: Callback-Synchronized Separate Audio
For separate launch + explosion combinations:

1. **Launch sound plays** immediately when rocket starts
2. **Visual rocket flies** until it reaches peak or target
3. **Visual explosion triggers** when rocket should explode
4. **Explosion sound plays** via `onExplodeSound` callback at exact moment of visual explosion
5. **Result**: Perfect synchronization regardless of rocket flight duration

### Method 3: Layered Crackling Effects
Optional atmospheric enhancement:

1. Crackling sounds can layer over combined or separate audio
2. Plays simultaneously with explosion (not independently timed)
3. Adds depth and drama without affecting core synchronization
4. Used for 30-40% of Big/Massive fireworks

### Volume Levels
- Launch sounds: 0.4 volume
- Combined audio: 0.6 volume
- Explosion sounds: 0.6 volume (scaled by intensity)
- Crackling sounds: 0.3 volume (layered effect, quieter)
- Instant explosions: 0.2 volume (quieter for rapid combos)

## 🎨 Customization

To customize audio behavior, edit the `selectAudio()` method in `gpu/engine.js`:

```javascript
// Example: Always use crackling bang for big fireworks
case 'big':
    return {
        useCombinedAudio: true,
        combinedSound: 'combined-crackling-bang',
        explosionDelay: 3.2
    };
```

## 🔄 Adding New Audio Files

1. Place MP3 file in this directory
2. Add preload in `gpu/engine.js`:
   ```javascript
   await engine.audioManager.preload('/plugins/fireworks/audio/yourfile.mp3', 'your-name');
   ```
3. Update `selectAudio()` method to use the new audio
4. Document timing if it's a combined audio file

## 🐛 Troubleshooting

- **No sound?** Click anywhere on the overlay page to enable audio (browser requirement)
- **Wrong sounds?** Clear browser cache and reload the page
- **Audio too loud/quiet?** Adjust volume in the plugin settings UI
- **Sounds out of sync?** Check explosion timing values in `selectAudio()` method
- **Missing audio?** Check browser console for loading errors
