# Fireworks Audio Files

This directory contains synchronized audio files for the fireworks plugin with realistic rocket launches and explosions.

## 🎵 Audio System Overview

The fireworks plugin uses an intelligent audio system that automatically selects appropriate sounds based on:
- **Firework tier** (small, medium, big, massive)
- **Combo level** (consecutive gifts)
- **Visual effects** (instant explosions, rocket animations)

Audio files are synchronized with visual effects, so explosions happen at the right moment in the audio.

## 📁 Available Audio Files

### Combined Audio (Launch + Explosion)
These files contain the complete firework sequence from launch to explosion, perfectly synchronized:

- **`woosh_abheben_crackling_bang.mp3`** (~4.9s)
  - Whoosh launch → crackling effects → big explosion
  - Used for: **Massive** and **Big** fireworks
  - Explosion timing: ~3.2 seconds

- **`woosh_abheben_mit-pfeifen_normal-bang.mp3`** (~3.4s)
  - Whoosh launch → whistling → normal explosion
  - Used for: **Medium** fireworks (60% chance)
  - Explosion timing: ~2.2 seconds

- **`woosh_abheben_mit-pfeifen_tiny-bang.mp3`** (~1.8s)
- **`woosh_abheben_mit-pfeifen_tiny-bang2.mp3`** (~1.8s)
- **`woosh_abheben_mit-pfeifen_tiny-bang3.mp3`** (~1.9s)
- **`woosh_abheben_mit-pfeifen_tiny-bang4.mp3`** (~3.4s)
  - Whoosh launch → whistling → tiny explosion
  - Used for: **Small** fireworks and high combos (5+)
  - Explosion timing: ~1.2 seconds

### Launch-Only Audio (No Explosion)
These files contain only the launch/whoosh sound, used when explosion is played separately:

- **`woosh_abheben_mit-pfeifen_no-bang.mp3`** (~1.3s)
  - Whoosh launch with whistling, no explosion
  - Used for: Custom combinations

- **`woosh_abheben_nocrackling_no-bang.mp3`** (~1.5s)
- **`woosh_abheben_nocrackling_no-bang2.mp3`** (~1.7s)
  - Smooth whoosh launch without crackling or explosion
  - Used for: **Medium** fireworks (40% chance) + separate explosion

### Basic Sound Effects

- **`abschussgeraeusch.mp3`** (~0.8s)
- **`abschussgeraeusch2.mp3`** (~0.6s)
  - Short launch/ignition sounds
  - Reserved for future use

- **`rocket.mp3`** (~0.4s)
  - Basic rocket whistle sound
  - Reserved for future use

- **`explosion.mp3`** (~0.3s)
  - Basic explosion sound
  - Used for: Separate explosions, instant explode mode

## 🎯 Automatic Audio Selection

The system automatically chooses audio based on firework characteristics:

| Firework Type | Audio Selection | Notes |
|--------------|----------------|-------|
| **Small** (0-99 coins) | Random tiny-bang (1-4) | Quick, synchronized explosions |
| **Medium** (100-499 coins) | 60% normal-bang, 40% smooth+explosion | Varied medium effects |
| **Big** (500-999 coins) | 50% crackling-bang, 50% whistle+explosion | Impressive effects |
| **Massive** (1000+ coins) | Always crackling-bang | Maximum impact |
| **Combo 5-7** | Random tiny-bang | Quick bursts for fast combos |
| **Combo 8+** | Only explosion sound | Instant explosions, no launch |

## ✅ Audio Status

✅ **All audio files are installed and ready to use!**

The plugin automatically:
- Preloads all audio files on page load
- Selects appropriate audio based on firework tier and combo
- Synchronizes explosion sounds with visual explosions
- Adjusts volume based on firework intensity

Audio requires user interaction (click/keypress) to enable due to browser autoplay policies.

## 🔧 Technical Details

### Timing Synchronization
The audio system uses precise timing to synchronize sounds with visuals:

1. **Combined audio**: Plays complete sequence, explosion is already synchronized in the file
2. **Separate audio**: Launch plays immediately, explosion triggers via callback when visual explodes

### Audio Timing Reference
- **Tiny explosions**: ~1.2s from launch start
- **Normal explosions**: ~2.2s from launch start  
- **Big explosions**: ~3.2s from launch start

### Volume Levels
- Launch sounds: 0.4 volume
- Combined audio: 0.6 volume
- Explosion sounds: 0.6 volume (scaled by intensity)
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
