# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Firefox Zen Browser extension for automatically managing inactive tabs to reduce memory usage. The extension suspends/discards tabs that have been inactive for a configurable period.

## Build & Development Commands

```bash
# Load extension in Firefox for development
# 1. Navigate to about:debugging#/runtime/this-firefox
# 2. Click "Load Temporary Add-on"
# 3. Select manifest.json from this directory

# Package extension for distribution
zip -r zen-auto-inactive-tabs.xpi . -x ".*" -x "CLAUDE.md"

# Lint extension (requires web-ext CLI)
npx web-ext lint

# Run in Firefox with auto-reload
npx web-ext run --firefox-profile=dev-edition-default
```

## Architecture

This is a WebExtension (Manifest V2/V3) with these core components:

- **manifest.json** - Extension manifest defining permissions, background scripts, and browser action
- **background.js** - Background script that monitors tab activity and manages suspension/discard logic
- **popup/** - Browser action popup for user settings (suspension timeout, whitelist)
- **options/** - Full options page for advanced configuration

### Key APIs Used

- `browser.tabs` - Tab monitoring, discarding, and querying
- `browser.storage` - Persist user settings
- `browser.idle` - Detect system idle state
- `browser.alarms` - Schedule periodic tab checks

### Memory Management Strategy

The extension uses `browser.tabs.discard()` to unload inactive tabs while preserving their state in the tab bar. Discarded tabs reload when the user switches to them.
