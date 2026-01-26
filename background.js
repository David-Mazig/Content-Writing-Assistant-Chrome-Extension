/**
 * Background Service Worker
 * Handles IndexedDB operations and communication with content scripts
 */

// Import database utilities
importScripts('db-utils.js');

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveSelection') {
    handleSaveSelection(request.data, sender)
      .then(result => {
        sendResponse({ success: true, contentId: result });
      })
      .catch(error => {
        console.error('Save failed:', error);
        sendResponse({ success: false, error: error.message });
      });

    // Return true to indicate async response
    return true;
  }

  if (request.action === 'prewarmConnection') {
    // Pre-warm database connection
    DBUtils.getConnection()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        console.warn('Error pre-warming connection:', error);
        sendResponse({ success: false, error: error.message });
      });

    // Return true to indicate async response
    return true;
  }

  if (request.action === 'fetchImageFromUrl') {
    // Fetch image using background worker (bypasses CORS for content scripts)
    handleFetchImageFromUrl(request.data)
      .then(result => {
        sendResponse({ success: true, imageData: result });
      })
      .catch(error => {
        console.error('Image fetch failed:', error);
        sendResponse({ success: false, error: error.message });
      });

    // Return true to indicate async response
    return true;
  }
});

/**
 * Save selected text, image, or table and metadata to IndexedDB
 */
async function handleSaveSelection(data, sender) {
  try {
    const { type, url, title } = data;

    let contentId;

    if (type === 'table') {
      // Handle table saving
      console.log('[BG] Handling table save...');
      const { tableData } = data;

      console.log('[BG] Table data:', {
        headerCount: tableData.headers.length,
        rowCount: tableData.rows.length
      });

      // Create content entry with the table as a media item
      console.log('[BG] Calling DBUtils.saveContent...');
      contentId = await DBUtils.saveContent(null, {
        text: title ? `Table from: ${title}` : 'Saved table',
        links: url ? [url] : [],
        media: [
          {
            type: 'table',
            data: tableData,
            name: title ? `${title} - table` : 'table'
          }
        ]
      });

      console.log('Table saved from selection:', contentId);
    } else if (type === 'image') {
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
 * Fetch image from URL using background worker context
 * This bypasses CORS restrictions that content scripts face
 */
async function handleFetchImageFromUrl(data) {
  try {
    const { url, mimeType, name } = data;

    console.log('[BG] Fetching image from URL:', url);

    // Fetch the image using background worker (has broader permissions)
    // Add timeout to prevent indefinite hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    let response;
    try {
      response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('Image fetch timeout (30 seconds) - server not responding');
      }
      throw fetchError;
    }

    // Get the blob
    const blob = await response.blob();
    console.log('[BG] Image fetched, size:', blob.size, 'type:', blob.type);

    // Use provided mimeType or fall back to response type
    const finalMimeType = mimeType || blob.type;

    // Convert blob to ArrayBuffer
    const arrayBuffer = await blob.arrayBuffer();

    // Convert ArrayBuffer to Base64 string for message passing
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64String = btoa(binary);

    console.log('[BG] Image converted to Base64, length:', base64String.length);

    return {
      arrayBuffer: base64String,
      mimeType: finalMimeType,
      name: name || 'image'
    };
  } catch (error) {
    console.error('[BG] Error fetching image:', error);
    throw new Error(`Unable to fetch image: ${error.message}`);
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
