# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a minimal Chrome extension (Manifest V3) for content writing assistance. Currently a placeholder with basic structure and no active functionality.

## Extension Development Workflow

### Loading/Testing the Extension
1. Navigate to `chrome://extensions/` in Chrome
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked" and select this directory
4. After code changes, click the refresh icon on the extension card to reload

### Key Files
- `manifest.json` - Extension configuration (Manifest V3 format). Edit this to add permissions, background service workers, or content scripts
- `popup.html/css/js` - The popup UI displayed when clicking the toolbar icon
- `icons/` - Extension icons (16x16, 48x48, 128x128)

## Architecture Notes

### Manifest V3 Structure
This extension uses Chrome's Manifest V3 specification. Key differences from V2:
- Uses `action` instead of `browser_action`
- Background scripts require service workers (not currently configured)
- Content Security Policy is more restrictive
- Permissions model is more granular

### Current State
- No background service worker configured
- No content scripts injected into pages
- No permissions requested
- Popup is standalone with no persistent state

### Adding Functionality
To expand this extension:
- **Permissions**: Add to `manifest.json` permissions array (e.g., `"activeTab"`, `"storage"`, `"scripting"`)
- **Background processing**: Add `"background": {"service_worker": "background.js"}` to manifest
- **Content scripts**: Add `"content_scripts"` array to manifest to inject scripts into web pages
- **Storage**: Use `chrome.storage` API for persistent data (requires `"storage"` permission)
- **Page interaction**: Use `chrome.scripting` API to inject code into active tabs (requires `"scripting"` permission)
