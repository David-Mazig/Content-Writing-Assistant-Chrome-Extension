/**
 * Content Writing Assistant - Popup Script
 * Uses unified IndexedDB storage for all content and media
 */

// Global state
let editingContentId = null;
let allContentCache = [];
let activeObjectURLs = [];

// Drag-and-drop state
let sortableInstance = null;
let dropIndicator = null;
let orderBeforeDrag = [];

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

  // Delete all button
  document.getElementById('btn-delete-all').addEventListener('click', deleteAllContent);

  // Copy all button and dropdown
  document.getElementById('btn-copy-all').addEventListener('click', toggleCopyMenu);
  document.querySelectorAll('.copy-menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const format = e.currentTarget.dataset.format;
      copyAllContent(format);
      closeCopyMenu();
    });
  });
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.copy-dropdown')) {
      closeCopyMenu();
    }
  });

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

  // Initialize drag-and-drop sorting
  initializeSortable();
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
  const deleteAllBtn = document.getElementById('btn-delete-all');
  const copyAllBtn = document.getElementById('btn-copy-all');

  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;

  // Enable delete-all and copy-all buttons only if there are items
  if (deleteAllBtn) deleteAllBtn.disabled = allContentCache.length === 0;
  if (copyAllBtn) copyAllBtn.disabled = allContentCache.length === 0;
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

      case 'reorder':
        // Undo reorder = restore beforeOrder
        await DBUtils.updateContentOrder(action.beforeOrder);
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

      case 'reorder':
        // Redo reorder = restore afterOrder
        await DBUtils.updateContentOrder(action.afterOrder);
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

// ============================================
// Drag and Drop / Reordering System
// ============================================

/**
 * Create drop indicator element
 */
function createDropIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'drop-indicator';
  indicator.style.display = 'none';
  return indicator;
}

/**
 * Position drop indicator
 */
function positionDropIndicator(indicator, targetEl, insertAfter) {
  if (!targetEl) {
    indicator.style.display = 'none';
    return;
  }

  const rect = targetEl.getBoundingClientRect();
  const containerRect = targetEl.parentElement.getBoundingClientRect();

  indicator.style.display = 'block';
  if (insertAfter) {
    indicator.style.top = (rect.bottom - containerRect.top) + 'px';
  } else {
    indicator.style.top = (rect.top - containerRect.top) + 'px';
  }
}

/**
 * Update cache with new order
 */
