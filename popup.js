/**
 * Content Writing Assistant - Popup Script
 * Uses unified IndexedDB storage for all content and media
 */

// Global state
let editingContentId = null;
let allContentCache = [];
let activeObjectURLs = [];

// In-memory undo/redo stacks (synced with chrome.storage.session)
// Constants and utilities are in undo-redo-utils.js (shared with background.js)
let undoStack = [];
let redoStack = [];

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await initializeStorage();
  await initUndoRedo();
  await displayStorageStats();
  await renderContentList();
  initializeEventListeners();
});

/**
 * Initialize UI event listeners
 */
function initializeEventListeners() {
  // Undo/Redo buttons
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);

  // New content button
  document.getElementById('btn-new-content').addEventListener('click', showNewContentModal);

  // Close modal
  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.getElementById('btn-cancel').addEventListener('click', closeModal);

  // Save content
  document.getElementById('btn-save-content').addEventListener('click', saveNewContent);

  // Media file input
  document.getElementById('input-media').addEventListener('change', handleMediaSelection);

  // Search input with debounce
  let searchTimeout;
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      renderContentList(e.target.value);
    }, 300);
  });

  // Add link button
  document.getElementById('btn-add-link').addEventListener('click', addLinkRow);

  // Event delegation for remove link buttons
  document.getElementById('links-container').addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-remove-link')) {
      const linkRow = e.target.closest('.link-row');
      const allRows = document.querySelectorAll('.link-row');
      if (allRows.length > 1) {
        linkRow.remove();
      } else {
        // Keep at least one row, just clear it
        linkRow.querySelector('.link-input').value = '';
      }
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Escape to close modal
    if (e.key === 'Escape') {
      const modal = document.getElementById('new-content-form');
      if (!modal.classList.contains('hidden')) {
        closeModal();
      }
    }

    // Ctrl/Cmd + K for search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('search-input').focus();
    }

    // Ctrl/Cmd + Z for undo (only when not in input/textarea)
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      const activeEl = document.activeElement;
      const isInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA';
      if (!isInput) {
        e.preventDefault();
        undo();
      }
    }

    // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z for redo (only when not in input/textarea)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      const activeEl = document.activeElement;
      const isInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA';
      if (!isInput) {
        e.preventDefault();
        redo();
      }
    }
  });

  // Listen for undo/redo state changes from background.js (popover saves)
  chrome.storage.session.onChanged.addListener((changes) => {
    if (changes[UndoRedoUtils.UNDO_REDO_KEY]) {
      // Reload stacks when changed externally (e.g., by background.js after popover save)
      initUndoRedo();
      // Also refresh content list to show new items
      renderContentList();
    }
  });
}

// ============================================
// Undo/Redo System
// ============================================

/**
 * Initialize undo/redo from chrome.storage.session
 */
async function initUndoRedo() {
  try {
    const state = await UndoRedoUtils.loadState();
    undoStack = state.undoStack;
    redoStack = state.redoStack;
    updateUndoRedoButtons();
  } catch (error) {
    console.error('Error initializing undo/redo:', error);
    undoStack = [];
    redoStack = [];
  }
}

/**
 * Save undo/redo state to chrome.storage.session
 */
async function saveUndoRedoState() {
  await UndoRedoUtils.saveState(undoStack, redoStack);
}

/**
 * Update undo/redo button states
 */
