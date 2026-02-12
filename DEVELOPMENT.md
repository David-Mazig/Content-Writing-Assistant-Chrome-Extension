# Development Guide

## Loading the Extension

1. Navigate to `chrome://extensions/` in Chrome
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked" and select this directory
4. After code changes, click the refresh icon on the extension card to reload

## File Structure

```
manifest.json          - Extension configuration (Manifest V3)
popup.html/css/js      - Main UI (400x500-600px popup)
background.js          - Service worker (IndexedDB, message passing)
content-script.js      - Multi-element capture with popover UI
content-script.css     - Popover styling
db-utils.js           - Unified IndexedDB wrapper
undo-redo-utils.js    - Session-scoped action history
icons/                - Extension icons (16x16, 48x48, 128x128)
```

## Debugging

### Console Access
1. Open the extension popup
2. Right-click anywhere in the popup
3. Select "Inspect" → DevTools console

### Console API
```javascript
// Available in popup console via window.ContentAssistant
await ContentAssistant.createContent("Test", ["https://example.com"], []);
await ContentAssistant.listAllContent();
await ContentAssistant.loadContent("content:123");
await ContentAssistant.deleteContent("content:123");
await ContentAssistant.DBUtils.getStorageEstimate();
```

### IndexedDB Inspection
1. Open DevTools (F12) on any Chrome page
2. Go to "Application" tab
3. Expand "Storage" → "IndexedDB" → "ContentWritingAssistant"
4. Click "items" object store
5. View all stored content entries

## Testing Checklist

**Basic Operations:**
- [ ] Create content via popup form (text + links + media)
- [ ] Save text selection from webpage (hover popover appears)
- [ ] Save image from webpage (hover >50x50px image for 1s)
- [ ] Save table from webpage (hover table with >2 rows)
- [ ] Edit existing content item
- [ ] Delete single content item
- [ ] Delete all content (with confirmation)

**Advanced Features:**
- [ ] Drag-drop reorder content items
- [ ] Undo/redo operations (session-scoped)
- [ ] Copy All → Full/Content+Notes/Content+Notes+Source
- [ ] Search/filter content list
- [ ] Verify persistence (close/reopen popup)

**Edge Cases:**
- [ ] Large media files (>10MB)
- [ ] Cross-origin images (CORS handling)
- [ ] Extension reload (content script shows "Refresh page")
- [ ] Empty content (at least text OR media required)

## Architecture Notes

### Manifest V3
- Uses `action` (not deprecated `browser_action`)
- Service worker auto-terminates after 60s idle
- CSP: `script-src 'self'` (no inline scripts)
- Permissions: `storage`, `unlimitedStorage`, `activeTab`, `<all_urls>`

### Storage
- Unified IndexedDB model (v2)
- Media embedded in content entries (no orphans)
- Connection pooling with 60s idle timeout
- Service worker kept alive with 25s pings during active use

### Multi-Element Capture
Content script detects and captures:
- **Text** - Highlight → popover appears
- **Images** - Hover >50x50px for 1 second
- **Tables** - Hover tables with >2 rows (preserves embedded images as `{{img:N}}`)
- **Links** - Hover links (detects nested images for dual-save)

### CORS Handling
Two-tier image fetching:
1. **Canvas extraction** (same-origin/CORS-enabled) - Fast, no network
2. **Background worker fetch** (fallback) - Bypasses CORS, 30s timeout

### UI Architecture
- **Progressive disclosure:** Collapsed (80-char preview) / Expanded (full content)
- **Drag-drop reordering:** SortableJS with visual feedback
- **Undo/Redo:** Session-scoped (max 50 actions in chrome.storage.session)
- **Copy All:** html2canvas for Word compatibility (image export)

## Known Issues

- **Undo history** - Session-only (cleared on popup close)
- **Large files** - Base64 encoding adds CPU cost for >10MB
- **Word export** - Image-based (non-editable, preserves formatting)
- **No multi-tab sync** - Each popup has independent undo stack

## Migration Notes

Database auto-migrates v1 → v2 (dual-storage → unified storage). Existing data preserved during upgrade.
