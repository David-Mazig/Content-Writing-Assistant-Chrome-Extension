/**
 * Content Script - Text Selection Handler
 * Detects text selection and shows a save popover
 */

let popover = null;
let selectedText = '';
let selectedImage = null;
let selectedTable = null;
let selectedLink = null;
let hoverTimer = null;
let hoveredImage = null;
let hoveredTable = null;
let hoveredLink = null;
let prewarmSent = false;
let extensionContextValid = true;
let savedSelectionRange = null; // Store selection range for restoration

// Track multiple detected elements for nested scenarios (e.g., image inside link)
let detectedElements = {
  image: null,
  link: null,
  table: null
};

/**
 * Escape HTML to prevent XSS and display HTML tags as literal text
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Check if extension context is still valid
 */
function isExtensionContextValid() {
  try {
    // Try to access chrome.runtime.id
    // This will throw if the extension context is invalidated
    return !!chrome.runtime?.id;
  } catch (error) {
    return false;
  }
}

// Listen for text selection
document.addEventListener('mouseup', handleTextSelection);
document.addEventListener('touchend', handleTextSelection);

// Listen for image hover
document.addEventListener('mouseover', handleImageHover);
document.addEventListener('mouseout', handleImageHoverEnd);

// Listen for table hover
document.addEventListener('mouseover', handleTableHover);
document.addEventListener('mouseout', handleTableHoverEnd);

// Listen for link hover
document.addEventListener('mouseover', handleLinkHover);
document.addEventListener('mouseout', handleLinkHoverEnd);

/**
 * Handle text selection event
 */
function handleTextSelection(event) {
  // Don't process if interacting with the popover
  if (popover && popover.contains(event.target)) {
    return;
  }

  // Small delay to ensure selection is complete
  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    // Hide popover if no text is selected
    if (!text) {
      hidePopover();
      prewarmSent = false;
      return;
    }

    // Pre-warm database connection when text is selected
    if (!prewarmSent && text.length > 10) {
      if (isExtensionContextValid()) {
        chrome.runtime.sendMessage({ action: 'prewarmConnection' }).catch(() => {
          // Ignore errors (service worker might be starting)
        });
        prewarmSent = true;
      } else {
        extensionContextValid = false;
      }
    }

    // Store selected text
    selectedText = text;

    // Show popover near cursor
    showPopover(event.clientX, event.clientY);
  }, 10);
}

/**
 * Handle image hover event
 */
function handleImageHover(event) {
  if (event.target.tagName !== 'IMG') return;

  const img = event.target;
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;

  // Filter out tiny images (icons, UI elements, etc.)
  if (width < 50 || height < 50) return;

  // Don't show if popover already visible
  if (popover) return;

  hoveredImage = img;
  if (hoverTimer) clearTimeout(hoverTimer);

  // Check if image is inside a link
  const parentLink = img.closest('a');
  const hasValidParentLink = parentLink && parentLink.href &&
    !parentLink.href.startsWith('javascript:') && parentLink.href !== '#';

  // Check if image is inside a table
  const parentTable = img.closest('table');
  const hasValidParentTable = parentTable &&
    parentTable.querySelectorAll('tr').length >= 2;

  // Wait 1 second before showing popover
  hoverTimer = setTimeout(() => {
    // Track detected elements BEFORE showPopover (it calls hidePopover which clears state)
    detectedElements.image = img;
    detectedElements.link = hasValidParentLink ? parentLink : null;
    detectedElements.table = hasValidParentTable ? parentTable : null;

    const rect = img.getBoundingClientRect();
    showPopover(rect.right - 10, rect.top + 10);

    // Set selected state AFTER showPopover
    selectedImage = img;
    selectedText = '';
  }, 1000);
}

/**
 * Handle image hover end event
 */
function handleImageHoverEnd(event) {
  if (event.target === hoveredImage) {
    if (hoverTimer) clearTimeout(hoverTimer);
    hoveredImage = null;
  }
}

/**
 * Handle table hover event
 */
