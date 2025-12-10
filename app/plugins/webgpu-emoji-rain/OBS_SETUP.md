# OBS Setup Guide - WebGPU Emoji Rain

## 🎥 Quick Setup for OBS Studio

### Step 1: Add Browser Source

1. In OBS, click **"+"** in Sources
2. Select **"Browser"**
3. Name it (e.g., "Emoji Rain")
4. Click **OK**

### Step 2: Configure Browser Source

**URL:**
```
http://localhost:3000/webgpu-emoji-rain/obs-hud
```

**Width:** `1920`  
**Height:** `1080`

**✅ Check these options:**
- [x] Shutdown source when not visible
- [x] Refresh browser when scene becomes active

**❌ Uncheck:**
- [ ] Control audio via OBS *(not needed)*

### Step 3: OBS Settings (Important!)

**Settings → Advanced:**
- **Browser Hardware Acceleration:** `Enabled` ✅

**Why:** This ensures smooth rendering and best performance.

### Step 4: Verify It Works

1. Enable the plugin in the LTTH UI
2. Click "Test" to spawn test emojis
3. You should see emojis falling in OBS

## 🔧 Performance Tuning for OBS

### Recommended Plugin Settings

Open the plugin UI and configure:

**Basic Settings:**
- Max Emojis: `200-500` (OBS limit)
- Emoji Lifetime: `6000ms`
- Physics Gravity: `1.0`

**Performance Settings:**
- Target FPS: `60`
- FPS Optimization: `Enabled`

**Effects (Optional):**
- Wind: `Disabled` (saves CPU)
- Rainbow Mode: `Disabled` (saves CPU)
- Pixel Mode: `Disabled` (saves CPU)

### For Lower-End PCs

If you experience FPS drops in OBS:

1. **Reduce particle count:**
   - Max Emojis: `100-200`

2. **Shorten lifetime:**
   - Emoji Lifetime: `4000ms`

3. **Simplify physics:**
   - Disable bounce
   - Disable wind

4. **Enable Toaster Mode** (if available in config)

## ❓ Troubleshooting

### Problem: Black screen in OBS

**Solution:**
1. Check URL is correct: `http://localhost:3000/webgpu-emoji-rain/obs-hud`
2. Verify LTTH app is running
3. Hard refresh the browser source (right-click → Refresh)
4. Check browser console for errors (right-click → Interact)

### Problem: Emojis not appearing

**Solution:**
1. Make sure plugin is **enabled** in LTTH UI
2. Test from the plugin UI (Test button)
3. Check if you have emoji_set configured
4. Verify TikTok events are firing

### Problem: Low FPS / Laggy

**Solution:**
1. Reduce `max_emojis_on_screen` to 100-200
2. Enable hardware acceleration in OBS
3. Close other GPU-intensive applications
4. Reduce emoji lifetime to 4000-5000ms
5. Disable effects (wind, rainbow, etc.)

### Problem: "WebGPU not available" warning

**This is normal!** 

OBS Browser Source doesn't fully support WebGPU yet. The plugin automatically uses the stable Canvas renderer instead. Everything works perfectly - you just won't get the 10,000 particle capacity of the full WebGPU engine.

**Performance in OBS:**
- ✅ 100-500 particles at 60 FPS
- ✅ All visual effects work
- ✅ Rock-solid stability
- ✅ Full TikTok integration

**Want to test full WebGPU?**
Open the URL in Chrome/Edge browser directly:
```
http://localhost:3000/webgpu-emoji-rain/overlay
```

## 📊 Expected Performance in OBS

| Particles | Expected FPS | Quality |
|-----------|-------------|---------|
| 50 | 60 | Perfect |
| 100 | 60 | Perfect |
| 200 | 60 | Excellent |
| 500 | 45-60 | Good |
| 1000+ | 30-45 | Reduce count |

## 🎨 Visual Quality Settings

### High Quality (Best for 1080p60 streams)
```
Max Emojis: 300
Lifetime: 6000ms
Bounce: Enabled
Effects: Minimal
```

### Balanced (Recommended)
```
Max Emojis: 200
Lifetime: 5000ms
Bounce: Enabled
Effects: Off
```

### Performance (Lower-end PCs)
```
Max Emojis: 100
Lifetime: 4000ms
Bounce: Disabled
Effects: Off
```

## 🔗 URLs Reference

### Standard OBS HUD (1920x1080)
```
http://localhost:3000/webgpu-emoji-rain/obs-hud
```
Optimized for OBS with fixed resolution.

### Responsive Overlay (Any Resolution)
```
http://localhost:3000/webgpu-emoji-rain/overlay
```
Adapts to window size - use for non-standard resolutions.

## 💡 Pro Tips

1. **Test before going live:** Always test with the "Test" button in the UI first

2. **Use scenes:** Set up separate scenes for different emoji rain intensities

3. **Interaction:** Right-click the source in OBS → Interact to see the browser console

4. **Layer it:** Place emoji rain above your game/camera but below alerts for best effect

5. **Backup config:** Export your emoji rain configuration before major updates

6. **Custom emojis:** Upload custom images in the plugin UI for unique effects

7. **User mappings:** Set specific emojis for VIP viewers or mods

8. **Gift scaling:** Configure how many emojis spawn per coin value in gifts

## 🎯 Common Use Cases

### Hype Moments
Configure high emoji count for:
- Large gifts (100+ coins)
- SuperFan subscriptions
- Raid events (via flows)

### Viewer Engagement
- Custom emojis for top gifters
- Special effects for follows/shares
- Burst mode for milestones

### Event Integration
Use with Flow system to trigger on:
- Goal completions
- Time-based events
- Custom commands
- External webhooks

## 📞 Still Need Help?

1. Check browser console (Right-click source → Interact → F12)
2. Look for error messages
3. Verify all URLs return 200 OK
4. Test outside OBS (in browser) to isolate issues

## ✅ Success Checklist

Before going live, verify:

- [ ] Plugin enabled in LTTH UI
- [ ] OBS Browser Source configured correctly
- [ ] Hardware acceleration enabled in OBS
- [ ] Test emojis appear and fall smoothly
- [ ] TikTok events trigger emoji spawns
- [ ] FPS stable at 60 in OBS
- [ ] Custom emojis working (if used)
- [ ] User mappings working (if used)

---

**Enjoy your emoji rain!** 🌧️✨

For technical details and API documentation, see the main [README.md](README.md).
