# Enhanced Launcher for LTTH

This is the new enhanced launcher for PupCid's Little TikTool Helper with language selection, tabbed interface, and improved user experience.

## Features

### 1. Language Selection
- **Multi-language support**: German, English, French, Spanish
- **Visual language selector**: Flags and language names
- **Persistent preference**: Selected language is used throughout the launcher

### 2. Tabbed Interface
The launcher replaces the single changelog view with five informative tabs:

- **Welcome Tab**: Thank you message and key features overview
- **Resources Tab**: Required dependencies and API key information
- **Changelog Tab**: Recent changes and updates
- **Community Tab**: Links to community resources, GitHub, Discord
- **Logging Tab**: Real-time server logs with enable/disable toggle

### 3. User Profile Management
- **Profile selection**: Choose existing TikTok user profile
- **Profile creation**: Create new profile with @username
- **Auto-creation**: Profile is automatically created on first start
- **Profile switching**: Seamlessly switch between profiles

### 4. Keep Launcher Open
- **Checkbox option**: Choose to keep launcher open after starting
- **Smart redirect**: Opens dashboard in new tab if enabled, or replaces launcher if disabled

### 5. Enhanced UX
- **Logo display**: Shows LTTH night mode logo
- **Progress tracking**: Real-time progress bar and status updates
- **Server logs**: Optional real-time server output in Logging tab
- **Modern UI**: Clean, responsive design with gradient backgrounds

## Building the Launcher

### Windows
```batch
cd build-src
build-launcher-enhanced.bat
```

### Linux/Mac
```bash
cd build-src
chmod +x build-launcher-enhanced.sh
./build-launcher-enhanced.sh
```

### Manual Build
```bash
cd build-src
go build -ldflags="-H windowsgui" -o launcher-enhanced.exe launcher-gui-enhanced.go  # Windows
go build -o launcher-enhanced launcher-gui-enhanced.go  # Linux/Mac
```

## Requirements

- **Go**: Version 1.18 or higher
- **Node.js**: Version 18.x - 23.x (for running the app)
- **npm**: Included with Node.js

## File Structure

```
build-src/
├── launcher-gui-enhanced.go      # Main launcher source code
├── build-launcher-enhanced.bat   # Windows build script
├── build-launcher-enhanced.sh    # Linux/Mac build script
└── README-ENHANCED-LAUNCHER.md   # This file
```

## Architecture

### Language Selection Flow
1. Launcher starts → Shows language selection modal
2. User selects language → Loads translations from `/app/locales/{lang}.json`
3. Main launcher UI loads with selected language
4. Language preference is passed to server on start

### Profile Management Flow
1. User enters @username or selects existing profile
2. Username is stored temporarily in launcher
3. Server starts → Profile is created via `/api/profiles` endpoint
4. Profile is set as active via `/api/profiles/switch` endpoint
5. Dashboard loads with active profile

### Server Communication
- **Port 58734**: Launcher HTTP server (language selection, profile management)
- **Port 3000**: Main application server (dashboard, API, plugins)
- **Server-Sent Events**: Real-time progress updates from launcher to UI

## Translation Files

The launcher uses the i18n system with translations in:
- `/app/locales/de.json` - German
- `/app/locales/en.json` - English  
- `/app/locales/fr.json` - French
- `/app/locales/es.json` - Spanish

### Translation Keys
All launcher translations are under the `launcher` namespace:
- `launcher.language_selection.*` - Language selector
- `launcher.tabs.*` - Tab labels
- `launcher.welcome.*` - Welcome tab content
- `launcher.resources.*` - Resources tab content
- `launcher.changelog.*` - Changelog tab
- `launcher.community.*` - Community tab links
- `launcher.logging.*` - Logging tab controls
- `launcher.profile.*` - Profile management
- `launcher.options.*` - Launcher options
- `launcher.status.*` - Status messages

## API Endpoints

### Launcher Endpoints (Port 58734)
- `GET /` - Main launcher UI
- `GET /logo` - LTTH logo image
- `GET /changelog` - Parsed changelog HTML
- `GET /api/languages` - Available languages
- `GET /api/translations?lang={code}` - Translations for language
- `POST /api/start` - Start server with profile and language
- `POST /api/logging/toggle` - Enable/disable logging
- `GET /events` - Server-sent events for progress

### Server Endpoints (Port 3000)
- `GET /api/profiles` - List user profiles
- `POST /api/profiles` - Create new profile
- `POST /api/profiles/switch` - Switch active profile
- `GET /api/profiles/active` - Get active profile

## Development

### Testing the Launcher
1. Build the launcher using the build script
2. Run `launcher.exe` (or `./launcher`)
3. Select a language
4. Create or select a profile
5. Click "Start" to launch the application

### Debugging
- Launcher logs are saved to `/app/logs/launcher_YYYY-MM-DD_HH-MM-SS.log`
- Enable "Logging" tab to see real-time server output
- Check browser console for JavaScript errors

### Common Issues

**Port 58734 already in use**
- Another launcher instance is running
- Kill the process or use a different port

**Cannot connect to server (Port 3000)**
- Server failed to start
- Check logs in `/app/logs/`
- Verify Node.js and dependencies are installed

**Profile not created**
- Server might not be ready
- Check server logs for errors
- Try restarting the launcher

## Comparison with Original Launcher

| Feature | Original Launcher | Enhanced Launcher |
|---------|------------------|-------------------|
| Language Selection | ❌ | ✅ (4 languages) |
| Tabbed Interface | ❌ | ✅ (5 tabs) |
| Profile Management | ❌ | ✅ |
| Keep Open Option | ❌ | ✅ |
| Real-time Logging | ❌ | ✅ |
| Community Links | ❌ | ✅ |
| Resources Info | ❌ | ✅ |
| Modern UI | Basic | ✅ Enhanced |

## Migration from Old Launcher

To replace the old launcher with the enhanced version:

1. Build the enhanced launcher
2. Backup the old `launcher.exe` (optional)
3. Replace `launcher.exe` with `launcher-enhanced.exe`
4. Rename to `launcher.exe`

The enhanced launcher is fully compatible with the existing application.

## Future Enhancements

Potential improvements for future versions:
- [ ] Profile import/export
- [ ] Auto-update notification in launcher
- [ ] Theme selection (light/dark mode)
- [ ] Custom logo upload
- [ ] Launch options (dev mode, safe mode)
- [ ] System tray integration
- [ ] Multi-instance support

## License

Same license as the main application (CC-BY-NC-4.0).

## Credits

- Original launcher: LTTH Team
- Enhanced launcher: GitHub Copilot Agent
- UI Design: Inspired by modern web applications
- Translations: Community contributors