function handleTableHover(event) {
  // Don't trigger if hovering an image inside the table (handleImageHover will handle it)
  if (event.target.tagName === 'IMG') return;

  // Check if element is a table or inside a table
  const table = event.target.tagName === 'TABLE' ? event.target : event.target.closest('table');
  if (!table) return;

  // Don't show if popover already visible
  if (popover) return;

  // Filter out very small tables (likely UI elements)
  const rowCount = table.querySelectorAll('tr').length;
  if (rowCount < 2) return;

  hoveredTable = table;
  if (hoverTimer) clearTimeout(hoverTimer);

  // Wait 1 second before showing popover
  hoverTimer = setTimeout(() => {
    const rect = table.getBoundingClientRect();
    showPopover(rect.right - 10, rect.top + 10);
    // Set state AFTER showPopover (which calls hidePopover that clears state)
    selectedTable = table;
    selectedText = '';
    selectedImage = null;
  }, 1000);
}

/**
 * Handle table hover end event
 */
function handleTableHoverEnd(event) {
  const table = event.target.tagName === 'TABLE' ? event.target : event.target.closest('table');
  if (table === hoveredTable) {
    if (hoverTimer) clearTimeout(hoverTimer);
    hoveredTable = null;
  }
}

/**
 * Handle link hover event
 */
function handleLinkHover(event) {
  // Check if element is a link or inside a link
  const link = event.target.tagName === 'A' ? event.target : event.target.closest('a');
  if (!link) return;

  // Must have an href
  const href = link.href;
  if (!href || href.startsWith('javascript:') || href === '#') return;

  // Don't show if popover already visible
  if (popover) return;

  // If we're hovering an image inside a link, let image handler take over
  if (event.target.tagName === 'IMG') return;

  hoveredLink = link;
  if (hoverTimer) clearTimeout(hoverTimer);

  // Check if link contains an image
  const childImage = link.querySelector('img');
  let validChildImage = null;
  if (childImage) {
    const width = childImage.naturalWidth || childImage.width;
    const height = childImage.naturalHeight || childImage.height;
    if (width >= 50 && height >= 50) {
      validChildImage = childImage;
    }
  }

  // Wait 1 second before showing popover
  hoverTimer = setTimeout(() => {
    // Track detected elements BEFORE showPopover (it calls hidePopover which clears state)
    detectedElements.link = link;
    detectedElements.image = validChildImage;
    detectedElements.table = null;

    const rect = link.getBoundingClientRect();
    showPopover(rect.left + rect.width / 2, rect.bottom);

    // Set selected state AFTER showPopover
    selectedLink = link;
    selectedText = '';
    selectedImage = null;
    selectedTable = null;
  }, 1000);
}

/**
 * Handle link hover end event
 */
function handleLinkHoverEnd(event) {
  const link = event.target.tagName === 'A' ? event.target : event.target.closest('a');
  if (link === hoveredLink) {
    if (hoverTimer) clearTimeout(hoverTimer);
    hoveredLink = null;
  }
}

/**
 * Load projects and populate dropdown
 */
async function loadProjectsToDropdown() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getProjects' });

    if (!response.success) {
      console.error('Failed to load projects:', response.error);
      return;
    }

    const projectSelect = document.getElementById('cwa-project-select');
    if (!projectSelect) return;

    const { projects, activeProjectId } = response;

    // Clear existing options
    projectSelect.innerHTML = '';

    // Add project options
    projects.forEach(project => {
      const option = document.createElement('option');
      option.value = project.key;
      option.textContent = project.name;
      if (project.key === activeProjectId) {
        option.selected = true;
      }
      projectSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading projects:', error);
  }
}

/**
 * Get selected project ID from dropdown
 */
function getSelectedProjectId() {
  const projectSelect = document.getElementById('cwa-project-select');
  return projectSelect ? projectSelect.value : null;
}

/**
 * Create and show the popover with preview
 */
