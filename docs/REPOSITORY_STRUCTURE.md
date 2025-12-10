# Repository Structure Documentation

This document describes the complete repository structure of PupCid's Little TikTool Helper after the v1.2.1 reorganization.

## Overview

The repository has been reorganized into a clean, logical structure that separates concerns and makes the codebase release-ready. All files are now organized into dedicated directories based on their purpose.

## Root Directory

The root directory contains only essential files required for the project to function:

```
/
├── launcher/          # Desktop launcher executable and resources
├── CHANGELOG.md       # Version history and release notes
├── README.md          # Main project documentation
├── LICENSE            # Creative Commons BY-NC 4.0 license
├── package.json       # Root npm package configuration
├── main.js            # Electron application entry point
├── .gitignore         # Git ignore patterns
└── .github/           # GitHub Actions workflows and configuration
```

## Directory Structure

### `/src` - Main Application Code

Contains the entire backend application. This was previously the `/app` directory.

```
src/
├── server.js                 # Express.js server and main entry point
├── package.json              # Application dependencies
├── package-lock.json         # Locked dependency versions
├── electron-bootstrap.js     # Electron module resolution bootstrap
├── launch.js                 # Server launcher script
├── test-config-path-manager.js  # Configuration path testing utility
├── postcss.config.js         # PostCSS configuration
├── tailwind.config.js        # Tailwind CSS configuration
│
├── modules/                  # Core application modules
│   ├── database.js           # SQLite database (WAL mode)
│   ├── tiktok.js             # TikTok LIVE Connector integration
│   ├── alerts.js             # Alert system manager
│   ├── ifttt.js              # Event automation engine
│   ├── goals.js              # Goals tracking system
│   ├── plugin-loader.js      # Plugin system loader
│   ├── logger.js             # Winston logger with rotation
│   ├── config-path-manager.js  # Configuration path management
│   ├── user-profiles.js      # User profile management
│   ├── session-extractor.js  # Session data extraction
│   ├── update-manager.js     # Update checking and management
│   ├── validators.js         # Input validation utilities
│   ├── template-engine.js    # Template rendering engine
│   ├── error-handler.js      # Error handling utilities
│   └── ... (other core modules)
│
├── routes/                   # Express.js API routes
│   ├── plugin-routes.js      # Plugin management API
│   ├── tiktok-routes.js      # TikTok connection API
│   ├── profile-routes.js     # User profile API
│   └── ... (other route modules)
│
├── public/                   # Frontend static files
│   ├── dashboard.html        # Main dashboard UI
│   ├── css/                  # Stylesheets
│   ├── js/                   # Frontend JavaScript
│   └── ... (other public assets)
│
├── scripts/                  # Utility scripts
│   └── ...
│
├── locales/                  # Internationalization files
│   ├── de.json               # German translations
│   ├── en.json               # English translations
│   ├── es.json               # Spanish translations
│   └── fr.json               # French translations
│
├── docs/                     # App-specific documentation
├── wiki/                     # Wiki content
├── data/                     # Application data (gitignored)
├── user_data/                # User-specific data (gitignored)
├── user_configs/             # User configurations (gitignored)
├── logs/                     # Application logs (gitignored)
└── tts/                      # TTS cache and audio files
```

### `/plugins` - Plugin System

All plugins are located here. The plugin system allows modular extension of functionality.

```
plugins/
├── tts/                      # Text-to-Speech plugin
├── soundboard/               # Soundboard with MyInstants integration
├── goals/                    # Goals tracking overlay plugin
├── advanced-timer/           # Advanced timer plugin
├── fireworks-webgpu/         # WebGPU fireworks overlay
├── webgpu-emoji-rain/        # WebGPU emoji rain effect
├── osc-bridge/               # OSC bridge for VRChat integration
├── viewer-xp/                # Viewer XP and leveling system
├── leaderboard/              # Top gifters leaderboard
├── coinbattle/               # Coin battle game
├── clarityhud/               # HUD overlay system
├── gcce-hud/                 # GCCE HUD integration
├── openshock/                # OpenShock integration
├── hybridshock/              # HybridShock integration
├── vdoninja/                 # VDO.Ninja multi-guest streaming
├── chatango/                 # Chatango chat integration
├── thermal-printer/          # Thermal printer plugin
├── api-bridge/               # API bridge plugin
├── config-import/            # Configuration import/export
├── lastevent-spotlight/      # Last event spotlight overlay
├── gift-milestone/           # Gift milestone tracking
├── flame-overlay/            # Flame overlay effect
├── emoji-rain/               # Emoji rain effect (Canvas)
├── fireworks/                # Fireworks effect (WebGL)
├── multicam/                 # Multi-camera switcher
├── quiz_show/                # Quiz show plugin
├── streamalchemy/            # Stream alchemy features
└── ... (30+ total plugins)
```

