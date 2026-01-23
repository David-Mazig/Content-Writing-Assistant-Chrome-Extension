# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome extension (Manifest V3) for content writing assistance. The extension allows users to create, store, and manage content items with embedded media (images, audio, video) and links. All data is stored locally in IndexedDB with no external dependencies or cloud services.

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
- **Storage**: Unified IndexedDB implementation storing content with embedded media
- **UI**: Functional popup with content list view and creation modal
- **Features**: Create, view, and delete content items with text, links, and media attachments
- **Permissions**: `storage` and `unlimitedStorage` configured
- No background service worker (not needed for current functionality)
- No content scripts injected into pages (extension operates independently)

### Adding Functionality
To expand this extension:
- **Permissions**: Add to `manifest.json` permissions array (e.g., `"activeTab"`, `"scripting"`)
- **Background processing**: Add `"background": {"service_worker": "background.js"}` to manifest
- **Content scripts**: Add `"content_scripts"` array to manifest to inject scripts into web pages
- **Page interaction**: Use `chrome.scripting` API to inject code into active tabs (requires `"scripting"` permission)

## UI Architecture

### Popup Interface
The extension popup (400x500-600px) provides a content management interface with:

**Main Components:**
1. **Header**: Title and "+ New" button to create content
2. **Content List**: Scrollable list of saved content items
3. **New Content Modal**: Form overlay for creating content

### Content Item Display
Each content item card shows:
- Date (modified timestamp)
- Text preview (first 100 characters)
- Link count indicator
- Media type summary (counts of images/audio/video)
- Image thumbnails (first 3 images, 60x60px)
- Delete button

### Content Creation Flow
1. User clicks "+ New" button
2. Modal appears with input fields:
   - Textarea for text content
   - Text input for link (single link supported)
   - File picker for media (images, audio, video - multiple files)
3. User fills in desired fields (at least text or media required)
4. Click "Save" to store in IndexedDB
5. Modal closes and content list refreshes

### UI Files
- `popup.html` - Structure with content list and modal elements
- `popup.css` - Styling with card-based layout and responsive design
- `popup.js` - Event handlers, rendering logic, and storage integration

### Key Functions in popup.js
- `renderContentList()` - Fetches and displays all content items
- `createContentItemElement()` - Generates DOM for a content card
- `saveNewContent()` - Handles form submission and storage
- `deleteContent()` - Removes content and refreshes list

## Data Storage Architecture

### Security Model
This extension stores user data with the following security guarantees:
- **Isolated from other Chrome extensions** - Each extension has its own storage namespace that other extensions cannot access
- **Inaccessible to web pages** - Only extension contexts can access storage APIs
- **Protected by Chrome's security model** - Same-origin policy and process isolation enforce automatic separation

### Storage Mechanism
The extension uses **unified IndexedDB storage** for all data:
- **IndexedDB**: Stores everything - text content, links, metadata, and media files (images, audio, video)
- Capacity: Hundreds of MB to GB depending on available disk space
- Single source of truth - no synchronization between storage systems needed

This architecture provides:
- Automatic isolation between extensions (enforced by Chrome)
- No encryption needed at rest (Chrome profile protection)
- Zero additional security code required
- Simplified data model - content and media stored together atomically

### Required Permissions
Currently configured in `manifest.json`:
- `storage` - Required for extension storage APIs (does not trigger user warning)
- `unlimitedStorage` - Removes IndexedDB quota limits (does not trigger user warning)

### Storage Implementation Files
- `db-utils.js` - Unified IndexedDB wrapper for all content and media
- `popup.js` - UI integration with storage layer
- `popup.html` - Loads db-utils.js before popup.js
- `storage-utils.js` - **DEPRECATED** - Previously used for chrome.storage.local, kept for reference only

### Database Schema

**Database Details:**
- Database Name: `ContentWritingAssistant`
- Current Version: `2`
- Object Store: `items`
- Key Path: `key` (e.g., "content:123")

**Indexes:**
- `type` - For querying by content type
- `created` - For sorting by creation date
- `modified` - For sorting by modification date

### Data Structure

