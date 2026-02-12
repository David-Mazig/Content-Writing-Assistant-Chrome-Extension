# CLAUDE.md

This file provides guidance to Claude Code when working with this Chrome extension codebase.

## Project Overview

Chrome extension (Manifest V3) for content writing assistance. Users collect, create, store, and manage content (text, tables, links) with embedded media (images, audio, video). **All data stored locally in IndexedDB** - no external dependencies or cloud services.

## Work flow
- Always use multiple subagents in tasks that don't involve writing code
- If work can be planned in a way that multiple subagents can work in parallel safely and with high quality results, use multiple subagents

## Quick Reference

**Key Files:**
- `manifest.json` - Extension config (Manifest V3), permissions, scripts
- `popup.html/css/js` - Main UI (400x500-600px popup)
- `background.js` - Service worker for IndexedDB and message passing
- `content-script.js` - Multi-element capture (text/images/tables/links)
- `db-utils.js` - Unified IndexedDB wrapper

**Architecture:**
- Manifest V3 service worker (auto-terminates after 60s idle)
- Unified IndexedDB storage (media embedded in content, no orphans)
- Content script on all pages (`<all_urls>` permission)
- CSP: `script-src 'self'` (no inline scripts, XSS protection)

**Features:**
- Multi-element capture: text selections, images (hover >50x50px), tables (>2 rows), links
- Progressive disclosure UI (collapsed/expanded views)
- Drag-drop reordering with session-scoped undo/redo
- Copy All exports (Word-compatible via html2canvas)

## Documentation - Always keep them up to date with every important decisions made

- **[STORAGE.md](STORAGE.md)** - Database schema, data structure, API reference
- **[DEVELOPMENT.md](DEVELOPMENT.md)** - Development workflow, testing, debugging
- **[ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md)** - Key architectural decisions

## Development Workflow

1. Load unpacked: `chrome://extensions/` → Developer mode → Load unpacked
2. After changes: Click refresh icon on extension card
3. Debug: Right-click popup → Inspect → DevTools
4. IndexedDB: DevTools → Application → IndexedDB → ContentWritingAssistant
