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

## Data Storage Architecture

### Security Model
This extension stores user data with the following security guarantees:
- **Isolated from other Chrome extensions** - Each extension has its own storage namespace that other extensions cannot access
- **Inaccessible to web pages** - Only extension contexts can access storage APIs
- **Protected by Chrome's security model** - Same-origin policy and process isolation enforce automatic separation

### Storage Mechanisms
The extension uses a dual-storage approach:
- **chrome.storage.local**: Text content, links, and metadata (up to 10MB+ with unlimitedStorage)
- **IndexedDB**: Images, audio, and video files (hundreds of MB capacity)

This architecture provides:
- Automatic isolation between extensions (enforced by Chrome)
- No encryption needed at rest (Chrome profile protection)
- Zero additional security code required
- Industry-standard best practice for Chrome extensions

### Required Permissions
Currently configured in `manifest.json`:
- `storage` - Enables chrome.storage API (does not trigger user warning)
- `unlimitedStorage` - Removes storage quota limits (does not trigger user warning)

### Storage Implementation Files
- `storage-utils.js` - Wrapper for chrome.storage.local API (text content, links, metadata)
- `db-utils.js` - Wrapper for IndexedDB API (images, audio, video blobs)
- `popup.js` - UI integration with storage layer
- Both utility files must be loaded in `popup.html` before `popup.js`

### Data Structures

**chrome.storage.local structure**:
```javascript
{
  "content:{id}": {
    "id": "unique-id",
    "text": "User content text...",
    "links": ["https://example.com"],
    "imageRefs": ["img:123"],  // References to IndexedDB
    "created": 1234567890,
    "modified": 1234567890
  }
}
```

**IndexedDB media structure**:
```javascript
{
  "key": "img:123",
  "type": "image",
  "mimeType": "image/png",
  "blob": Blob,
  "size": 245678,
  "created": 1234567890
}
```

### Security Considerations
- Data is **NOT** encrypted at rest (relies on Chrome profile protection only)
- Isolation is **automatic** - no additional security code needed
- Content Security Policy prevents remote code execution and XSS attacks
- Minimal permissions reduce attack surface
- No sensitive data should be stored (passwords, API keys, etc.)

### Storage API Usage Examples

**Creating content**:
```javascript
const contentId = await StorageUtils.saveContent(null, {
  text: "My content",
  links: ["https://example.com"]
});
```

**Saving an image**:
```javascript
const imageId = await DBUtils.saveImage(null, imageBlob, {
  mimeType: "image/png"
});
```

**Linking image to content**:
```javascript
await StorageUtils.addImageRef(contentId, imageId);
```

### Quota Monitoring
Check storage usage:
```javascript
// Chrome storage stats
const stats = await StorageUtils.getStorageStats();

// IndexedDB quota
const quota = await DBUtils.getStorageEstimate();
```