function updateCacheOrder(newOrder) {
  const orderMap = new Map(newOrder.map((item, index) => [item.key, index]));
  allContentCache.forEach(item => {
    if (orderMap.has(item.key)) {
      item.order = orderMap.get(item.key);
    }
  });
  allContentCache.sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * Initialize SortableJS for drag-and-drop reordering
 */
function initializeSortable() {
  const contentList = document.getElementById('content-list');
  if (!contentList) return;

  // Destroy existing sortable instance
  if (sortableInstance) {
    sortableInstance.destroy();
    sortableInstance = null;
  }

  // Create drop indicator if not exists
  if (!dropIndicator) {
    dropIndicator = createDropIndicator();
    contentList.appendChild(dropIndicator);
  }

  // Initialize SortableJS
  sortableInstance = Sortable.create(contentList, {
    animation: 150,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    delay: 150,
    fallbackTolerance: 5,
    filter: '.expanded, .btn-edit, .btn-delete, .content-actions-hover',
    draggable: '.content-item:not(.expanded)',
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',

    onStart: (evt) => handleDragStart(evt),
    onMove: (evt) => handleDragMove(evt),
    onEnd: (evt) => handleDragEnd(evt)
  });
}

/**
 * Handle drag start
 */
function handleDragStart(evt) {
  const contentList = document.getElementById('content-list');
  contentList.classList.add('drag-active');

  // Capture order before drag
  orderBeforeDrag = allContentCache.map((item, index) => ({
    key: item.key,
    order: index
  }));
}

/**
 * Handle drag move
 */
function handleDragMove(evt) {
  const { related, willInsertAfter } = evt;

  if (related && related.classList.contains('content-item')) {
    positionDropIndicator(dropIndicator, related, willInsertAfter);
  }

  return true;
}

/**
 * Handle drag end
 */
async function handleDragEnd(evt) {
  const contentList = document.getElementById('content-list');
  contentList.classList.remove('drag-active');

  if (dropIndicator) {
    dropIndicator.style.display = 'none';
  }

  // Get the dragged item
  const draggedElement = evt.item;
  const contentId = draggedElement.dataset.contentId;

  if (!contentId || evt.oldIndex === evt.newIndex) {
    return; // No change
  }

  try {
    // Get all content items in new order
    const contentItems = Array.from(contentList.querySelectorAll('.content-item'));
    const newOrder = contentItems.map((item, index) => ({
      key: item.dataset.contentId,
      order: index
    }));

    // Update database with new order
    await DBUtils.updateContentOrder(newOrder);

    // Update cache
    updateCacheOrder(newOrder);

    // Record undo action
    await UndoRedoUtils.recordReorderAction(orderBeforeDrag, newOrder);
    await initUndoRedo(); // Reload undo/redo state

    // Show success animation
    draggedElement.classList.add('reorder-success');
    setTimeout(() => {
      draggedElement.classList.remove('reorder-success');
    }, 400);

    // Maintain focus on dragged item
    draggedElement.focus();
  } catch (error) {
    console.error('Error saving reorder:', error);
    // Revert to original order on error
    await renderContentList();
  }
}

// ============================================
// End Drag and Drop System
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
 * Delete all content with confirmation
 */
async function deleteAllContent() {
  try {
    // Get all content items
    const allContent = await DBUtils.getAllContent();

    if (allContent.length === 0) {
      return; // Nothing to delete
    }

    // Show confirmation dialog
    const confirmMessage = `Are you sure you want to delete all ${allContent.length} content item${allContent.length > 1 ? 's' : ''}?\n\nThis action can be undone.`;
    if (!confirm(confirmMessage)) {
      return; // User cancelled
    }

    // Record each deletion for undo (in reverse order for proper restoration)
    // We'll record all items as individual undo actions
    for (const content of allContent) {
      // Capture content before deletion
      const beforeSnapshot = await DBUtils.getContent(content.key);

      // Delete the content
      await DBUtils.deleteContent(content.key);

      // Record undo action
      if (beforeSnapshot) {
        await recordUndoAction('delete', content.key, beforeSnapshot, null);
      }
    }

    // Refresh the content list
    await renderContentList();

    console.log(`Successfully deleted ${allContent.length} content item(s)`);
  } catch (error) {
    console.error('Error deleting all content:', error);
    alert('Failed to delete all content: ' + error.message);
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

    // Reinitialize sortable after DOM updates
    initializeSortable();

    // Update button states after rendering
    updateUndoRedoButtons();
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
      <div class="content-text">${textPreview ? escapeHtml(textPreview) : '<em>No text</em>'}</div>

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
      <div class="content-full-text">${escapeHtml(content.text)}</div>
    `;

    // Show all links
    if (content.links.length > 0) {
      expandedHTML += `
        <div class="content-links-list">
          <div class="section-label">Links:</div>
          ${content.links.map(link => `
            <a href="${link}" target="_blank" class="content-link">
              ${escapeHtml(link)}
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
                  <div class="media-name">${escapeHtml(m.name)}</div>
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

// ============================================
// Copy All Functions
// ============================================

/**
 * Toggle the copy dropdown menu visibility
 */
function toggleCopyMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('copy-menu');
  menu.classList.toggle('show');
}

/**
 * Close the copy dropdown menu
 */
function closeCopyMenu() {
  const menu = document.getElementById('copy-menu');
  menu.classList.remove('show');
}

/**
 * Convert a Blob to base64 data URI
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert table data to tab-separated values (for Word paste)
 */
function tableToTSV(tableData) {
  const { headers, rows } = tableData;
  const lines = [];
  if (headers && headers.length > 0) {
    lines.push(headers.join('\t'));
  }
  if (rows) {
    rows.forEach(row => lines.push(row.join('\t')));
  }
  return lines.join('\n');
}

/**
 * Convert table data to HTML table
 */
function tableToHTML(tableData) {
  const { headers, rows } = tableData;
  let html = '<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">';

  if (headers && headers.length > 0) {
    html += '<thead><tr>';
    headers.forEach(h => {
      html += `<th style="background-color: #f0f0f0; font-weight: bold;">${escapeHtml(h)}</th>`;
    });
    html += '</tr></thead>';
  }

  if (rows && rows.length > 0) {
    html += '<tbody>';
    rows.forEach(row => {
      html += '<tr>';
      row.forEach(cell => {
        html += `<td>${escapeHtml(cell)}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody>';
  }

  html += '</table>';
  return html;
}

/**
 * Extract note from content text (notes are appended with "\n\nNote: ")
 */
function extractNote(text) {
  if (!text) return null;
  const match = text.match(/\n\nNote: (.+?)(?:\n|$)/);
  return match ? match[1] : null;
}

/**
 * Extract source title from content text (format: "\n---\nSource: Title")
 */
function extractSourceTitle(text) {
  if (!text) return null;
  const match = text.match(/\n---\nSource: (.+)$/);
  return match ? match[1] : null;
}

/**
 * Extract main content text (remove note and source sections)
 */
function extractMainContent(text) {
  if (!text) return '';
  return text
    .replace(/\n\nNote: .+?(?=\n|$)/, '')
    .replace(/\n---\nSource: .+$/, '')
    .trim();
}

/**
 * Determine the primary content type of an item
 */
function getContentType(content) {
  const hasImage = content.media && content.media.some(m => m.type === 'image');
  const hasTable = content.media && content.media.some(m => m.type === 'table');
  const hasAudio = content.media && content.media.some(m => m.type === 'audio');
  const hasVideo = content.media && content.media.some(m => m.type === 'video');
  const isLinkType = content.contentType === 'link';

  if (hasTable) return 'table';
  if (hasImage) return 'image';
  if (hasVideo) return 'video';
  if (hasAudio) return 'audio';
  if (isLinkType) return 'link';
  return 'text';
}

/**
 * Format a single content item for copying
 */
async function formatContentItem(content, format, index) {
  const contentType = getContentType(content);
  const note = extractNote(content.text);
  const sourceTitle = extractSourceTitle(content.text);
  const mainText = extractMainContent(content.text);
  const sourceUrl = content.links && content.links.length > 0 ? content.links[0] : null;
  const date = new Date(content.modified || content.created).toLocaleDateString();

  let htmlParts = [];
  let textParts = [];

  // Format based on content type
  if (format === 'full') {
    // Full structured format
    htmlParts.push(`<div style="margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 8px;">`);
    htmlParts.push(`<div style="font-weight: bold; color: #666; margin-bottom: 10px;">[${contentType.toUpperCase()}] Item #${index + 1} - ${date}</div>`);
    textParts.push(`---\n[${contentType.toUpperCase()}] Item #${index + 1}\nDate: ${date}\n`);
  }

  // Add main content based on type
  switch (contentType) {
    case 'table':
      const table = content.media.find(m => m.type === 'table');
      if (table && table.data) {
        htmlParts.push(tableToHTML(table.data));
        textParts.push(tableToTSV(table.data));
      }
      break;

    case 'image':
      const images = content.media.filter(m => m.type === 'image');
      for (const img of images) {
        if (img.blob) {
          const base64 = await blobToBase64(img.blob);
          htmlParts.push(`<img src="${base64}" alt="${escapeHtml(img.name || 'image')}" style="max-width: 400px; height: auto; margin: 10px 0;" />`);
          textParts.push(`[Image: ${img.name || 'image'}]`);
        }
      }
      // Also include any text description
      if (mainText) {
        htmlParts.push(`<p>${escapeHtml(mainText)}</p>`);
        textParts.push(mainText);
      }
      break;

    case 'video':
      const videos = content.media.filter(m => m.type === 'video');
      videos.forEach(v => {
        htmlParts.push(`<p>[Video: ${escapeHtml(v.name || 'video')}]</p>`);
        textParts.push(`[Video: ${v.name || 'video'}]`);
      });
      if (mainText) {
        htmlParts.push(`<p>${escapeHtml(mainText)}</p>`);
        textParts.push(mainText);
      }
      break;

    case 'audio':
      const audios = content.media.filter(m => m.type === 'audio');
      audios.forEach(a => {
        htmlParts.push(`<p>[Audio: ${escapeHtml(a.name || 'audio')}]</p>`);
        textParts.push(`[Audio: ${a.name || 'audio'}]`);
      });
      if (mainText) {
        htmlParts.push(`<p>${escapeHtml(mainText)}</p>`);
        textParts.push(mainText);
      }
      break;

    case 'link':
      if (sourceUrl) {
        htmlParts.push(`<p><a href="${sourceUrl}">${escapeHtml(sourceUrl)}</a></p>`);
        textParts.push(sourceUrl);
      }
      if (mainText) {
        htmlParts.push(`<p>${escapeHtml(mainText)}</p>`);
        textParts.push(mainText);
      }
      break;

    default: // text
      if (mainText) {
        htmlParts.push(`<p>${escapeHtml(mainText).replace(/\n/g, '<br>')}</p>`);
        textParts.push(mainText);
      }
      break;
  }

  // Add note if present
  if (note) {
    htmlParts.push(`<p style="color: #666; font-style: italic;">Note: ${escapeHtml(note)}</p>`);
    textParts.push(`\nNote: ${note}`);
  }

  // Add source info based on format
  if (format === 'full' || format === 'content-notes-source') {
    if (sourceTitle) {
      htmlParts.push(`<p style="color: #888; font-size: 12px;">Source: ${escapeHtml(sourceTitle)}</p>`);
      textParts.push(`\nSource: ${sourceTitle}`);
    }
    if (sourceUrl) {
      htmlParts.push(`<p style="color: #888; font-size: 12px;">URL: <a href="${sourceUrl}">${escapeHtml(sourceUrl)}</a></p>`);
      textParts.push(`URL: ${sourceUrl}`);
    }
  }

  if (format === 'full') {
    htmlParts.push('</div>');
    textParts.push('\n---\n');
  }

  return {
    html: htmlParts.join('\n'),
    text: textParts.join('\n')
  };
}

/**
 * Copy all content to clipboard in the specified format
 */
async function copyAllContent(format) {
  try {
    const allContent = await DBUtils.getAllContent();

    if (!allContent || allContent.length === 0) {
      showCopyFeedback('No content to copy');
      return;
    }

    // Sort by order or modified date
    allContent.sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order;
      }
      return (b.modified || b.created) - (a.modified || a.created);
    });

    let htmlContent = '<html><body>';
    let plainText = '';

    // Process each content item
    for (let i = 0; i < allContent.length; i++) {
      const formatted = await formatContentItem(allContent[i], format, i);
      htmlContent += formatted.html;
      plainText += formatted.text;

      // Add separator between items (except for full format which has its own)
      if (format !== 'full' && i < allContent.length - 1) {
        htmlContent += '<hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;" />';
        plainText += '\n\n---\n\n';
      }
    }

    htmlContent += '</body></html>';

    // Write to clipboard with both HTML and plain text
    const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
    const textBlob = new Blob([plainText], { type: 'text/plain' });

    const clipboardItem = new ClipboardItem({
      'text/html': htmlBlob,
      'text/plain': textBlob
    });

    await navigator.clipboard.write([clipboardItem]);

    showCopyFeedback(`Copied ${allContent.length} item${allContent.length > 1 ? 's' : ''}`);

  } catch (error) {
    console.error('Copy failed:', error);
    showCopyFeedback('Copy failed', true);
  }
}

/**
 * Show copy success/error feedback toast
 */
function showCopyFeedback(message, isError = false) {
  // Remove any existing toast
  const existingToast = document.querySelector('.copy-success');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = 'copy-success';
  toast.textContent = message;

  if (isError) {
    toast.style.backgroundColor = '#DC2626';
  }

  document.body.appendChild(toast);

  // Remove after animation
  setTimeout(() => {
    toast.remove();
  }, 1500);
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
  copyAllContent,
  DBUtils
};