function showPopover(x, y) {
  // Remove existing popover if present
  hidePopover();

  // Create popover element
  popover = document.createElement('div');
  popover.className = 'cwa-save-popover';

  // Determine what we're saving
  let previewContent = '';
  let charCount = 0;
  let contentType = '';

  if (selectedText) {
    charCount = selectedText.length;
    previewContent = selectedText.substring(0, 80) + (selectedText.length > 80 ? '...' : '');
    contentType = 'text';
  } else if (selectedImage) {
    previewContent = 'Image';
    contentType = 'image';
  } else if (selectedTable) {
    const data = extractTableData(selectedTable);
    const imageCount = data.images ? data.images.length : 0;
    if (imageCount > 0) {
      previewContent = `Table: ${data.rows.length} rows, ${imageCount} image${imageCount > 1 ? 's' : ''}`;
    } else {
      previewContent = `Table: ${data.rows.length} rows`;
    }
    contentType = 'table';
  } else if (selectedLink) {
    try {
      const url = new URL(selectedLink.href);
      const linkText = selectedLink.textContent.trim();
      previewContent = linkText.substring(0, 40) + (linkText.length > 40 ? '...' : '') || url.hostname;
      contentType = 'link';
    } catch {
      previewContent = 'Link';
      contentType = 'link';
    }
  }

  // Check if multiple elements are detected (for multi-save UI)
  const hasImageAndLink = detectedElements.image && detectedElements.link;
  const hasImageAndTable = detectedElements.image && detectedElements.table;
  const hasMultipleElements = hasImageAndLink || hasImageAndTable;

  // Build preview content for multi-element case
  if (hasImageAndLink) {
    previewContent = 'Image + Link';
    contentType = 'multi';
  } else if (hasImageAndTable) {
    previewContent = 'Image + Table';
    contentType = 'multi';
  }

  // Build preview meta text
  let previewMeta = `from ${document.title.substring(0, 30)}${document.title.length > 30 ? '...' : ''}`;
  if (contentType === 'link' && selectedLink) {
    try {
      const url = new URL(selectedLink.href);
      previewMeta = url.hostname.replace('www.', '');
    } catch {
      previewMeta = selectedLink.href.substring(0, 40);
    }
  } else if (hasMultipleElements && detectedElements.link) {
    try {
      const url = new URL(detectedElements.link.href);
      previewMeta = url.hostname.replace('www.', '');
    } catch {
      previewMeta = `from ${document.title.substring(0, 30)}${document.title.length > 30 ? '...' : ''}`;
    }
  }

  // Build action buttons HTML
  let actionsHTML;
  if (hasMultipleElements) {
    // Multi-element UI: show separate buttons for each element type + "All" option
    const imageButton = `
      <button class="cwa-save-btn cwa-save-image-btn" data-save-type="image" title="Save Image only">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <path d="M21 15l-5-5L5 21"/>
        </svg>
        <span>Image</span>
      </button>
    `;

    const linkButton = `
      <button class="cwa-save-btn cwa-save-link-btn" data-save-type="link" title="Save Link only">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        <span>Link</span>
      </button>
    `;

    const tableButton = `
      <button class="cwa-save-btn cwa-save-table-btn" data-save-type="table" title="Save Table only">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
        </svg>
        <span>Table</span>
      </button>
    `;

    const bothButton = `
      <button class="cwa-save-btn cwa-save-both-btn" data-save-type="both" title="Save all as separate items">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M12 2H4C3.46957 2 2.96086 2.21071 2.58579 2.58579C2.21071 2.96086 2 3.46957 2 4V14L5 12L8 14L11 12L14 14V4C14 3.46957 13.7893 2.96086 13.4142 2.58579C13.0391 2.21071 12.5304 2 12 2Z" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        <span>All</span>
      </button>
    `;

    actionsHTML = `
      <select class="cwa-project-select" id="cwa-project-select">
        <option value="">Loading projects...</option>
      </select>
      <input type="text" class="cwa-note-input" placeholder="Add a note (optional)..." />
      <div class="cwa-multi-save-buttons">
        ${imageButton}
        ${hasImageAndLink ? linkButton : ''}
        ${hasImageAndTable ? tableButton : ''}
        ${bothButton}
      </div>
    `;
  } else {
    // Single element UI: standard save button
    actionsHTML = `
      <select class="cwa-project-select" id="cwa-project-select">
        <option value="">Loading projects...</option>
      </select>
      <input type="text" class="cwa-note-input" placeholder="Add a note (optional)..." />
      <button class="cwa-save-btn" title="Save to Content Assistant">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M12 2H4C3.46957 2 2.96086 2.21071 2.58579 2.58579C2.21071 2.96086 2 3.46957 2 4V14L5 12L8 14L11 12L14 14V4C14 3.46957 13.7893 2.96086 13.4142 2.58579C13.0391 2.21071 12.5304 2 12 2Z" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        <span>Save</span>
      </button>
    `;
  }

  popover.innerHTML = `
    <div class="cwa-popover-preview">
      ${contentType === 'text' ? `
        <div class="cwa-preview-text">"${escapeHtml(previewContent)}"</div>
        <div class="cwa-preview-meta">${charCount} chars from ${document.title.substring(0, 30)}${document.title.length > 30 ? '...' : ''}</div>
      ` : contentType === 'link' ? `
        <div class="cwa-preview-label">Link: ${escapeHtml(previewContent)}</div>
        <div class="cwa-preview-meta">${escapeHtml(previewMeta)}</div>
      ` : contentType === 'multi' ? `
        <div class="cwa-preview-label">${escapeHtml(previewContent)}</div>
        <div class="cwa-preview-meta">${escapeHtml(previewMeta)}</div>
      ` : `
        <div class="cwa-preview-label">${escapeHtml(previewContent)}</div>
        <div class="cwa-preview-meta">from ${document.title.substring(0, 30)}${document.title.length > 30 ? '...' : ''}</div>
      `}
    </div>
    <div class="cwa-popover-actions">
      ${actionsHTML}
    </div>
  `;

  // Add to page temporarily to measure size
  document.body.appendChild(popover);
  const rect = popover.getBoundingClientRect();

  // Viewport-aware positioning
  let left = x;
  let top = y + 10;

  // Prevent right overflow
  if (left + rect.width > window.innerWidth - 10) {
    left = window.innerWidth - rect.width - 10;
  }

  // Prevent left overflow
  if (left < 10) {
    left = 10;
  }

  // Prevent bottom overflow
  if (top + rect.height > window.innerHeight - 10) {
    top = y - rect.height - 10; // Position above cursor
  }

  // Prevent top overflow
  if (top < 10) {
    top = 10;
  }

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;

  // Load projects and populate dropdown
  loadProjectsToDropdown();

  // Add event listeners for save buttons
  if (hasMultipleElements) {
    // Multi-element: attach handlers to each button
    const imageBtn = popover.querySelector('.cwa-save-image-btn');
    const linkBtn = popover.querySelector('.cwa-save-link-btn');
    const tableBtn = popover.querySelector('.cwa-save-table-btn');
    const bothBtn = popover.querySelector('.cwa-save-both-btn');

    if (imageBtn) imageBtn.addEventListener('click', (e) => handleSaveElement(e, 'image'));
    if (linkBtn) linkBtn.addEventListener('click', (e) => handleSaveElement(e, 'link'));
    if (tableBtn) tableBtn.addEventListener('click', (e) => handleSaveElement(e, 'table'));
    if (bothBtn) bothBtn.addEventListener('click', (e) => handleSaveElement(e, 'both'));
  } else {
    // Single element: standard save handler
    popover.querySelector('.cwa-save-btn').addEventListener('click', handleSave);
  }

  // Save selection for potential restoration (e.g., when pressing ESC)
  const selection = window.getSelection();
  savedSelectionRange = selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;

  // Auto-focus the note input field after a brief delay
  // (browser blocks focus during active selection events)
  const noteInput = popover.querySelector('.cwa-note-input');
  if (noteInput) {
    // Use requestAnimationFrame + setTimeout to ensure focus happens after browser settles
    // Note: focusing will clear the selection, but we've saved it for ESC restoration
    requestAnimationFrame(() => {
      setTimeout(() => {
        noteInput.focus();
      }, 10);
    });
  }

  // Add keyboard shortcuts (Enter to save, Escape to cancel)
  document.addEventListener('keydown', handlePopoverKeydown);

  // Hide popover when clicking outside
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
  }, 100);
}

