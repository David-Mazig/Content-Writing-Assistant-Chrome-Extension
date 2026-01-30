# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome extension (Manifest V3) for content writing             
assistance. The extension allows users to collect, create, store, and manage content (text, tables, links) items and embedded media (images, audio, video). All data is stored locally in IndexedDB with no external dependencies or cloud services.The extension makes it easier for writer to collect their ideas and think how to arrange the plot/nerrative/outline of the content that they are about to write.

## Extension Development Workflow

### Loading/Testing the Extension
1. Navigate to `chrome://extensions/` in Chrome
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked" and select this directory
4. After code changes, click the refresh icon on the extension card to reload

### Key Files
- `manifest.json` - Extension configuration (Manifest V3 format) with permissions and script declarations
- `popup.html/css/js` - The popup UI displayed when clicking the toolbar icon
- `background.js` - Service worker handling IndexedDB operations and message passing
- `content-script.js` - Injected script for text selection detection and popover UI
- `content-script.css` - Styles for the text selection popover
- `db-utils.js` - Unified IndexedDB wrapper (used by both popup and background)
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
- **Features**:
  - Create, view, and delete content items with text, links, and media attachments
  - Text selection capture from any webpage with save popover
  - Background service worker for IndexedDB operations
- **Permissions**: `storage`, `unlimitedStorage`, and `activeTab` configured
- **Content Script**: Injected into all pages to enable text selection saving

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

## Text Selection Feature

### Overview
Users can save highlighted text from any webpage directly to the extension's IndexedDB storage without opening the popup.

### How It Works
1. User highlights text on any webpage
2. A small popover appears near the cursor with a "Save" button
3. Clicking "Save" sends the selected text to the background service worker
4. The text is stored in IndexedDB along with the page URL and title
5. The popover shows "Saved!" confirmation and disappears

### Implementation Files
- `content-script.js` - Detects text selection and displays the save popover
- `content-script.css` - Styles for the popover UI
- `background.js` - Service worker that handles IndexedDB save operations

### Content Script Behavior
- Listens for `mouseup` and `touchend` events
- Shows popover only when text is actually selected
- Popover positioned 10px below cursor position
- Auto-hides when clicking outside or after successful save
- Handles loading, success, and error states visually

### Message Passing
The content script communicates with the background worker via `chrome.runtime.sendMessage`:

```javascript
// Content script sends
{
  action: 'saveSelection',
  data: {
    text: 'Selected text...',
    url: 'https://example.com/page',
    title: 'Page Title'
  }
}

// Background responds
{
  success: true,
  contentId: 'content:123...'
}
```

### Data Format
Saved selections are stored as regular content entries with:
- **text**: Selected text + source information (page title appended)
- **links**: Array containing the source URL
- **media**: Empty array (no media from text selection)

### Popover UI
- Green "Save" button with bookmark icon
- Smooth fade-in animation
- Loading state: "Saving..." text
- Success state: Checkmark icon + "Saved!" (blue background)
- Error state: "Error!" text (red background)
- Maximum z-index to appear above all page content

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

## Agent Routing Rules

**IMPORTANT: Always delegate work to the appropriate specialized agent. Do NOT implement, test, or design directly.**

### chrome-extension-implementer
**Use for:** Implementing features, fixing bugs, debugging, refactoring, any code changes.

Trigger keywords: implement, add, fix, bug, feature, refactor, debug, error, build, create, update, change, modify

### chrome-extension-qa-tester
**Use for:** Testing features, validating workflows, verifying bug fixes, checking for regressions.

Trigger keywords: test, verify, check, validate, QA, regression, works, broken, reproduce

**Use proactively** after any implementation is complete.

### chrome-extension-ux-optimizer
**Use for:** UI/UX design decisions, layout choices, interaction patterns, user flow optimization.

Trigger keywords: UI, UX, design, layout, button, modal, popover, interface, user experience, interaction

### Workflow
1. **Planning** - Use Plan agent to design approach
2. **Implementation** - Delegate to `chrome-extension-implementer`
3. **Testing** - Delegate to `chrome-extension-qa-tester`
4. **UX decisions** - Delegate to `chrome-extension-ux-optimizer`

Never skip the agent delegation step. The agents have specialized knowledge and produce higher quality results.

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

**Test text selection saving:**
1. Navigate to any webpage (e.g., wikipedia.org)
2. Highlight some text on the page
3. Verify the green "Save" popover appears near your cursor
4. Click the "Save" button
5. Verify it shows "Saved!" confirmation
6. Open the extension popup
7. Verify the saved text appears in the content list with the source URL

### IndexedDB Inspection
To view the database directly:
1. Open DevTools (F12) on any Chrome page
2. Go to "Application" tab
3. Expand "Storage" → "IndexedDB" → "ContentWritingAssistant"
4. Click "items" object store
5. View all stored content entries

### Migration Notes
The extension auto-migrates from database version 1 (old dual-storage) to version 2 (unified storage). If you have data from an older version, it will be preserved during the migration.

## Feature Tracking

This project uses **Project Follower** for feature tracking. Features are tracked in `features.json`.

### Proactive Status Updates

**IMPORTANT**: Proactively suggest updating feature status when:

1. **Implementation complete** - Suggest marking `done`
   - Example: "I've completed the export functionality. Should I update features.json to mark it as done?"

2. **Starting work** - Suggest marking `in-progress`
   - Example: "We're starting work on folder organization. Should I mark it as in-progress?"

3. **Bug found** in a `done` feature - Suggest marking `needs-fix`
   - Example: "Found a bug in the text selection feature. Should I mark it as needs-fix?"

4. **Session ending** - Review what was accomplished and suggest updates
   - Example: "Before we end, we completed feature X. Should I update its status?"

5. **New idea discussed** - Suggest adding as `idea`
   - Example: "That's a great idea for search filtering. Should I add it to features.json?"

### Feature Commands

```bash
# Update feature status
npx project-follower update <id> --status done --reason "Implementation complete"

# Add new feature
npx project-follower add "Feature title" --status idea --priority 2

# List features
npx project-follower list

# Sync to central dashboard
npx project-follower sync
```

### Status Values
- `idea` - Not started, just an idea
- `in-progress` - Currently being worked on
- `done` - Completed and working
- `needs-fix` - Has bugs or issues to resolve
