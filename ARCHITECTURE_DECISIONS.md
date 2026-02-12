# Architecture & Feature Decisions

## Core Architecture

**Local-Only Storage** - All data stored in IndexedDB on user's device. No cloud sync, no external services, complete privacy.

**Unified Storage Model** - Media (images/audio/video) embedded directly in content entries. Media automatically deleted when content is deleted. No orphaned files.

**Manifest V3** - Modern Chrome extension standard with service worker (not persistent background page). Auto-terminates after 60s idle.

## User-Facing Features

### Multi-Element Capture
Users can save 4 types from any webpage:
- **Text selections** - Highlight text, click popover
- **Images** - Hover over image >50x50px for 1 second
- **Tables** - Hover over tables with >2 rows (preserves embedded images as `{{img:N}}` placeholders)
- **Links** - Hover over links (detects nested images for dual-save)

### Progressive Disclosure UI
- **Collapsed view** - Shows only: type icon, 80-char preview, thumbnail count
- **Click to expand** - Reveals full text, all links, media gallery, edit/delete
- Maximizes content density while scrolling

### Warm Writer Aesthetic
- Amber accent (#D97706) + warm neutrals (#FAF9F7 paper tone)
- Differentiates from typical blue/gray tech tools
- Emotional connection for writing-focused use

### Undo/Redo System
- **Session-scoped only** - History cleared when popup closes
- Supports: create, update, delete, reorder actions
- Max 50 actions, stored in chrome.storage.session
- Design choice: Prevents large history accumulation

### Drag-Drop Reordering
- Custom order persisted in `order` field
- Disabled on expanded items to prevent interaction conflicts
- Sortable.js integration with visual feedback

### Copy All Export
Three formats:
1. **Full (Structured)** - Image capture via html2canvas (Word-compatible)
2. **Content + Notes** - Plain text only
3. **Content + Notes + Source** - Includes URLs

**Why image export?** Word cannot paste base64 images from HTML clipboard. Canvas capture solves formatting loss.

## Critical Technical Decisions

### CORS Image Handling
Two-tier strategy:
1. **Canvas extraction** (same-origin/CORS-enabled) - Fast, no network
2. **Background worker fetch** (fallback) - Bypasses content script CORS restrictions, 30s timeout

### Extension Context Validation
Checks `chrome.runtime.id` before message passing. Shows "Refresh page" if extension reloaded. Prevents orphaned content script errors.

### Media Processing
- Files converted to Blobs at save time
- Base64 encoding for inter-process messaging (blobs can't cross process boundaries)
- MIME type validation: whitelist only (images: PNG/JPEG/GIF/WebP/SVG, audio: MP3/WAV/OGG/WebM, video: MP4/WebM/OGG)

### Connection Pooling
- DB connection cached for 60 seconds idle
- Service worker kept alive via 25-second pings during active use
- Auto-closes on inactivity to free resources

## Data Lifecycle

**Creation:**
- Manual (popup form) or capture (webpage popover)
- Timestamps: `created` (first save), `modified` (every update)
- Atomic save: content + all media in single IndexedDB transaction

**Updates:**
- Text/links/media can be added without replacing existing
- Before/after snapshots captured for undo
- Modified timestamp auto-updated

**Deletion:**
- Single delete: immediate (no confirmation), recorded in undo
- Delete all: confirmation dialog showing count, each deletion separately undoable
- Media auto-deleted with parent content (embedded architecture)

## Security Model

**Automatic Isolation** - Chrome enforces per-extension storage namespace. Other extensions and web pages cannot access data.

**Content Security Policy** - `script-src 'self'` prevents inline scripts and external code execution. No `unsafe-eval` or `unsafe-inline`.

**Permissions:**
- `storage` + `unlimitedStorage` - Local IndexedDB (no warnings shown to user)
- `activeTab` - Current tab URL/title only
- `<all_urls>` - Required for universal text selection capture

**No Encryption at Rest** - Relies on Chrome profile protection. Extension designed for non-sensitive content only.

## Known Limitations

**Session-Only Undo** - History lost when popup closes (by design, prevents storage bloat)

**No Multi-Tab Sync** - Each popup instance has independent undo stack

**Large File Performance** - Base64 encoding adds CPU cost for >10MB files

**Word Export Format** - Image-based export is non-editable (trade-off for preserving formatting)

**Browser-Specific** - Chrome/Edge only (Manifest V3, IndexedDB, service workers)

## Migration Path

**Version 1 → 2** - Auto-migrated from dual-storage (separate media store) to unified storage. Preserves existing data, deletes old media store.

---

*This document captures decisions that directly affect user workflows, data reliability, and feature behavior.*
