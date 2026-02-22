# Content Writing Assistant — User Manual
Version 1.1.0 | Current

---

## Overview

**Content Writing Assistant** is a Chrome browser extension for collecting and organizing content from the web. Capture text, images, tables, and links from any page. All data stays on your device — no accounts, no cloud sync, no internet required.

---

## Getting Started

### Requirements

- Google Chrome browser (required)
- No account or login needed

### Installation

**How to use it:**
1. Download the extension folder from GitHub (or extract the ZIP file)
2. Open Chrome and go to `chrome://extensions/`
3. Turn on **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the extension folder
5. Click the puzzle icon in Chrome's toolbar and pin **Content Writing Assistant**

> 💡 Tip: Pinning the icon to the toolbar gives you one-click access at all times.

---

## Capturing Content

The extension lets you capture content from any webpage in four ways.

### Capturing Text

**What it does:** Saves any text you select on a webpage, along with an optional note.

**How to use it:**
1. Select any text on a webpage by clicking and dragging
2. A small popup appears near your selection
3. Optionally type a note in the popup
4. Press **Enter** or click **Save**

> 💡 Tip: Press **Escape** to dismiss the popup without saving.

---

### Capturing Images

**What it does:** Saves an image from any webpage, including its source URL.

**How to use it:**
1. Hover your mouse over an image on any webpage
2. Hold still for 1 full second
3. A capture popup appears
4. Click **Save**

**What to expect:**
- Images smaller than 50×50 pixels are ignored
- Some images on protected websites cannot be saved. You'll see an "Image protected" message. Save the image manually instead.

---

### Capturing Tables

**What it does:** Saves a table from a webpage, preserving its structure and any embedded images.

**How to use it:**
1. Hover your mouse over a table on any webpage
2. Hold still for 1 full second
3. A capture popup appears
4. Click **Save**

**What to expect:**
- Tables with fewer than 2 rows are ignored

---

### Capturing Links

**What it does:** Saves a hyperlink along with its display text and destination URL.

**How to use it:**
1. Hover your mouse over a link on any webpage
2. Hold still for 1 full second
3. A capture popup appears
4. Click **Save**

---

### Capturing Overlapping Elements

**What it does:** When hovering over nested elements (e.g., an image inside a link), lets you choose what to capture.

**How to use it:**
1. Hover over the element for 1 second
2. A menu appears with options: **Image**, **Link**, **Table**, or **All**
3. Click the type of content you want to save

---

### Creating Content Manually

**What it does:** Lets you add content directly — without capturing from a webpage.

**How to use it:**
1. Click the extension icon to open the popup
2. Click **+ New** in the top-right
3. Type or paste your text into the text area
4. Optionally add links by clicking **+ Add another link**
5. Optionally attach images, audio, or video by clicking **Add Media**
6. Click **Save**

---

## Managing Your Content

### Viewing Items

**What it does:** Shows all saved items in your current project as a scrollable list.

**How to use it:**
1. Click the extension icon to open the popup
2. Scroll through the list of saved items
3. Click any item to expand it and see full details
4. Click again to collapse it

---

### Searching

**What it does:** Filters your saved items by keyword. Searches across text, notes, source URLs, and link text.

**How to use it:**
1. Click inside the search bar at the top of the popup (or press **Ctrl+K**)
2. Type a keyword
3. The list updates instantly to show matching items

---

### Editing an Item

**What it does:** Lets you modify the text or notes of a saved item.

**How to use it:**
1. Find the item in the list
2. Click the **pencil icon** on the item
3. Make your changes in the edit form
4. Click **Save**

---

### Deleting an Item

**What it does:** Removes a single item from your list.

**How to use it:**
1. Find the item in the list
2. Click the **trash icon** on the item
3. The item is removed immediately

> 💡 Tip: Press **Ctrl+Z** immediately after to undo the deletion.

---

### Reordering Items

**What it does:** Changes the order of items in your list by dragging.

**How to use it:**
1. Click and hold an item for about half a second
2. The item becomes draggable
3. Drag it to the new position
4. Release to drop it

---

### Undo and Redo

**What it does:** Reverses or re-applies your last action (delete, reorder, edit).

**How to use it:**
1. Press **Ctrl+Z** to undo
2. Press **Ctrl+Y** to redo
3. Or click the undo/redo arrow buttons in the top-left of the popup

**What to expect:**
- Undo/redo history is cleared when you close the popup
- Maximum of 100 actions stored per session

---

### Deleting All Items

**What it does:** Removes every item in the current project at once.

**How to use it:**
1. Click the **trash icon** in the popup header (Delete All button)
2. Confirm the action when prompted

> 💡 Tip: This only deletes items in the currently active project.

---

## Projects

**Projects** are separate workspaces for organizing your content. Each project has its own list of items.

### Creating a Project

**What it does:** Adds a new, empty workspace.

**How to use it:**
1. Click the **folder icon** (project selector) near the top of the popup
2. Click the **+** button in the project dropdown
3. Type a name (2–50 characters)
4. Press **Enter** or click confirm

**What to expect:**
- If you already have items, a **migration dialog** appears asking whether to move, copy, or keep items separate

---

### Switching Projects

**What it does:** Changes which project's items are shown in the list.

**How to use it:**
1. Click the **folder icon** to open the project dropdown
2. Click the project name you want to switch to

---

### Renaming a Project

**How to use it:**
1. Open the project dropdown
2. Click the **⋮ menu** next to the project name
3. Select **Rename**
4. Enter the new name and confirm

---

### Deleting a Project

**How to use it:**
1. Open the project dropdown
2. Click the **⋮ menu** next to the project name
3. Select **Delete**

**What to expect:**
- The default project cannot be deleted

---

### Moving an Item to Another Project

**What it does:** Transfers a saved item from the current project to a different one.

**How to use it:**
1. Right-click on an item in the list
2. Select **Move to Project**
3. Choose the destination project

---

## Exporting Content

### Copy All

**What it does:** Copies all items in the current project to your clipboard in your chosen format.

**How to use it:**
1. Click the **Copy** icon in the popup header
2. A menu appears with four format options
3. Click a format to copy to clipboard
4. Paste into your document or chat

| Format | Best for |
|---|---|
| **Full (Structured)** | Word documents, full archives |
| **Content + Notes** | Clean documents without source info |
| **Content + Notes + Source** | Research with reference URLs |
| **AI Chatbot** | Pasting into ChatGPT, Claude, or other AI tools |

> 💡 Tip: The **AI Chatbot** format uses `<item id="N">` tags so the AI can reference specific items by number (e.g., "summarize item 3").

---

## Storage & Privacy

- All content is stored **locally** in your browser using IndexedDB
- Nothing is sent to any server, no tracking, no analytics
- Data is stored in plaintext (not encrypted)
- Uninstalling the extension deletes all stored data

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| **Enter** | Save content (in capture popup) |
| **Escape** | Cancel / Close any popup or modal |
| **Ctrl+K** | Focus the search bar |
| **Ctrl+Z** | Undo last action |
| **Ctrl+Y** | Redo last undone action |

---

## Troubleshooting

**"Refresh page" error appears**
After updating the extension, reload the webpage you're trying to capture from.

**"Image protected" message**
The website blocks direct image access. Save the image to your computer and use **+ New → Add Media** to attach it manually.

**Hover popup doesn't appear**
Hold your mouse completely still for the full second. Check that the element is at least 50×50px (for images) or has at least 2 rows (for tables).

**Content seems missing**
Check the project selector — you may be viewing a different project than where the item was saved.

**Undo is not available after reopening the popup**
Undo history is session-scoped and clears when the popup is closed. This is by design.
