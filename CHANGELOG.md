# Changelog

All notable changes to PupCid's Little TikTool Helper will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2025-12-09

### Fixed
- **Version Number Correction** - Corrected erroneous version 2.2.1 to 1.2.1
  - Previous version incorrectly labeled as 2.2.1 (typo)
  - Proper semantic versioning sequence: 1.1.0 → 1.2.0 → 1.2.1
- **Advanced Timer Plugin** - Fixed overlay routes and storage migration
  - Added missing overlay routes for timer display in OBS
  - Migrated timer storage to user profile for better data persistence
  - Improved timer state management and recovery
  - Fixed timer overlay not loading correctly in browser sources

### Changed
- **Repository Reorganization** - Complete repository restructuring for release readiness
  - Root directory cleaned up - now contains only essential files (launcher, CHANGELOG.md, README.md, package.json, main.js, LICENSE)
  - Application code moved from `/app` to `/src` for clarity
  - Plugins extracted to dedicated `/plugins` directory (30+ plugins organized)
  - Build tools consolidated in `/tools` (launcher build scripts, signing tools)
  - All documentation moved to `/docs` (implementation summaries, migration guides, screenshots)
  - Assets organized in `/assets/images`
  - Tests centralized in `/tests`
  - Created clear directory structure with logical separation of concerns
  - Removed obsolete code (HsEQlT_B WebGL experiment)
  - Updated all package.json scripts to reflect new structure
  - Fixed Electron main.js to work with new architecture
  - Updated README.md with comprehensive directory structure documentation
  - Prepared repository for production release deployment

## [1.2.0] - 2025-12-07

### Changed
- **Repository Cleanup & Documentation Consolidation**
  - Konsolidierung aller Dokumentationsdateien in README.md
  - Archivierung aller detailierten Informationsdateien in /docs_archive/
  - Root-Verzeichnis bereinigt und auf Kern-Elemente reduziert
  - Struktur vereinheitlicht für zukünftige Releases
  - LICENSE file moved to root directory
  - Neue konsolidierte README.md mit allen wichtigen Informationen
  - Migration guides und spezifische Dokumentationen archiviert

### Added
- CHANGELOG.md für bessere Versionsverfolgung
- docs_archive/ Ordner für historische Dokumentation
- Vereinfachte Root-Struktur mit klarer Trennung

## [1.1.0] - 2024-12

### Added
- Electron Desktop App Support
- Viewer XP System with overlays and statistics
- GCCE Integration for plugins
- Weather Control Plugin
- Multi-Cam Switcher improvements
- HUD System Plugin (core)
- Performance optimizations (60% Event Processing, 50-75% DB Query reduction)

### Changed
- Launcher optimizations and error handling improvements
- Repository size reduction (removed node_modules from git)
- Improved documentation structure

### Fixed
- Launcher syntax errors
- Launcher size optimization (28% reduction)
- Improved error handling with log files
- Various bug fixes and stability improvements

---

For detailed changelog of the backend application, see [app/CHANGELOG.md](app/CHANGELOG.md)
