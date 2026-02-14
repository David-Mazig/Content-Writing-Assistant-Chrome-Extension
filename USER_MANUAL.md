# Content Writing Assistant — Quick Reference

## Overview
Chrome extension for collecting and organizing web content. Capture text, images, tables, and links from any webpage. All data stored locally (no cloud sync).

## Installation
1. Download from GitHub or extract ZIP
2. Go to `chrome://extensions/` → Enable **Developer mode**
3. Click **Load unpacked** → Select extension folder
4. Pin extension to toolbar (recommended)

## Quick Start
1. **Capture**: Select text or hover over images/tables/links (1 second)
2. **Save**: Click "Save" in popup (or press Enter)
3. **Manage**: Open extension popup to view/organize
4. **Export**: Click "Copy All" to export in various formats

## Capturing Content

| Type | Method | Notes |
|------|--------|-------|
| **Text** | Select text on any page | Popup appears → add note → Save |
| **Images** | Hover 1 sec (≥50x50px) | Auto-saved with source info |
| **Tables** | Hover 1 sec (≥2 rows) | Captures structure + embedded images |
| **Links** | Hover 1 sec | Saves link text + URL |
| **Manual** | Click "+ New" in popup | Upload files or paste content |

**Multi-element capture**: When hovering over nested elements (e.g., image in link), choose Image/Link/Table/All.

**Shortcuts**: Enter = Save, Escape = Cancel

## Managing Content

**View**: Click extension icon → Browse items (click to expand/collapse)
**Search**: Ctrl+K → Type query (searches text/notes/sources/URLs)
**Edit**: Click pencil icon → Modify → Save
**Delete**: Click trash icon (Ctrl+Z to undo)
**Reorder**: Click & hold → Drag to new position
**Undo/Redo**: Ctrl+Z / Ctrl+Y (session-scoped, max 100 actions)

## Projects

**Create**: Click folder icon → + button → Name project (2-50 chars)
**Switch**: Alt+P → Select project
**Rename**: Project menu (⋮) → Rename
**Delete**: Project menu (⋮) → Delete (except default project)
**Move items**: Right-click item → Move to Project → Select destination

## Copy & Export

Click **Copy All** → Select format:

| Format | Best For | Output Type |
|--------|----------|-------------|
| **Full (Structured)** | Documentation, archiving | Image (Word/Docs compatible) |
| **Content + Notes** | Clean documents | Image |
| **Content + Notes + Source** | Research with references | Image |
| **AI Chatbot** | ChatGPT, Claude, plain text | Editable text (XML-style) |

**AI Chatbot format** uses `<item id="N">` tags, Markdown tables, and `[Image: filename]` placeholders. AI can reference items by ID ("summarize item 1").

## Storage & Privacy
- All data stored locally in Chrome IndexedDB (no cloud sync)
- No external network requests, tracking, or analytics
- Data stored in plaintext (not encrypted)
- View data: Right-click popup → Inspect → Application tab → IndexedDB

## Key Limitations
- Images <50x50px and tables <2 rows ignored
- CORS-protected images may fail
- Undo/redo session-scoped (cleared when popup closes)
- Chrome only (Manifest V3)
- Default project cannot be deleted

## Troubleshooting
- **"Refresh page" error**: Reload webpage after extension update
- **"Image protected"**: CORS restriction — manually save image instead
- **No hover popup**: Hover 1 full second; check element size
- **Lost content**: Check if you switched projects

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Ctrl+K** / **Cmd+K** | Focus search box |
| **Ctrl+Z** / **Cmd+Z** | Undo |
| **Ctrl+Y** / **Cmd+Shift+Z** | Redo |
| **Alt+P** | Toggle projects |
| **Enter** | Save content (in capture popup) |
| **Escape** | Cancel / Close modal |

---

**Version:** 1.1.0 | **License:** MIT | [GitHub](https://github.com/David-Mazig/Content-Writing-Assistant-Chrome-Extension) | [Report Issues](https://github.com/David-Mazig/Content-Writing-Assistant-Chrome-Extension/issues)