/**
 * Hide the popover
 */
function hidePopover() {
  if (popover && popover.parentNode) {
    popover.parentNode.removeChild(popover);
    popover = null;
    prewarmSent = false;
    document.removeEventListener('click', handleOutsideClick);
    document.removeEventListener('keydown', handlePopoverKeydown);
  }

  // Clear state (but keep detectedElements - they're set fresh before each showPopover call)
  selectedImage = null;
  hoveredImage = null;
  selectedTable = null;
  hoveredTable = null;
  selectedLink = null;
  hoveredLink = null;
  savedSelectionRange = null;
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
}

/**
 * Handle click outside popover
 */
function handleOutsideClick(event) {
  if (popover && !popover.contains(event.target)) {
    hidePopover();
  }
}

/**
 * Handle keyboard events when popover is visible
 */
function handlePopoverKeydown(event) {
  if (!popover) return;

  if (event.key === 'Enter') {
    event.preventDefault();
    // Check if multi-element mode (multiple buttons)
    const bothBtn = popover.querySelector('.cwa-save-both-btn');
    if (bothBtn) {
      // Multi-element mode: Enter saves all
      handleSaveElement(event, 'both');
    } else {
      // Single element mode: standard save
      handleSave(event);
    }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    // Restore text selection if it was saved (before hidePopover clears it)
    if (savedSelectionRange && selectedText) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedSelectionRange);
    }
    hidePopover();
  }
}