**Plugin Structure:**
Each plugin follows this standard structure:
```
plugin-name/
├── plugin.json       # Plugin metadata
├── main.js           # Plugin entry point
├── ui.html           # Optional: Admin UI
├── overlay.html      # Optional: OBS overlay
├── assets/           # Optional: CSS, JS, images
├── README.md         # Plugin documentation
└── test/             # Optional: Plugin tests
```

### `/assets` - Static Resources

All static assets like images, logos, and backgrounds.

```
assets/
└── images/
    ├── OPEN BETA.jpg                     # Beta announcement image
    ├── launcherbg.jpg                    # Launcher background
    ├── launcherbg.png                    # Launcher background PNG
    ├── ltthappicon.png                   # Application icon
    ├── ltthlogo_daymode.png              # Day mode logo
    ├── ltthlogo_night-highcontrast-mode.png  # High contrast logo
    │
    ├── logos_neu/                        # New logos
    │   ├── icons/                        # Icon variants
    │   └── logos_big/                    # Large logo variants
    │
    ├── ltth logo/                        # Original logos
    │   ├── logo_daymode.jpg
    │   ├── logo_highcontrast.jpg
    │   └── logo_nightmode.jpg
    │
    └── ltthmini/                         # Mini logos
        ├── ltthmini_daymode.jpg
        ├── ltthmini_highcontrast.jpg
        └── ltthmini_nightmode.jpg
```

### `/tests` - Test Files

All test files organized here for easy test execution.

```
tests/
├── playwright.config.js              # Playwright test configuration
├── advanced-timer.test.js            # Advanced timer tests
├── plugin-state-persistence.test.js  # Plugin state tests
├── tts-api-key-update.test.js        # TTS API key tests
├── viewer-xp-gcce-integration.test.js  # GCCE integration tests
└── ... (50+ test files)
```

**Running Tests:**
```bash
# From root
npm test

# From src directory
cd src && npm test
```

### `/docs` - Documentation

All project documentation consolidated in one place.

```
docs/
├── REPOSITORY_STRUCTURE.md         # This file
│
├── Implementation Summaries
├── ADVANCED_TIMER_ROUTE_FIX_SUMMARY.md
├── FEATURE_IMPLEMENTATION_COMPLETE.md
├── FIREWORKS_WEBGPU_IMPLEMENTATION.md
├── GPU_RENDERING_OPTIMIZATION.md
├── GRID_LAYOUT_SYSTEM.md
├── PLUGIN_STORAGE_MIGRATION_SUMMARY.md
├── SOUNDBOARD_IMPLEMENTATION_SUMMARY.md
├── TTS_API_KEYS_MIGRATION_SUMMARY.md
├── UI_IMPLEMENTATION_SUMMARY.md
├── WEBGPU_EMOJI_RAIN_IMPLEMENTATION.md
└── ... (more implementation docs)
│
├── migration-guides/               # Migration documentation
│   ├── 01_NSIS_INSTALLER_GUIDE.md
│   ├── 02_NWJS_MIGRATION_GUIDE.md
│   ├── 03_TAURI_MIGRATION_GUIDE.md
│   └── README.md
│
├── screenshots/                    # Application screenshots
│   ├── logo-daymode-expanded.png
│   ├── logo-nightmode-expanded.png
│   └── ... (more screenshots)
│
└── archive/                        # Historical documentation
    ├── GCCE_IMPLEMENTATION_RECOMMENDATIONS.md
    ├── IMPLEMENTATION_SUMMARY_XP_GCCE.md
    └── ... (archived docs)
```

### `/tools` - Build and Development Tools

Build scripts, launcher source code, and signing tools.

```
tools/
├── dev_launcher.bat                # Windows development launcher
│
├── launcher/                       # Launcher build source (Go)
│   ├── launcher.go                 # Main launcher source
│   ├── launcher-gui.go             # GUI launcher variant
│   ├── dev-launcher.go             # Development launcher
│   ├── ltthgit.go                  # Git integration tool
│   ├── build_gui.py                # GUI build script
│   ├── go.mod                      # Go module definition
│   ├── icon.ico                    # Launcher icon
│   │
│   ├── installer/                  # NSIS installer scripts
│   │   ├── ltth-installer.nsi      # NSIS installer script
│   │   ├── build-installer.bat     # Installer build script
│   │   ├── banner.bmp              # Installer graphics
│   │   └── ... (installer resources)
│   │
│   ├── assets/                     # Launcher assets
│   │   └── splash.html             # Splash screen
│   │
│   └── winres/                     # Windows resources
│       └── winres.json             # Resource configuration
│
└── signing/                        # Code signing scripts
    ├── sign-launcher.ps1           # PowerShell signing script
    ├── sign-launcher-gui.ps1       # GUI signing script
    ├── sign-launcher.bat           # Batch signing script
    └── README.md                   # Signing documentation
```

