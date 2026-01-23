/**
 * Content Writing Assistant - Popup Script
 * Integrates storage-utils.js and db-utils.js for data management
 */

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Content Writing Assistant popup loaded');
  await initializeStorage();
  await displayStorageStats();
});

/**
 * Initialize storage and database
 */
async function initializeStorage() {
  try {
    // Test chrome.storage.local access
    const testData = await chrome.storage.local.get(null);
    console.log('Storage initialized:', Object.keys(testData).length, 'items');

    // Test IndexedDB access
    await DBUtils.openDatabase();
    console.log('IndexedDB initialized');
  } catch (error) {
    console.error('Storage initialization error:', error);
  }
}

/**
 * Display storage statistics in console
 */
async function displayStorageStats() {
  try {
    // Get chrome.storage.local stats
    const storageStats = await StorageUtils.getStorageStats();
    console.log('Chrome Storage Stats:', {
      bytesUsed: `${(storageStats.bytesUsed / 1024).toFixed(2)} KB`,
      itemCount: storageStats.itemCount,
      contentCount: storageStats.contentCount
    });

    // Get IndexedDB storage quota
    const quotaInfo = await DBUtils.getStorageEstimate();
    console.log('IndexedDB Quota:', {
      usage: `${(quotaInfo.usage / 1024 / 1024).toFixed(2)} MB`,
      quota: `${(quotaInfo.quota / 1024 / 1024).toFixed(2)} MB`,
      percentUsed: `${quotaInfo.percentUsed}%`
    });
  } catch (error) {
    console.error('Error displaying storage stats:', error);
  }
}

/**
 * Example: Create new content
 */
async function createContent(text, links = [], imageFiles = []) {
  try {
    const contentId = StorageUtils.generateId();
    const imageRefs = [];

    // Save images to IndexedDB first
    for (const file of imageFiles) {
      if (file instanceof File && file.type.startsWith('image/')) {
        const blob = new Blob([await file.arrayBuffer()], { type: file.type });
        const imageId = await DBUtils.saveImage(null, blob, {
          mimeType: file.type,
          name: file.name
        });
        imageRefs.push(imageId);
      }
    }

    // Save content metadata to chrome.storage.local
    await StorageUtils.saveContent(contentId, {
      text,
      links,
      imageRefs
    });

    console.log('Content created:', contentId);
    return contentId;
  } catch (error) {
    console.error('Error creating content:', error);
    throw error;
  }
}

/**
 * Example: Load content by ID
 */
async function loadContent(contentId) {
  try {
    const content = await StorageUtils.getContent(contentId);
    if (!content) {
      console.log('Content not found:', contentId);
      return null;
    }

    console.log('Content loaded:', content);

    // Load images if present
    if (content.imageRefs && content.imageRefs.length > 0) {
      const images = [];
      for (const imageId of content.imageRefs) {
        const image = await DBUtils.getImage(imageId);
        if (image) {
          images.push({
            id: imageId,
            url: DBUtils.createObjectURL(image.blob),
            mimeType: image.mimeType,
            size: image.size
          });
        }
      }
      console.log('Images loaded:', images.length);
      return { ...content, images };
    }

    return content;
  } catch (error) {
    console.error('Error loading content:', error);
    throw error;
  }
}

/**
 * Example: List all content
 */
async function listAllContent() {
  try {
    const allContent = await StorageUtils.getAllContent();
    console.log('All content:', allContent);
    return allContent;
  } catch (error) {
    console.error('Error listing content:', error);
    throw error;
  }
}

/**
 * Example: Delete content and associated images
 */
async function deleteContent(contentId) {
  try {
    const content = await StorageUtils.getContent(contentId);
    if (!content) {
      console.log('Content not found:', contentId);
      return;
    }

    // Delete associated images from IndexedDB
    if (content.imageRefs && content.imageRefs.length > 0) {
      for (const imageId of content.imageRefs) {
        await DBUtils.deleteImage(imageId);
      }
    }

    // Delete content from chrome.storage.local
    await StorageUtils.deleteContent(contentId);
    console.log('Content deleted:', contentId);
  } catch (error) {
    console.error('Error deleting content:', error);
    throw error;
  }
}

// Make functions available in global scope for testing
window.ContentAssistant = {
  createContent,
  loadContent,
  listAllContent,
  deleteContent,
  StorageUtils,
  DBUtils
};