/**
 * Extract table data into JSON structure, including embedded images with position info
 */
function extractTableData(table) {
  const headers = [];
  const rows = [];
  const images = [];

  // Extract headers from thead or first row
  const headerCells = table.querySelectorAll('thead th');
  if (headerCells.length > 0) {
    headerCells.forEach(th => headers.push(th.textContent.trim()));
  } else {
    // If no thead, use first row as headers
    const firstRow = table.querySelector('tr');
    if (firstRow) {
      const cells = firstRow.querySelectorAll('th, td');
      cells.forEach(cell => headers.push(cell.textContent.trim()));
    }
  }

  // Extract data rows from tbody or all rows (skip header row if we used it)
  const bodyRows = table.querySelectorAll('tbody tr');
  const rowsToExtract = bodyRows.length > 0 ? bodyRows : table.querySelectorAll('tr');

  let startIndex = 0;
  // If we used first row as headers and tbody doesn't exist, skip first row
  if (bodyRows.length === 0 && headerCells.length === 0 && table.querySelector('tr')) {
    startIndex = 1;
  }

  // Track image index across all cells for placeholder replacement
  let imageIndex = 0;

  Array.from(rowsToExtract).slice(startIndex).forEach((tr, rowIdx) => {
    const rowData = [];
    tr.querySelectorAll('td, th').forEach((cell, colIdx) => {
      // Check for images in this cell
      const cellImages = cell.querySelectorAll('img');
      let cellContent = cell.textContent.trim();

      cellImages.forEach(img => {
        if (img.src && img.src.trim() !== '') {
          // Add placeholder for this image
          cellContent += `{{img:${imageIndex}}}`;
          // Store image with position metadata
          images.push({
            element: img,
            rowIndex: rowIdx,
            colIndex: colIdx,
            index: imageIndex
          });
          imageIndex++;
        }
      });

      // Check for CSS background-image in this cell
      const computedStyle = window.getComputedStyle(cell);
      const backgroundImage = computedStyle.backgroundImage;

      if (backgroundImage && backgroundImage !== 'none') {
        // Extract all URLs from background-image (can contain multiple images)
        const urlMatches = backgroundImage.matchAll(/url\(['"]?([^'"()]+)['"]?\)/g);
        for (const match of urlMatches) {
          const bgUrl = match[1];

          try {
            // Resolve relative URLs to absolute URLs
            const absoluteUrl = new URL(bgUrl, window.location.href).href;

            // Create a temporary img element for this background image
            const tempImg = document.createElement('img');
            tempImg.src = absoluteUrl;

            // Add placeholder for this background image
            cellContent += `{{img:${imageIndex}}}`;

            // Store image with position metadata
            images.push({
              element: tempImg,
              rowIndex: rowIdx,
              colIndex: colIdx,
              index: imageIndex
            });
            imageIndex++;
          } catch (error) {
            console.warn('[CWA] Failed to process background image URL:', bgUrl, error);
          }
        }
      }

      rowData.push(cellContent);
    });
    if (rowData.length > 0) {
      rows.push(rowData);
    }
  });

  return {
    headers,
    rows,
    images  // Array of image objects with position info
  };
}