function updateUndoRedoButtons() {
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');

  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

/**
 * Record an action to the undo stack
 */
async function recordUndoAction(type, contentId, beforeSnapshot, afterSnapshot) {
  const action = {
    id: UndoRedoUtils.generateActionId(),
    type,
    contentId,
    timestamp: Date.now(),
    beforeSnapshot: await UndoRedoUtils.serializeContent(beforeSnapshot),
    afterSnapshot: await UndoRedoUtils.serializeContent(afterSnapshot)
  };

  undoStack.push(action);

  // Limit history size
  if (undoStack.length > UndoRedoUtils.MAX_UNDO_HISTORY) {
    undoStack.shift();
  }

  // Clear redo stack on new action
  redoStack = [];

  await saveUndoRedoState();
  updateUndoRedoButtons();
}

/**
 * Undo the last action
 */
async function undo() {
  if (undoStack.length === 0) return;

  const action = undoStack.pop();

  try {
    switch (action.type) {
      case 'create':
        // Undo create = delete the created content
        await DBUtils.deleteContent(action.contentId);
        break;

      case 'update':
        // Undo update = restore beforeSnapshot
        const beforeContent = UndoRedoUtils.deserializeContent(action.beforeSnapshot);
        await DBUtils.saveContent(action.contentId, {
          text: beforeContent.text,
          links: beforeContent.links,
          media: beforeContent.media,
          created: beforeContent.created,
          contentType: beforeContent.contentType
        });
        break;

      case 'delete':
        // Undo delete = recreate content with same ID
        const deletedContent = UndoRedoUtils.deserializeContent(action.beforeSnapshot);
        await DBUtils.saveContent(action.contentId, {
          text: deletedContent.text,
          links: deletedContent.links,
          media: deletedContent.media,
          created: deletedContent.created,
          contentType: deletedContent.contentType
        });
        break;
    }

    // Move to redo stack
    redoStack.push(action);

    await saveUndoRedoState();
    updateUndoRedoButtons();
    await renderContentList();
  } catch (error) {
    console.error('Error during undo:', error);
    // Push back to undo stack on error
    undoStack.push(action);
  }
}

/**
 * Redo the last undone action
 */
async function redo() {
  if (redoStack.length === 0) return;

  const action = redoStack.pop();

  try {
    switch (action.type) {
      case 'create':
        // Redo create = recreate the content
        const createdContent = UndoRedoUtils.deserializeContent(action.afterSnapshot);
        await DBUtils.saveContent(action.contentId, {
          text: createdContent.text,
          links: createdContent.links,
          media: createdContent.media,
          created: createdContent.created,
          contentType: createdContent.contentType
        });
        break;

      case 'update':
        // Redo update = restore afterSnapshot
        const afterContent = UndoRedoUtils.deserializeContent(action.afterSnapshot);
        await DBUtils.saveContent(action.contentId, {
          text: afterContent.text,
          links: afterContent.links,
          media: afterContent.media,
          created: afterContent.created,
          contentType: afterContent.contentType
        });
        break;

      case 'delete':
        // Redo delete = delete the content again
        await DBUtils.deleteContent(action.contentId);
        break;
    }

    // Move back to undo stack
    undoStack.push(action);

    await saveUndoRedoState();
    updateUndoRedoButtons();
    await renderContentList();
  } catch (error) {
    console.error('Error during redo:', error);
    // Push back to redo stack on error
    redoStack.push(action);
  }
}

// ============================================
// End Undo/Redo System
// ============================================

/**
 * Show new content modal
 */
function showNewContentModal() {
  const modal = document.getElementById('new-content-form');
  modal.classList.remove('hidden');

  // Store currently focused element
  modal.dataset.previousFocus = document.activeElement;

  // Focus first input
  setTimeout(() => {
    document.getElementById('input-text').focus();
  }, 100);

  // Add focus trap
  modal.addEventListener('keydown', trapFocus);
}

/**
 * Trap focus within modal
 */
function trapFocus(e) {
  if (e.key !== 'Tab') return;

  const modal = document.getElementById('new-content-form');
  const focusable = modal.querySelectorAll(
    'button, input, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstFocusable = focusable[0];
  const lastFocusable = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === firstFocusable) {
    lastFocusable.focus();
    e.preventDefault();
  } else if (!e.shiftKey && document.activeElement === lastFocusable) {
    firstFocusable.focus();
    e.preventDefault();
  }
}

/**
 * Add new link row
 */
function addLinkRow() {
  const container = document.getElementById('links-container');
  const newRow = document.createElement('div');
  newRow.className = 'link-row';
  newRow.innerHTML = `
    <input type="url" class="link-input" placeholder="https://..." aria-label="Link URL" />
    <button class="btn-remove-link" aria-label="Remove link">&times;</button>
  `;
  container.appendChild(newRow);
  newRow.querySelector('.link-input').focus();
}

/**
 * Close the new content modal
 */
function closeModal() {
  const modal = document.getElementById('new-content-form');
  modal.classList.add('hidden');
  modal.removeEventListener('keydown', trapFocus);

  // Reset form
  document.getElementById('input-text').value = '';
  document.getElementById('input-media').value = '';
  document.getElementById('media-preview').innerHTML = '';

  // Reset links to single empty row
  const linksContainer = document.getElementById('links-container');
  linksContainer.innerHTML = `
    <div class="link-row">
      <input type="url" class="link-input" placeholder="https://..." aria-label="Link URL" />
      <button class="btn-remove-link" aria-label="Remove link">&times;</button>
    </div>
  `;

  // Reset edit state
  editingContentId = null;
  document.getElementById('modal-title').textContent = 'New Content';

  // Restore focus
  if (modal.dataset.previousFocus) {
    try {
      modal.dataset.previousFocus.focus();
    } catch (e) {
      // Element may no longer exist
    }
    delete modal.dataset.previousFocus;
  }
}

/**
 * Handle media file selection with preview
 */
function handleMediaSelection(event) {
  const files = event.target.files;
  const preview = document.getElementById('media-preview');
  preview.innerHTML = '';

  if (files.length === 0) return;

  Array.from(files).forEach((file, index) => {
    const previewItem = document.createElement('div');
    previewItem.className = 'media-preview-item';

    const isImage = file.type.startsWith('image/');
    const isAudio = file.type.startsWith('audio/');
    const isVideo = file.type.startsWith('video/');

    // Create thumbnail for images
    if (isImage) {
      const img = document.createElement('img');
      img.className = 'media-preview-thumbnail';
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
      previewItem.appendChild(img);
    } else if (isAudio) {
      const iconDiv = document.createElement('div');
      iconDiv.className = 'media-preview-icon audio-icon';
      iconDiv.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <path d="M9 18V5l12-2v13M9 18c0 1.657-1.343 3-3 3s-3-1.343-3-3 1.343-3 3-3 3 1.343 3 3zm12-2c0 1.657-1.343 3-3 3s-3-1.343-3-3 1.343-3 3-3 3 1.343 3 3z" stroke="currentColor" stroke-width="2"/>
        </svg>
      `;
      previewItem.appendChild(iconDiv);
    } else if (isVideo) {
      const iconDiv = document.createElement('div');
      iconDiv.className = 'media-preview-icon video-icon';
      iconDiv.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <path d="M23 7l-7 5 7 5V7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" stroke="currentColor" stroke-width="2"/>
        </svg>
      `;
      previewItem.appendChild(iconDiv);
    }

    // File info
    const info = document.createElement('div');
    info.className = 'media-preview-info';
    info.innerHTML = `
      <div class="media-preview-name">${file.name}</div>
      <div class="media-preview-size">${formatFileSize(file.size)}</div>
    `;
    previewItem.appendChild(info);

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'media-preview-remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove';
    removeBtn.onclick = (e) => {
      e.preventDefault();
      // Remove this file from the input
      const dt = new DataTransfer();
      const inputFiles = document.getElementById('input-media').files;

      for (let i = 0; i < inputFiles.length; i++) {
        if (i !== index) dt.items.add(inputFiles[i]);
      }

      document.getElementById('input-media').files = dt.files;
      previewItem.remove();
    };
    previewItem.appendChild(removeBtn);

    preview.appendChild(previewItem);
  });
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Save new or edited content from form
 */
async function saveNewContent() {
  try {
    const text = document.getElementById('input-text').value;

    // Collect all links from multiple inputs
    const linkInputs = document.querySelectorAll('.link-input');
    const links = Array.from(linkInputs)
      .map(input => input.value.trim())
      .filter(link => link.length > 0);

    const mediaFiles = Array.from(document.getElementById('input-media').files);

    if (!text && mediaFiles.length === 0) {
      alert('Please enter some text or add media');
      return;
    }

    if (editingContentId) {
      // Update existing content
      await updateContent(editingContentId, text, links, mediaFiles);
    } else {
      // Create new content
      await createContent(text, links, mediaFiles);
    }

    closeModal();
  } catch (error) {
    console.error('Error saving content:', error);
    alert('Failed to save content: ' + error.message);
  }
}

/**
 * Update existing content
 */
async function updateContent(contentId, text, links = [], mediaFiles = []) {
  try {
    // Load existing content (beforeSnapshot for undo)
    const existingContent = await DBUtils.getContent(contentId);
    if (!existingContent) {
      throw new Error('Content not found');
    }

    // Deep copy for beforeSnapshot
    const beforeSnapshot = {
      ...existingContent,
      media: existingContent.media.map(m => ({ ...m }))
    };

    // Process new media files if any
    const newMedia = [];
    for (const file of mediaFiles) {
      if (file instanceof File) {
        const blob = new Blob([await file.arrayBuffer()], { type: file.type });

        // Determine media type
        let mediaType = 'media';
        if (file.type.startsWith('image/')) mediaType = 'image';
        else if (file.type.startsWith('audio/')) mediaType = 'audio';
        else if (file.type.startsWith('video/')) mediaType = 'video';

        newMedia.push({
          type: mediaType,
          mimeType: file.type,
          blob: blob,
          name: file.name
        });
      }
    }

    // Combine existing media with new media
    const allMedia = [...existingContent.media, ...newMedia];

    // Save updated content
    await DBUtils.saveContent(contentId, {
      text,
      links,
      media: allMedia
    });

    // Record undo action
    const afterSnapshot = await DBUtils.getContent(contentId);
    await recordUndoAction('update', contentId, beforeSnapshot, afterSnapshot);

    await renderContentList();
  } catch (error) {
    console.error('Error updating content:', error);
    throw error;
  }
}

/**
 * Edit content (open modal with existing data)
 */
async function editContent(contentId) {
  try {
    const content = await DBUtils.getContent(contentId);
    if (!content) {
      alert('Content not found');
      return;
    }

    // Populate text
    document.getElementById('input-text').value = content.text;

    // Clear and populate links
    const container = document.getElementById('links-container');
    container.innerHTML = '';

    const linksToShow = content.links.length > 0 ? content.links : [''];
    linksToShow.forEach(link => {
      const row = document.createElement('div');
      row.className = 'link-row';
      row.innerHTML = `
        <input type="url" class="link-input" placeholder="https://..." value="${link}" aria-label="Link URL" />
        <button class="btn-remove-link" aria-label="Remove link">&times;</button>
      `;
      container.appendChild(row);
    });

    // Show existing media (note: can't pre-populate file input for security reasons)
    // But we keep existing media in the update function
    const preview = document.getElementById('media-preview');
    preview.innerHTML = '';

    if (content.media.length > 0) {
      const notice = document.createElement('div');
      notice.className = 'media-count';
      notice.textContent = `${content.media.length} existing media file(s). Add new files to append.`;
      preview.appendChild(notice);
    }

    // Set edit mode
    editingContentId = contentId;
    document.getElementById('modal-title').textContent = 'Edit Content';

    // Show modal
    showNewContentModal();
  } catch (error) {
    console.error('Error loading content for edit:', error);
    alert('Failed to load content: ' + error.message);
  }
}

/**
 * Initialize database
 */
async function initializeStorage() {
  try {
    await DBUtils.openDatabase();
  } catch (error) {
    console.error('Storage initialization error:', error);
  }
}

/**
 * Display storage statistics in console
 */
async function displayStorageStats() {
  try {
    const allContent = await DBUtils.getAllContent();
    const quotaInfo = await DBUtils.getStorageEstimate();
  } catch (error) {
    console.error('Error displaying storage stats:', error);
  }
}

/**
 * Create new content with media
 */
async function createContent(text, links = [], mediaFiles = []) {
  try {
    const media = [];

    // Process media files
    for (const file of mediaFiles) {
      if (file instanceof File) {
        const blob = new Blob([await file.arrayBuffer()], { type: file.type });

        // Determine media type
        let mediaType = 'media';
        if (file.type.startsWith('image/')) mediaType = 'image';
        else if (file.type.startsWith('audio/')) mediaType = 'audio';
        else if (file.type.startsWith('video/')) mediaType = 'video';

        media.push({
          type: mediaType,
          mimeType: file.type,
          blob: blob,
          name: file.name
        });
      }
    }

    // Save content with embedded media
    const contentId = await DBUtils.saveContent(null, {
      text,
      links,
      media
    });

    // Record undo action (create: beforeSnapshot is null, afterSnapshot is created content)
    const createdContent = await DBUtils.getContent(contentId);
    await recordUndoAction('create', contentId, null, createdContent);

    await renderContentList();
    return contentId;
  } catch (error) {
    console.error('Error creating content:', error);
    throw error;
  }
}

/**
 * Load content by ID
 */
async function loadContent(contentId) {
  try {
    const content = await DBUtils.getContent(contentId);
    if (!content) {
      return null;
    }

    return content;
  } catch (error) {
    console.error('Error loading content:', error);
    throw error;
  }
}

/**
 * List all content
 */
async function listAllContent() {
  try {
    const allContent = await DBUtils.getAllContent();
    return allContent;
  } catch (error) {
    console.error('Error listing content:', error);
    throw error;
  }
}

/**
 * Delete content (media is embedded, so it's automatically deleted)
 */
async function deleteContent(contentId) {
  try {
    // Capture content before deletion for undo
    const beforeSnapshot = await DBUtils.getContent(contentId);

    await DBUtils.deleteContent(contentId);

    // Record undo action (delete: afterSnapshot is null)
    if (beforeSnapshot) {
      await recordUndoAction('delete', contentId, beforeSnapshot, null);
    }

    await renderContentList();
  } catch (error) {
    console.error('Error deleting content:', error);
    throw error;
  }
}

/**
 * Render content list in the UI with optional search filter
 */
async function renderContentList(searchQuery = '') {
  try {
    const container = document.getElementById('content-list');
    if (!container) return;

    // Show skeleton loader
    container.innerHTML = `
      <div class="skeleton-item"></div>
      <div class="skeleton-item"></div>
      <div class="skeleton-item"></div>
    `;

    // Revoke all previous object URLs before re-rendering
    activeObjectURLs.forEach(url => URL.revokeObjectURL(url));
    activeObjectURLs = [];

    const contentList = await DBUtils.getAllContent();
    allContentCache = contentList;

    // Filter based on search
    const filtered = searchQuery
      ? contentList.filter(c =>
          c.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.links.some(l => l.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      : contentList;

    container.innerHTML = '';

    if (filtered.length === 0) {
      if (searchQuery) {
        container.innerHTML = '<div class="empty-state">No results found for "' + searchQuery + '"</div>';
      } else {
        container.innerHTML = '<div class="empty-state">No content yet. Create your first item!</div>';
      }
      return;
    }

    for (const content of filtered) {
      const itemEl = createContentItemElement(content);
      container.appendChild(itemEl);
    }
  } catch (error) {
    console.error('Error rendering content list:', error);
  }
}

// Cleanup on popup close
window.addEventListener('beforeunload', () => {
  activeObjectURLs.forEach(url => URL.revokeObjectURL(url));
});

/**
 * Create table preview HTML from table data
 */
function createTablePreview(tableData) {
  if (!tableData || !tableData.headers || !tableData.rows) {
    return '<div class="table-preview-error">Invalid table data</div>';
  }

  const { headers, rows } = tableData;
  const maxPreviewRows = 3;
  const previewRows = rows.slice(0, maxPreviewRows);
  const hasMoreRows = rows.length > maxPreviewRows;

  let html = '<div class="table-preview-container">';
  html += '<table class="table-preview">';

  // Headers
  if (headers.length > 0) {
    html += '<thead><tr>';
    headers.forEach(header => {
      html += `<th>${escapeHtml(header)}</th>`;
    });
    html += '</tr></thead>';
  }

  // Data rows (limited to preview)
  html += '<tbody>';
  previewRows.forEach(row => {
    html += '<tr>';
    row.forEach(cell => {
      html += `<td>${escapeHtml(cell)}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody>';

  html += '</table>';

  if (hasMoreRows) {
    html += `<div class="table-preview-more">... ${rows.length - maxPreviewRows} more row(s)</div>`;
  }

  html += '</div>';

  return html;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Create DOM element for a content item with new design
 */
function createContentItemElement(content) {
  const div = document.createElement('div');
  div.className = 'content-item';
  div.dataset.contentId = content.key;

  // Format date with time
  const date = new Date(content.modified);
  const dateStr = date.toLocaleDateString() + ', ' +
                  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Determine content type and badge class
  const hasImage = content.media.some(m => m.type === 'image');
  const hasTable = content.media.some(m => m.type === 'table');
  const hasAudio = content.media.some(m => m.type === 'audio');
  const hasVideo = content.media.some(m => m.type === 'video');
  const isLinkType = content.contentType === 'link';

  let contentTypeBadge = 'TEXT';
  let badgeClass = 'badge-text';
  let typeIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
  </svg>`;

  if (hasTable) {
    contentTypeBadge = 'TABLE';
    badgeClass = 'badge-table';
    typeIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
    </svg>`;
  } else if (hasImage) {
    contentTypeBadge = 'IMAGE';
    badgeClass = 'badge-image';
    typeIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>`;
  } else if (hasVideo) {
    contentTypeBadge = 'VIDEO';
    badgeClass = 'badge-video';
    typeIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="2" y="4" width="16" height="16" rx="2"/>
      <path d="M22 7l-4 3.5L22 14V7z"/>
    </svg>`;
  } else if (hasAudio) {
    contentTypeBadge = 'AUDIO';
    badgeClass = 'badge-audio';
    typeIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M9 18V5l12-2v13"/>
      <circle cx="6" cy="18" r="3"/>
      <circle cx="18" cy="16" r="3"/>
    </svg>`;
  } else if (isLinkType) {
    contentTypeBadge = 'LINK';
    badgeClass = 'badge-link';
    typeIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>`;
  }

  // Extract source domain
  let sourceDomain = '';
  if (content.links.length > 0) {
    try {
      const url = new URL(content.links[0]);
      sourceDomain = url.hostname.replace('www.', '');
    } catch {}
  }

  // Text preview - 80 chars for compact mode
  const textPreview = content.text.substring(0, 80) +
                     (content.text.length > 80 ? '...' : '');

  // Generate table preview HTML
  const tablePreviewsHtml = content.media
    .filter(m => m.type === 'table')
    .slice(0, 1)
    .map(m => createTablePreview(m.data))
    .join('');

  // Action buttons HTML (reused)
  const actionButtonsHtml = `
    <button class="btn-edit" data-content-id="${content.key}" title="Edit">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2"/>
      </svg>
    </button>
    <button class="btn-delete" data-content-id="${content.key}" title="Delete">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" stroke="currentColor" stroke-width="2"/>
      </svg>
    </button>
  `;

  div.innerHTML = `
    <!-- Hover actions (shown when not expanded) -->
    <div class="content-actions-hover">
      ${actionButtonsHtml}
    </div>

    <!-- Header with meta (shown when expanded) -->
    <div class="content-header">
      <div class="content-meta">
        <span class="content-type-badge ${badgeClass}">${contentTypeBadge}</span>
        <span class="content-date">${dateStr}</span>
      </div>
      <div class="content-actions-expanded">
        ${actionButtonsHtml}
      </div>
    </div>

    <div class="content-body">
      <span class="content-type-icon ${badgeClass}">${typeIcon}</span>
      <div class="content-text">${textPreview || '<em>No text</em>'}</div>

      ${sourceDomain ? `<div class="content-source">Source: ${sourceDomain}</div>` : ''}

      ${tablePreviewsHtml}

      ${content.media.filter(m => m.type === 'image').length > 0 ? `
        <div class="content-thumbnails">
          ${content.media.filter(m => m.type === 'image').slice(0, 4).map((m, i) => {
            const url = DBUtils.createObjectURL(m.blob);
            activeObjectURLs.push(url);
            return `<img src="${url}" class="content-thumbnail" alt="${m.name}">`;
          }).join('')}
          ${content.media.filter(m => m.type === 'image').length > 4 ?
            `<div class="thumbnail-more">+${content.media.filter(m => m.type === 'image').length - 4}</div>` : ''}
        </div>
      ` : ''}
    </div>
  `;

  // Click card to toggle expansion
  div.addEventListener('click', (e) => {
    // Don't toggle if clicking on buttons or links
    if (e.target.closest('.btn-edit') || e.target.closest('.btn-delete') ||
        e.target.closest('button') || e.target.closest('a')) {
      return;
    }
    toggleCardExpansion(div, content);
  });

  // Add event listeners for all edit/delete buttons
  div.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editContent(content.key);
    });
  });

  div.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteContent(content.key);
    });
  });

  return div;
}

/**
 * Toggle card expansion
 */
function toggleCardExpansion(cardElement, content) {
  const isExpanded = cardElement.classList.contains('expanded');

  if (isExpanded) {
    // Collapse
    cardElement.classList.remove('expanded');

    // Remove expanded content
    const expandedSection = cardElement.querySelector('.content-expanded');
    if (expandedSection) {
      expandedSection.remove();
    }
  } else {
    // Expand
    cardElement.classList.add('expanded');

    // Scroll card into view
    setTimeout(() => {
      cardElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);

    // Create expanded content section
    const expandedSection = document.createElement('div');
    expandedSection.className = 'content-expanded';

    let expandedHTML = `
      <div class="content-full-text">${content.text}</div>
    `;

    // Show all links
    if (content.links.length > 0) {
      expandedHTML += `
        <div class="content-links-list">
          <div class="section-label">Links:</div>
          ${content.links.map(link => `
            <a href="${link}" target="_blank" class="content-link">
              ${link}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" stroke-width="2"/>
              </svg>
            </a>
          `).join('')}
        </div>
      `;
    }

    // Show all media
    const allImages = content.media.filter(m => m.type === 'image');
    if (allImages.length > 0) {
      expandedHTML += `
        <div class="content-all-media">
          <div class="section-label">Images:</div>
          <div class="media-grid">
            ${allImages.map(m => {
              const url = DBUtils.createObjectURL(m.blob);
              activeObjectURLs.push(url);
              return `
                <div class="media-item">
                  <img src="${url}" alt="${m.name}" />
                  <div class="media-name">${m.name}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    expandedSection.innerHTML = expandedHTML;
    cardElement.querySelector('.content-body').appendChild(expandedSection);
  }
}

// Make functions available in global scope for testing
window.ContentAssistant = {
  createContent,
  loadContent,
  listAllContent,
  deleteContent,
  renderContentList,
  undo,
  redo,
  DBUtils
};
