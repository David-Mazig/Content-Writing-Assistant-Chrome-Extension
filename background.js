/**
 * Background Service Worker
 * Handles IndexedDB operations and communication with content scripts
 */

// Import database utilities
importScripts('db-utils.js');
importScripts('undo-redo-utils.js');

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

  if (request.action === 'getProjects') {
    // Get all projects and active project ID
    Promise.all([
      DBUtils.getAllProjects(),
      chrome.storage.local.get('activeProjectId')
    ])
      .then(([projects, result]) => {
        const activeProjectId = result.activeProjectId || (projects.length > 0 ? projects[0].key : DBUtils.DEFAULT_PROJECT_ID);
        sendResponse({ success: true, projects, activeProjectId });
      })
      .catch(error => {
        console.error('Get projects failed:', error);
        sendResponse({ success: false, error: error.message });
      });

    // Return true to indicate async response
    return true;
  }
});

/**
 * Generate a unique image name in the format image[8-digit-random].png
 * Ensures the name doesn't already exist in the provided media array
 */
function generateUniqueImageName(mediaArray) {
  const existingNames = new Set(mediaArray.map(m => m.name));
  let imageName;

  do {
    // Generate 8-digit random number
    const randomNum = Math.floor(Math.random() * 90000000) + 10000000;
    imageName = `image${randomNum}.png`;
  } while (existingNames.has(imageName));

  return imageName;
}

/**
 * Save selected text, image, or table and metadata to IndexedDB
 */
async function handleSaveSelection(data, sender) {
  try {
    const { type, url, title, projectId } = data;

    let contentId;

    if (type === 'table') {
      // Handle table saving with embedded images
      const { tableData, tableImages, note } = data;

      // Build text with optional note
      let tableText = title ? `Table from: ${title}` : 'Saved table';
      if (note) {
        tableText += '\n\nNote: ' + note;
      }

      // Process embedded images
      const mediaArray = [
        {
          type: 'table',
          data: tableData,
          name: title ? `${title} - table` : 'table'
        }
      ];

      // Add images if any were captured
      if (tableImages && tableImages.length > 0) {
        for (let i = 0; i < tableImages.length; i++) {
          const imageData = tableImages[i];

          // Decode base64 string back to ArrayBuffer
          const binaryString = atob(imageData.arrayBuffer);
          const bytes = new Uint8Array(binaryString.length);
          for (let j = 0; j < binaryString.length; j++) {
            bytes[j] = binaryString.charCodeAt(j);
          }

          // Convert ArrayBuffer back to Blob
          const blob = new Blob([bytes], { type: imageData.mimeType });

          // Generate fallback filename if imageData.name is undefined
          let imageName;
          if (imageData.name) {
            imageName = `table-${i + 1}-${imageData.name}`;
          } else {
            // Generate unique fallback filename: image[8-digit-random-number].png
            imageName = generateUniqueImageName(mediaArray);
          }

          // Add tableImageIndex to preserve position for copy
          mediaArray.push({
            type: 'image',
            mimeType: imageData.mimeType,
            blob: blob,
            name: imageName,
            tableImageIndex: i  // This matches the {{img:N}} placeholder
          });
        }

        // Update text to indicate images were captured
        tableText += `\n\n(Includes ${tableImages.length} embedded image${tableImages.length > 1 ? 's' : ''})`;
      }

      // Create content entry with the table and its embedded images
      contentId = await DBUtils.saveContent(null, {
        text: tableText,
        links: url ? [url] : [],
        media: mediaArray,
        projectId: projectId
      });

    } else if (type === 'image') {
      // Handle image saving
      const { imageData, note } = data;

      // Decode base64 string back to ArrayBuffer
      const binaryString = atob(imageData.arrayBuffer);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert ArrayBuffer back to Blob
      const blob = new Blob([bytes], { type: imageData.mimeType });

      // Build text with optional note
      let imageText = title ? `Image from: ${title}` : 'Saved image';
      if (note) {
        imageText += '\n\nNote: ' + note;
      }

      // Create content entry with the image
      contentId = await DBUtils.saveContent(null, {
        text: imageText,
        links: url ? [url] : [],
        media: [
          {
            type: imageData.mimeType.startsWith('image/') ? 'image' : 'media',
            mimeType: imageData.mimeType,
            blob: blob,
            name: imageData.name
          }
        ],
        projectId: projectId
      });

    } else if (type === 'imagelink') {
      // Handle combined image + link saving
      const { imageData, linkUrl, note } = data;

      // Decode base64 string back to ArrayBuffer
      const binaryString = atob(imageData.arrayBuffer);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert ArrayBuffer back to Blob
      const blob = new Blob([bytes], { type: imageData.mimeType });

      // Build text with optional note
      let contentText = title ? `Image from: ${title}` : 'Saved image';
      if (note) {
        contentText += '\n\nNote: ' + note;
      }

      // Create content entry with both image AND link
      contentId = await DBUtils.saveContent(null, {
        text: contentText,
        links: [linkUrl, url].filter(Boolean),
        media: [
          {
            type: 'image',
            mimeType: imageData.mimeType,
            blob: blob,
            name: imageData.name
          }
        ],
        contentType: 'imagelink',
        projectId: projectId
      });

    } else if (type === 'link') {
      // Handle link saving
      const { text, linkUrl } = data;

      // Format the text to include source information
      const formattedText = title
        ? `${text}\n\n---\nSource: ${title}`
        : text;

      // Create content entry with the link
      // The linkUrl is the actual link being saved, url is the page where it was found
      contentId = await DBUtils.saveContent(null, {
        text: formattedText,
        links: linkUrl ? [linkUrl, url].filter(Boolean) : (url ? [url] : []),
        media: [],
        contentType: 'link',  // Mark as link item
        projectId: projectId
      });

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
        media: [],
        projectId: projectId
      });

    }

    // Record undo action for popover saves
    try {
      const createdContent = await DBUtils.getContent(contentId);
      // Use the projectId from the created content
      const projectId = createdContent.projectId || DBUtils.DEFAULT_PROJECT_ID;
      await UndoRedoUtils.recordAction(projectId, 'create', contentId, null, createdContent);
    } catch (undoError) {
      // Log but don't fail the save if undo recording fails
      console.warn('Failed to record undo action:', undoError);
    }

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