/**
 * Check if canvas extraction will work for this image
 * Returns true for same-origin, data URLs, blob URLs, or CORS-enabled images
 */
function canUseCanvasExtraction(img) {
  const src = img.src;

  // Data URLs always work
  if (src.startsWith('data:')) return true;

  // Blob URLs always work
  if (src.startsWith('blob:')) return true;

  // Same-origin images always work
  try {
    const imgUrl = new URL(src);
    if (imgUrl.origin === window.location.origin) return true;
  } catch {
    // Invalid URL, try canvas anyway
    return true;
  }

  // Cross-origin with crossOrigin attribute set MIGHT work (if server sends CORS headers)
  if (img.crossOrigin) return true;

  // Cross-origin without crossOrigin attribute will DEFINITELY fail
  return false;
}

/**
 * Fetch image via background worker (bypasses CORS restrictions)
 */
async function fetchViaBackgroundWorker(img) {
  // Determine file name from URL
  const urlPath = new URL(img.src).pathname;
  const extension = urlPath.split('.').pop().toLowerCase();
  const name = urlPath.split('/').pop() || `image.${extension || 'png'}`;

  // Get the expected MIME type from image or extension
  const mimeType = img.src.startsWith('data:')
    ? img.src.split(';')[0].split(':')[1]
    : `image/${extension || 'png'}`;

  // Request background worker to fetch the image (has broader permissions)
  const response = await chrome.runtime.sendMessage({
    action: 'fetchImageFromUrl',
    data: {
      url: img.src,
      mimeType: mimeType,
      name: name
    }
  });

  if (!response.success) {
    throw new Error(response.error || 'Background fetch failed');
  }

  return response.imageData;
}

/**
 * Fetch image data as ArrayBuffer for message passing
 * Uses Canvas API for same-origin images, background worker for cross-origin
 */
async function fetchImageData(img) {
  // Quick check: if definitely cross-origin, skip canvas and use background fetch directly
  if (!canUseCanvasExtraction(img)) {
    return await fetchViaBackgroundWorker(img);
  }

  // Try canvas for same-origin/data-url/blob-url/CORS images
  try {
    // STRATEGY 1: Canvas extraction (works for same-origin or CORS-enabled images)
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Convert canvas to blob
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to convert canvas to blob'));
        },
        'image/png',  // Always use PNG for reliability
        0.95  // Quality
      );
    });

    // Determine file name from URL or use default
    const urlPath = new URL(img.src).pathname;
    const name = urlPath.split('/').pop() || 'image.png';

    const arrayBuffer = await blob.arrayBuffer();

    // Convert ArrayBuffer to Base64 string for message passing
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64String = btoa(binary);

    return {
      arrayBuffer: base64String,  // Now it's a Base64 string, not an ArrayBuffer
      mimeType: blob.type,
      name: name.endsWith('.png') ? name : name + '.png'
    };

  } catch (error) {
    // STRATEGY 2: Background worker fetch (bypasses CORS restrictions)
    try {
      return await fetchViaBackgroundWorker(img);
    } catch (fetchError) {
      console.error('[CWA] Both canvas and background fetch failed:', fetchError);
      throw new Error('Unable to save image. It may be protected by CORS restrictions.');
    }
  }
}

/**
 * Handle save for a specific element type (used in multi-element UI)
 * @param {Event} event - Click event
 * @param {string} saveType - 'image', 'link', 'table', or 'both'
 */
