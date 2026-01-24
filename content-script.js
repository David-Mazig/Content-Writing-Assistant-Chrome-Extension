/**
 * Content Script - Text Selection Handler
 * Detects text selection and shows a save popover
 */

let popover = null;
let selectedText = '';
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
 * Handle save button click
 */
async function handleSave(event) {
  event.stopPropagation();

  if (!selectedText) {
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

    // Send message to background to save content
    const response = await chrome.runtime.sendMessage({
      action: 'saveSelection',
      data: {
        text: selectedText,
        url: window.location.href,
        title: document.title
      }
    });

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
    const errorMessage = error.message.includes('Extension was reloaded') ||
                        error.message.includes('Extension context invalidated')
      ? 'Refresh page'
      : 'Error!';

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
});
