# Content Writing Assistant - Chrome Extension

A powerful Chrome extension for collecting, organizing, and managing web content for research, documentation, and AI-assisted writing. Capture text, images, tables, and links from any webpage, then organize and export them in multiple formats.

## Features

### Content Capture
- **Multi-Element Selection**: Capture multiple elements at once from any webpage
- **Rich Content Types**:
  - Text selections with formatting
  - Images (hover to highlight, 50x50px minimum)
  - Tables with embedded images (2+ rows)
  - Links with descriptions
- **Flexible Selection**: Manually select and combine any elements before saving

### Content Management
- **Projects**: Organize content into separate projects with independent workspaces
- **Drag & Drop Reordering**: Organize items visually by dragging
- **Undo/Redo**: Session-scoped undo/redo for all operations (per project)
- **Search**: Quickly find items by content or metadata
- **Notes & Metadata**: Add notes, source titles, and URLs to any item
- **Progressive Disclosure**: Collapse/expand items for better overview

### Copy Formats
Export your collected content in 4 specialized formats:

1. **Full (Structured)** - Complete export for Word with item numbers, types, dates, and all metadata
2. **Content + Notes** - Main content only (cleanest output)
3. **Content + Notes + Source** - Includes source URLs and notes
4. **AI Chatbot Format** - XML-delimited plain text optimized for AI conversations (ChatGPT, Claude, etc.)

### Privacy & Storage
- **100% Local Storage**: All data stored in browser's IndexedDB (no cloud, no external servers)
- **No External Dependencies**: Works completely offline after installation
- **Your Data Stays Yours**: Nothing leaves your computer

## Installation

### From GitHub

1. **Download the Extension**
   ```bash
   git clone https://github.com/David-Mazig/Content-Writing-Assistant-Chrome-Extension.git
   ```
   Or download as ZIP and extract

2. **Open Chrome Extensions**
   - Navigate to `chrome://extensions/`
   - Enable **Developer mode** (toggle in top-right corner)

3. **Load Extension**
   - Click **Load unpacked**
   - Select the extension directory
   - The extension icon appears in your toolbar

4. **Pin Extension** (Optional)
   - Click the puzzle icon in Chrome toolbar
   - Find "Content Writing Assistant"
   - Click the pin icon to keep it visible

## Usage Guide

### Capturing Content

1. **Navigate to Any Webpage**

2. **Open the Extension**
   - Click the extension icon in toolbar
   - Click **"+ New"** button

3. **Select Content**
   - The capture interface overlay appears
   - **Text**: Click and drag to select text
   - **Images**: Hover over images (yellow border) and click
   - **Tables**: Hover over tables (blue border) and click
   - **Links**: Hover over links (green border) and click
   - Select multiple elements before saving

4. **Review & Save**
   - Selected items appear in the preview panel
   - Click **"Save"** to save
   - Or press **Escape** to discard

### Managing Content

#### Projects

**Create Projects**
- Click the project dropdown (📁 folder icon) at the top
- Click the **+** button to create a new project
- Enter a project name (2-50 characters)
- Each project has its own independent content collection

**Switch Between Projects**
- Click the project dropdown
- Select any project to switch to it
- Each project shows its item count
- Active project is marked with a checkmark

**Move Items Between Projects**
- Right-click any content item
- Select "Move to Project" from the context menu
- Choose the destination project
- Item transfers immediately with undo support

**Rename/Delete Projects**
- Open the project dropdown
- Click the ⋮ (three dots) menu on any project
- Choose "Rename" or "Delete"
- Default project cannot be deleted
- Must have at least one project

#### View All Items
- Open the extension popup to see all collected content
- Items display with preview, date, and metadata
- Click an item to expand/collapse full content
- Content is filtered by the currently active project

#### Reorder Items
- Click and drag any item to reorder
- Use **Undo/Redo** buttons to revert changes

#### Edit Item
- Click the **Edit** (pencil) icon on any item
- Modify text, add notes, update source information
- Click **Save** to apply changes

#### Add Metadata
- **Note**: Add personal notes or reminders
- **Source**: Add the source title or reference
- **URL**: Automatically captured, can be edited

#### Search
- Use the search box at the top
- Searches through content, notes, and sources
- Results update as you type

#### Delete Item
- Click the **Delete** (trash) icon on any item
- Use **Undo** immediately after to restore

### Copying Content

1. **Click the Copy Button** (📋 icon)
   - Dropdown menu appears with 4 format options

2. **Choose Format**:

   - **📑 Full (Structured)**: Best for comprehensive exports
     - Includes item numbers, types, dates
     - All metadata (notes, sources, URLs)
     - Structured layout
     - Copied as PNG image for Word compatibility

   - **📄 Content + Notes**: Best for clean documents
     - Main content with notes
     - No item numbers or dates
     - Copied as PNG image for Word compatibility

   - **🔗 Content + Notes + Source**: Best for research
     - Main content with sources and notes
     - Preserves references and URLs
     - Copied as PNG image for Word compatibility

   - **🤖 AI Chatbot Format**: Best for AI conversations
     - XML-style delimiters: `<item id="1" type="text">...</item>`
     - Plain text with metadata (editable)
     - Easy for AI to parse and reference
     - Ideal for ChatGPT, Claude, or other LLMs

