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
      .then(result => sendResponse({ success: true, contentId: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));

    // Return true to indicate async response
    return true;
  }
});

/**
 * Save selected text and metadata to IndexedDB
 */
async function handleSaveSelection(data, sender) {
  try {
    const { text, url, title } = data;

    // Format the text to include source information
    const formattedText = title
      ? `${text}\n\n---\nSource: ${title}`
      : text;

    // Create content entry with the selected text
    const contentId = await DBUtils.saveContent(null, {
      text: formattedText,
      links: url ? [url] : [],
      media: []
    });

    console.log('Content saved from selection:', contentId);

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

// Initialize database on installation
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed, initializing database...');
  try {
    await DBUtils.openDatabase();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
});
