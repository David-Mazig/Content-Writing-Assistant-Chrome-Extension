/**
 * Background Service Worker
 * Handles IndexedDB operations and communication with content scripts
 */

// Import database utilities
importScripts('db-utils.js');

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveSelection') {
    console.log('[BG] Received saveSelection message, type:', request.data?.type);
    handleSaveSelection(request.data, sender)
      .then(result => {
        console.log('[BG] Save successful, contentId:', result);
        sendResponse({ success: true, contentId: result });
      })
      .catch(error => {
        console.error('[BG] Save failed:', error);
        sendResponse({ success: false, error: error.message });
      });

    // Return true to indicate async response
    return true;
  }

  if (request.action === 'prewarmConnection') {
    // Pre-warm database connection
    DBUtils.getConnection()
      .then(() => {
        console.log('Database connection pre-warmed');
        sendResponse({ success: true });
      })
      .catch(error => {
        console.warn('Error pre-warming connection:', error);
        sendResponse({ success: false, error: error.message });
      });

    // Return true to indicate async response
    return true;
  }
});

/**
 * Save selected text or image and metadata to IndexedDB
 */
async function handleSaveSelection(data, sender) {
  try {
    const { type, url, title } = data;

    let contentId;

    if (type === 'image') {
      // Handle image saving
      console.log('[BG] Handling image save...');
      const { imageData } = data;

      // Decode base64 string back to ArrayBuffer
      console.log('[BG] Decoding Base64 string, length:', imageData.arrayBuffer?.length);
      const binaryString = atob(imageData.arrayBuffer);
      console.log('[BG] Base64 decoded, binary length:', binaryString.length);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      console.log('[BG] Uint8Array created, length:', bytes.length);
      const arrayBuffer = bytes.buffer;

      // Convert ArrayBuffer back to Blob
      const blob = new Blob([bytes], { type: imageData.mimeType });
      console.log('[BG] Blob created, size:', blob.size, 'type:', blob.type);

      // Create content entry with the image
      console.log('[BG] Calling DBUtils.saveContent...');
      contentId = await DBUtils.saveContent(null, {
        text: title ? `Image from: ${title}` : 'Saved image',
        links: url ? [url] : [],
        media: [
          {
            type: imageData.mimeType.startsWith('image/') ? 'image' : 'media',
            mimeType: imageData.mimeType,
            blob: blob,
            name: imageData.name
          }
        ]
      });

      console.log('Image saved from selection:', contentId);
    } else {
      // Handle text saving
      const { text } = data;

      // Format the text to include source information
      const formattedText = title
        ? `${text}\n\n---\nSource: ${title}`
        : text;

      // Create content entry with the selected text
      contentId = await DBUtils.saveContent(null, {
        text: formattedText,
        links: url ? [url] : [],
        media: []
      });

      console.log('Content saved from selection:', contentId);
    }

    // Show notification
    showSaveNotification();

    return contentId;
  } catch (error) {
    console.error('Error saving selection:', error);
    throw error;
  }
}

/**
 * Show a notification that content was saved
 */
function showSaveNotification() {
  // Could use chrome.notifications API here if we add the permission
  console.log('Content saved successfully!');
}

// Initialize database on installation (pre-warm connection)
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed, initializing database...');
  try {
    await DBUtils.getConnection();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
});

// Clean up when service worker is about to terminate
self.addEventListener('beforeunload', () => {
  console.log('Service worker terminating, closing database connection');
  DBUtils.closeConnection();
});