**IndexedDB unified structure**:
```javascript
{
  "key": "content:123",
  "type": "content",
  "text": "User content text...",
  "links": ["https://example.com"],
  "media": [
    {
      "id": "media:456",
      "type": "image",
      "mimeType": "image/png",
      "blob": Blob,
      "size": 245678,
      "name": "photo.png"
    },
    {
      "id": "media:789",
      "type": "audio",
      "mimeType": "audio/mp3",
      "blob": Blob,
      "size": 1234567,
      "name": "recording.mp3"
    }
  ],
  "created": 1234567890,
  "modified": 1234567890
}
```

### Security Considerations
- Data is **NOT** encrypted at rest (relies on Chrome profile protection only)
- Isolation is **automatic** - no additional security code needed
- Content Security Policy prevents remote code execution and XSS attacks
- Minimal permissions reduce attack surface
- No sensitive data should be stored (passwords, API keys, etc.)

### Storage API Usage Examples

**Creating content with media**:
```javascript
const contentId = await DBUtils.saveContent(null, {
  text: "My content",
  links: ["https://example.com"],
  media: [
    {
      type: "image",
      mimeType: "image/png",
      blob: imageBlob,
      name: "photo.png"
    }
  ]
});
```

**Loading content (includes embedded media)**:
```javascript
const content = await DBUtils.getContent("content:123");
// Access media: content.media[0].blob
```

**Adding media to existing content**:
```javascript
const mediaId = await DBUtils.addMediaToContent(contentId, blob, {
  type: "image",
  mimeType: "image/png",
  name: "photo.png"
});
```

**Deleting content (automatically deletes embedded media)**:
```javascript
await DBUtils.deleteContent(contentId);
```

### Supported Media Types

**Images:**
- PNG (`image/png`)
- JPEG (`image/jpeg`, `image/jpg`)
- GIF (`image/gif`)
- WebP (`image/webp`)
- SVG (`image/svg+xml`)

**Audio:**
- MP3 (`audio/mpeg`, `audio/mp3`)
- WAV (`audio/wav`)
- OGG (`audio/ogg`)
- WebM Audio (`audio/webm`)

**Video:**
- MP4 (`video/mp4`)
- WebM (`video/webm`)
- OGG Video (`video/ogg`)

MIME type validation is enforced in `DBUtils.validateMimeType()`. Unsupported types will be rejected.

### Quota Monitoring
Check storage usage:
```javascript
// IndexedDB quota and usage
const quota = await DBUtils.getStorageEstimate();
console.log(`Using ${quota.usage} of ${quota.quota} bytes`);
```

## Testing and Debugging

### Browser Console Access
To access the extension's console:
1. Open the extension popup
2. Right-click anywhere in the popup
3. Select "Inspect" from the context menu
4. Console logs and storage stats will appear in DevTools

### Manual Testing Functions
All storage operations are available in the console via `window.ContentAssistant`:

```javascript
// Create content programmatically
await ContentAssistant.createContent("Test content", ["https://example.com"], []);

// List all content
const allContent = await ContentAssistant.listAllContent();
console.log(allContent);

// Load specific content by ID
const content = await ContentAssistant.loadContent("content:123");

// Delete content by ID
await ContentAssistant.deleteContent("content:123");

// Access DBUtils directly
const stats = await ContentAssistant.DBUtils.getStorageEstimate();
```

### Common Testing Scenarios

**Test content creation:**
1. Click "+ New" in popup
2. Enter text: "Sample content for testing"
3. Add link: "https://example.com"
4. Verify content appears in list after save

**Test image upload:**
1. Create new content
2. Click "📎 Add Media"
3. Select an image file (PNG, JPEG, etc.)
4. Save and verify thumbnail appears

**Test deletion:**
1. Click "Delete" on any content item
2. Verify item is removed from list
3. Check console to confirm deletion

**Verify storage persistence:**
1. Create content items
2. Close and reopen the popup
3. Verify all items are still present

### IndexedDB Inspection
To view the database directly:
1. Open DevTools (F12) on any Chrome page
2. Go to "Application" tab
3. Expand "Storage" → "IndexedDB" → "ContentWritingAssistant"
4. Click "items" object store
5. View all stored content entries

### Migration Notes
The extension auto-migrates from database version 1 (old dual-storage) to version 2 (unified storage). If you have data from an older version, it will be preserved during the migration.
