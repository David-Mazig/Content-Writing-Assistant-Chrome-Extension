/**
 * Content Script - Text Selection Handler
 * Detects text selection and shows a save popover
 */

let popover = null;
let selectedText = '';
let selectedImage = null;
let hoverTimer = null;
let hoveredImage = null;
let prewarmSent = false;
let extensionContextValid = true;

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

/**
 * Handle text selection event
 */
function handleTextSelection(event) {
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

  // Wait 1 second before showing popover
  hoverTimer = setTimeout(() => {
    const rect = img.getBoundingClientRect();
    showPopover(rect.right - 10, rect.top + 10);
    // Set state AFTER showPopover (which calls hidePopover that clears state)
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
 * Create and show the popover
 */
function showPopover(x, y) {
  // Remove existing popover if present
  hidePopover();

  // Create popover element
  popover = document.createElement('div');
  popover.className = 'cwa-save-popover';
  popover.innerHTML = `
    <button class="cwa-save-btn" title="Save to Content Assistant">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2H4C3.46957 2 2.96086 2.21071 2.58579 2.58579C2.21071 2.96086 2 3.46957 2 4V14L5 12L8 14L11 12L14 14V4C14 3.46957 13.7893 2.96086 13.4142 2.58579C13.0391 2.21071 12.5304 2 12 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>Save</span>
    </button>
  `;

  // Position popover
  popover.style.left = `${x}px`;
  popover.style.top = `${y + 10}px`;

  // Add to page
  document.body.appendChild(popover);

  // Add click handler
  const saveBtn = popover.querySelector('.cwa-save-btn');
  saveBtn.addEventListener('click', handleSave);

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
  }

  // Clear image state
  selectedImage = null;
  hoveredImage = null;
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
 * Fetch image data as ArrayBuffer for message passing
 * Uses Canvas API to bypass CORS restrictions for rendered images
 */
async function fetchImageData(img) {
  console.log('[CWA] Starting image fetch for:', img.src);
  try {
    // STRATEGY 1: Canvas extraction (works for CORS-protected images)
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

    console.log('[CWA] Canvas extraction successful, blob size:', blob.size, 'bytes');

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

    console.log('[CWA] Base64 encoding complete, length:', base64String.length, 'chars');

    return {
      arrayBuffer: base64String,  // Now it's a Base64 string, not an ArrayBuffer
      mimeType: blob.type,
      name: name.endsWith('.png') ? name : name + '.png'
    };

  } catch (error) {
    console.warn('[CWA] Canvas extraction failed, trying fetch fallback:', error);

    // STRATEGY 2: Fetch fallback (for data URLs or when canvas fails)
    try {
      const response = await fetch(img.src);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();

      // Convert ArrayBuffer to Base64 string for message passing
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64String = btoa(binary);

      console.log('[CWA] Fetch fallback successful, Base64 length:', base64String.length, 'chars');

      const urlPath = new URL(img.src).pathname;
      const extension = urlPath.split('.').pop().toLowerCase();
      const name = urlPath.split('/').pop() || `image.${extension || 'png'}`;

      return {
        arrayBuffer: base64String,  // Now it's a Base64 string, not an ArrayBuffer
        mimeType: blob.type || 'image/png',
        name: name
      };
    } catch (fetchError) {
      console.error('[CWA] Both canvas and fetch failed:', fetchError);
      throw new Error('Unable to save image. It may be protected by CORS restrictions.');
    }
  }
}

/**
 * Handle save button click
 */
async function handleSave(event) {
  console.log('[CWA] ========== SAVE BUTTON CLICKED ==========');
  event.stopPropagation();

  console.log('[CWA] selectedText:', selectedText);
  console.log('[CWA] selectedImage:', selectedImage);

  if (!selectedText && !selectedImage) {
    console.log('[CWA] ERROR: Both selectedText and selectedImage are empty! Returning early.');
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

    let response;

    // Handle image saving
    if (selectedImage) {
      console.log('[CWA] Fetching image data...');
      const imageData = await fetchImageData(selectedImage);
      console.log('[CWA] Image data ready, mimeType:', imageData.mimeType, 'name:', imageData.name);

      console.log('[CWA] Sending message to background worker...');
      response = await chrome.runtime.sendMessage({
        action: 'saveSelection',
        data: {
          type: 'image',
          imageData: {
            arrayBuffer: imageData.arrayBuffer,
            mimeType: imageData.mimeType,
            name: imageData.name
          },
          url: window.location.href,
          title: document.title
        }
      });
    } else {
      // Handle text saving
      response = await chrome.runtime.sendMessage({
        action: 'saveSelection',
        data: {
          type: 'text',
          text: selectedText,
          url: window.location.href,
          title: document.title
        }
      });
    }

    console.log('[CWA] Response received:', response);

    if (response.success) {
      // Show success state
      saveBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M13.5 4L6 11.5L2.5 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Saved!</span>
      `;
      saveBtn.classList.add('success');

      // Hide popover after delay
      setTimeout(() => {
        hidePopover();
      }, 1500);
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
    } else if (error.message.includes('CORS')) {
      errorMessage = 'Image protected';
    } else if (error.message.includes('Unable to save image')) {
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