async function handleSaveElement(event, saveType) {
  event.stopPropagation();

  const btn = event.currentTarget;
  const originalContent = btn.innerHTML;

  // Read note from the input field (shared across all buttons)
  const noteInput = popover.querySelector('.cwa-note-input');
  const noteText = noteInput ? noteInput.value.trim() : '';

  // Get selected project ID
  const projectId = getSelectedProjectId();

  // Disable all buttons during save
  const allButtons = popover.querySelectorAll('.cwa-save-btn');
  allButtons.forEach(b => b.disabled = true);

  btn.innerHTML = '<span>Saving...</span>';

  try {
    if (!isExtensionContextValid()) {
      throw new Error('Extension was reloaded. Please refresh this page.');
    }

    if (saveType === 'both') {
      // Save all detected elements sequentially
      if (detectedElements.image) {
        await saveImageElement(detectedElements.image, noteText, projectId);
      }
      if (detectedElements.link) {
        await saveLinkElement(detectedElements.link, noteText, projectId);
      }
      if (detectedElements.table) {
        await saveTableElement(detectedElements.table, noteText, projectId);
      }
    } else if (saveType === 'image') {
      await saveImageElement(detectedElements.image, noteText, projectId);
    } else if (saveType === 'link') {
      await saveLinkElement(detectedElements.link, noteText, projectId);
    } else if (saveType === 'table') {
      await saveTableElement(detectedElements.table, noteText, projectId);
    }

    // Hide popover instantly
    hidePopover();

  } catch (error) {
    console.error('Error saving element:', error);

    let errorMessage = 'Error!';
    if (error.message.includes('Extension was reloaded') ||
        error.message.includes('Extension context invalidated')) {
      errorMessage = 'Refresh page';
    } else if (error.message.includes('CORS') ||
               error.message.includes('tainted') ||
               error.message.includes('insecure')) {
      errorMessage = 'Image protected';
    }

    btn.innerHTML = `<span>${errorMessage}</span>`;
    btn.classList.add('error');

    setTimeout(() => {
      btn.innerHTML = originalContent;
      allButtons.forEach(b => b.disabled = false);
      btn.classList.remove('error');
    }, 2000);
  }
}

/**
 * Save an image element
 */