### `/launcher` - Desktop Launcher

The compiled desktop launcher executable.

```
launcher/
└── launcher.exe                    # Windows launcher executable
```

### `/scripts` - CI/CD and Deployment Scripts

Reserved for CI/CD scripts and deployment automation (currently empty, ready for future use).

### `/engine` - WebGPU Engine

Reserved for future consolidated WebGPU rendering engine code (currently empty).

## Path References in Code

### Important Path Updates

After the reorganization, several paths have been updated:

**Plugin System:**
- Old: `path.join(__dirname, 'plugins')` (in server.js)
- New: `path.join(__dirname, '..', 'plugins')` (points to /plugins at root)

**Static File Serving:**
- Plugins: `/plugins` → serves from root `/plugins` directory
- Public: `/` → serves from `src/public`

**Tailwind CSS:**
- Old: `./plugins/**/ui/**/*.html`
- New: `../plugins/**/ui/**/*.html` (relative to src/)

**Package Scripts:**
- Old: `cd app && node server.js`
- New: `cd src && node server.js`

## Configuration Files

### Root-Level Configuration

- **package.json**: Electron app configuration, build scripts, dependencies
- **main.js**: Electron entry point that starts backend and creates window
- **.gitignore**: Ignores `node_modules/`, `dist/`, user data, logs, etc.

### Src-Level Configuration

- **package.json**: Backend application dependencies
- **tailwind.config.js**: Tailwind CSS configuration
- **postcss.config.js**: PostCSS configuration

## Build and Development

### Development Workflow

```bash
# 1. Clone repository
git clone https://github.com/Loggableim/ltth_dev.git
cd ltth_dev

# 2. Install root dependencies
npm install

# 3. Install src dependencies
cd src && npm install

# 4. Start development server
cd ..
npm run dev
```

### Build Workflow

```bash
# Build Electron app for all platforms
npm run build:all

# Build for specific platform
npm run build:win
npm run build:mac
npm run build:linux
```

### Test Workflow

```bash
# Run backend tests
npm test

# Run Electron tests
npm run test:electron
```

## Git Ignore Strategy

The `.gitignore` file is configured to exclude:
- `node_modules/` (root and src)
- `dist/` and `build/` (build outputs)
- `src/user_data/` and `src/data/` (user data)
- `src/logs/` (application logs)
- `*.db` and `*.sqlite` (databases)
- `tools/launcher/installer/*.exe` (build artifacts)
- `launcher/*.exe`, `*.app`, `*.dmg`, etc. (built launchers)

## Migration Notes

### For Developers

If you're updating code that references old paths:

1. **Plugin references**: Change `./plugins/` to `../plugins/` when in src/
2. **App references**: Change `app/` to `src/` in all scripts
3. **Import paths**: Update any hardcoded paths from `app/modules/` to `src/modules/`

### For Contributors

- All new documentation goes in `/docs`
- All new plugins go in `/plugins` following the plugin structure template
- Tests go in `/tests`
- Build tools go in `/tools`

## Version History

- **v1.2.1 (2025-12-09)**: Major repository reorganization
  - Moved `app/` → `src/`
  - Extracted plugins to `/plugins`
  - Consolidated documentation in `/docs`
  - Organized assets in `/assets`
  - Moved build tools to `/tools`
  - Removed obsolete code (HsEQlT_B WebGL experiment)
  - Updated all paths and references

- **v1.2.0**: Repository cleanup, documentation consolidation
- **v1.1.0**: Electron desktop app support, plugin system
- **Earlier versions**: See CHANGELOG.md

## Additional Resources

- [Main README](../README.md) - Project overview and quick start
- [CHANGELOG](../CHANGELOG.md) - Detailed version history
- [Plugin Development Guide](../src/docs/PLUGIN_DEVELOPMENT.md) - How to create plugins
- [Contributing Guidelines](../.github/CONTRIBUTING.md) - How to contribute

---

**Last Updated**: 2025-12-10  
**Repository**: https://github.com/Loggableim/pupcidslittletiktoolhelper_desktop