3. **Paste Anywhere**
   - Microsoft Word (all formats paste as images, except AI Chatbot Format)
   - AI Chatbots (AI Chatbot Format recommended - pastes as editable text)
   - Note-taking apps (any format)
   - Text editors (AI Chatbot Format for editable text)

### AI Chatbot Format Example

```
<item id="1" type="text" date="2/12/2026">
Sample research findings about the topic.

Note: Verify these claims
Source: Research Journal
URL: https://example.com/article
</item>

<item id="2" type="table" date="2/12/2026">
| Product | Price | Availability |
| ---------- | ---------- | ---------- |
| Widget A | $29.99 | In Stock |
| Widget B | $39.99 | Out of Stock |

[Table contains 1 embedded image]
</item>
```

Then ask the AI: "Can you summarize item 1 and analyze the pricing in item 2?"

## Tips & Best Practices

### Research Workflow
1. Create a project for your research topic
2. Open extension before browsing
3. Capture content as you research
4. Reorder items by dragging (keep related items adjacent)
5. Add notes to items for context
6. Use multiple projects to separate different research topics
7. Copy all when ready to create document

### Organization Tips
- **Use projects wisely**: Separate different topics or research areas
- **Add notes immediately**: Context helps later
- **Use source titles**: Makes items easier to identify
- **Reorder strategically**: Drag items to keep related content adjacent
- **Search regularly**: Find items quickly in large collections
- **Move between projects**: Right-click items to reorganize across projects

### Copy Format Selection
- **Word documents**: Use "Full (Structured)" or "Content + Notes + Source" (pastes as image)
- **AI prompts**: Use "AI Chatbot Format" (pastes as editable text)
- **Quick paste**: Use "Content + Notes" (pastes as image)
- **Research notes**: Use "Content + Notes + Source" (pastes as image)

### Performance Tips
- Extension handles hundreds of items efficiently per project
- Search is instant even with large collections
- Undo/redo available for current session only (per project)
- Data persists across browser restarts
- Each project maintains independent undo/redo history

## Keyboard Shortcuts

- **Alt+P**: Toggle project dropdown
- **Ctrl+Z / Cmd+Z**: Undo last operation (current project)
- **Ctrl+Y / Cmd+Y**: Redo operation (current project)
- **Ctrl+K / Cmd+K**: Focus search box (when popup open)

## Technical Details

- **Manifest Version**: V3 (latest Chrome standard)
- **Storage**: IndexedDB (browser local storage)
- **Permissions**: `<all_urls>` for content capture
- **Architecture**: Service worker + content scripts
- **CSP**: `script-src 'self'` (no inline scripts)

## File Structure

```
Content Writing Assistant/
├── manifest.json           # Extension configuration
├── popup.html/css/js       # Main UI popup
├── background.js           # Service worker (IndexedDB, messaging)
├── content-script.js/css   # Multi-element capture overlay
├── db-utils.js             # IndexedDB wrapper
├── undo-redo-utils.js      # Undo/redo functionality
├── html2canvas.min.js      # Image rendering for Word export
├── vendor/                 # Third-party libraries (SortableJS)
└── icons/                  # Extension icons
```

## Development

### Setup
```bash
# Clone repository
git clone https://github.com/David-Mazig/Content-Writing-Assistant-Chrome-Extension.git
cd Content-Writing-Assistant-Chrome-Extension

# Load in Chrome
# 1. Go to chrome://extensions/
# 2. Enable Developer mode
# 3. Click "Load unpacked"
# 4. Select the extension directory
```

### Development Workflow
1. Make changes to source files
2. Go to `chrome://extensions/`
3. Click refresh icon on extension card
4. Test changes in browser

### Debugging
- **Popup**: Right-click extension icon → Inspect
- **Background**: chrome://extensions/ → Inspect views: service worker
- **Content Script**: F12 on any webpage → Console
- **IndexedDB**: DevTools → Application → IndexedDB → ContentWritingAssistant

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

[Your License Here]

## Support

- **Issues**: [GitHub Issues](https://github.com/David-Mazig/Content-Writing-Assistant-Chrome-Extension/issues)
- **Discussions**: [GitHub Discussions](https://github.com/David-Mazig/Content-Writing-Assistant-Chrome-Extension/discussions)

## Changelog

### Version 1.1.0
- **Projects feature**: Organize content into separate projects
- Project switching with independent workspaces
- Move items between projects via context menu
- Per-project undo/redo history
- Project rename and delete functionality
- Improved keyboard shortcuts (Alt+P for projects)

### Version 1.0.0
- Multi-element capture (text, images, tables, links)
- Drag & drop reordering
- Session-scoped undo/redo
- Search functionality
- 4 copy formats including AI Chatbot Format
- Notes and metadata support
- Progressive disclosure UI
- 100% local storage (IndexedDB)