async function saveImageElement(img, noteText, projectId) {
  const imageData = await fetchImageData(img);

  const response = await chrome.runtime.sendMessage({
    action: 'saveSelection',
    data: {
      type: 'image',
      imageData: {
        arrayBuffer: imageData.arrayBuffer,
        mimeType: imageData.mimeType,
        name: imageData.name
      },
      note: noteText,
      url: window.location.href,
      title: document.title,
      projectId: projectId
    }
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to save image');
  }

  return response;
}

/**
 * Save a link element
 */
async function saveLinkElement(link, noteText, projectId) {
  const linkText = link.textContent.trim();
  const linkHref = link.href;

  let textToSave = linkText || linkHref;
  if (noteText) {
    textToSave = textToSave + '\n\nNote: ' + noteText;
  }

  const response = await chrome.runtime.sendMessage({
    action: 'saveSelection',
    data: {
      type: 'link',
      text: textToSave,
      linkUrl: linkHref,
      url: window.location.href,
      title: document.title,
      projectId: projectId
    }
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to save link');
  }

  return response;
}

/**
 * Save a table element
 */
async function saveTableElement(table, noteText, projectId) {
  const tableData = extractTableData(table);

  // Fetch all images embedded in the table
  const imageDataArray = [];
  if (tableData.images && tableData.images.length > 0) {
    for (let i = 0; i < tableData.images.length; i++) {
      const img = tableData.images[i];
      try {
        const imageData = await fetchImageData(img.element);
        imageDataArray.push(imageData);
      } catch (error) {
        console.warn(`Failed to fetch image ${i + 1}:`, error);
        // Continue with other images even if one fails
      }
    }
  }

  // Remove images array from tableData before sending (we've extracted them)
  const cleanTableData = {
    headers: tableData.headers,
    rows: tableData.rows
  };

  const response = await chrome.runtime.sendMessage({
    action: 'saveSelection',
    data: {
      type: 'table',
      tableData: cleanTableData,
      tableImages: imageDataArray,
      note: noteText,
      url: window.location.href,
      title: document.title,
      projectId: projectId
    }
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to save table');
  }

  return response;
}

/**
 * Handle save button click
 */
async function handleSave(event) {
  event.stopPropagation();

  if (!selectedText && !selectedImage && !selectedTable && !selectedLink) {
    return;
  }

  // Clear selection immediately to prevent popover from reappearing
  window.getSelection().removeAllRanges();

  // Show loading state
  const saveBtn = popover.querySelector('.cwa-save-btn');
  const originalContent = saveBtn.innerHTML;
  saveBtn.innerHTML = '<span>Saving...</span>';
  saveBtn.disabled = true;

  try {
    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      throw new Error('Extension was reloaded. Please refresh this page.');
    }

    // Read note from the input field
    const noteInput = popover.querySelector('.cwa-note-input');
    const noteText = noteInput ? noteInput.value.trim() : '';

    // Get selected project ID
    const projectId = getSelectedProjectId();

    let response;

    // Handle table saving
    if (selectedTable) {
      const tableData = extractTableData(selectedTable);

      // Fetch all images embedded in the table
      const imageDataArray = [];
      if (tableData.images && tableData.images.length > 0) {
        saveBtn.innerHTML = `<span>Fetching images (0/${tableData.images.length})...</span>`;

        for (let i = 0; i < tableData.images.length; i++) {
          const img = tableData.images[i];
          try {
            // img is now {element, rowIndex, colIndex, index} - pass the actual element
            const imageData = await fetchImageData(img.element);
            imageDataArray.push(imageData);

            // Update progress
            saveBtn.innerHTML = `<span>Fetching images (${i + 1}/${tableData.images.length})...</span>`;
          } catch (error) {
            console.warn(`Failed to fetch image ${i + 1}:`, error);
            // Continue with other images even if one fails
          }
        }

        saveBtn.innerHTML = '<span>Saving...</span>';
      }

      // Remove images array from tableData before sending (we've extracted them)
      const cleanTableData = {
        headers: tableData.headers,
        rows: tableData.rows
      };

      response = await chrome.runtime.sendMessage({
        action: 'saveSelection',
        data: {
          type: 'table',
          tableData: cleanTableData,
          tableImages: imageDataArray,  // Send fetched image data separately
          note: noteText,
          url: window.location.href,
          title: document.title,
          projectId: projectId
        }
      });
    } else if (selectedImage) {
      // Handle image saving
      const imageData = await fetchImageData(selectedImage);

      response = await chrome.runtime.sendMessage({
        action: 'saveSelection',
        data: {
          type: 'image',
          imageData: {
            arrayBuffer: imageData.arrayBuffer,
            mimeType: imageData.mimeType,
            name: imageData.name
          },
          note: noteText,
          url: window.location.href,
          title: document.title,
          projectId: projectId
        }
      });
    } else if (selectedLink) {
      // Handle link saving
      const linkText = selectedLink.textContent.trim();
      const linkHref = selectedLink.href;

      let textToSave = linkText || linkHref;
      if (noteText) {
        textToSave = textToSave + '\n\nNote: ' + noteText;
      }

      response = await chrome.runtime.sendMessage({
        action: 'saveSelection',
        data: {
          type: 'link',
          text: textToSave,
          linkUrl: linkHref,
          url: window.location.href,
          title: document.title,
          projectId: projectId
        }
      });
    } else {
      // Handle text saving
      let textToSave = selectedText;
      if (noteText) {
        textToSave = selectedText + '\n\nNote: ' + noteText;
      }

      response = await chrome.runtime.sendMessage({
        action: 'saveSelection',
        data: {
          type: 'text',
          text: textToSave,
          url: window.location.href,
          title: document.title,
          projectId: projectId
        }
      });
    }

    if (response.success) {
      // Show success state
      saveBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M13.5 4L6 11.5L2.5 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Saved!</span>
      `;
      saveBtn.classList.add('success');

      // Hide popover instantly
      hidePopover();
    } else {
      throw new Error(response.error || 'Failed to save');
    }
  } catch (error) {
    console.error('Error saving selection:', error);

    // Show error state with appropriate message
    let errorMessage = 'Error!';

    if (error.message.includes('Extension was reloaded') ||
        error.message.includes('Extension context invalidated')) {
      errorMessage = 'Refresh page';
    } else if (error.message.includes('CORS') ||
               error.message.includes('tainted') ||
               error.message.includes('insecure') ||
               error.name === 'SecurityError') {
      errorMessage = 'Image protected';
    } else if (error.message.includes('Unable to save image') ||
               error.message.includes('Unable to fetch image')) {
      errorMessage = 'Cannot save';
    }

    saveBtn.innerHTML = `<span>${errorMessage}</span>`;
    saveBtn.classList.add('error');

    setTimeout(() => {
      saveBtn.innerHTML = originalContent;
      saveBtn.disabled = false;
      saveBtn.classList.remove('error');
    }, 2000);
  }
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  hidePopover();
  if (hoverTimer) {
    clearTimeout(hoverTimer);
  }
});
