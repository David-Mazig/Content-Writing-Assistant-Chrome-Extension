/**
 * Content Writing Assistant - Popup Script
 * Uses unified IndexedDB storage for all content and media
 */

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Content Writing Assistant popup loaded');
  await initializeStorage();
  await displayStorageStats();
  await renderContentList();
  initializeEventListeners();
});

/**
 * Initialize UI event listeners
 */
function initializeEventListeners() {
  // New content button
  document.getElementById('btn-new-content').addEventListener('click', () => {
    document.getElementById('new-content-form').classList.remove('hidden');
  });

  // Close modal
  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.getElementById('btn-cancel').addEventListener('click', closeModal);

  // Save content
  document.getElementById('btn-save-content').addEventListener('click', saveNewContent);

  // Media file input
  document.getElementById('input-media').addEventListener('change', handleMediaSelection);
}

/**
 * Close the new content modal
 */
function closeModal() {
  document.getElementById('new-content-form').classList.add('hidden');
  document.getElementById('input-text').value = '';
  document.getElementById('input-link').value = '';
  document.getElementById('input-media').value = '';
  document.getElementById('media-preview').innerHTML = '';
}

/**
 * Handle media file selection
 */
function handleMediaSelection(event) {
  const files = event.target.files;
  const preview = document.getElementById('media-preview');
  preview.innerHTML = '';

  if (files.length > 0) {
    preview.innerHTML = `<div class="media-count">${files.length} file(s) selected</div>`;
  }
}

/**
 * Save new content from form
 */
async function saveNewContent() {
  try {
    const text = document.getElementById('input-text').value;
    const linkInput = document.getElementById('input-link').value;
    const links = linkInput.trim() ? [linkInput.trim()] : [];
    const mediaFiles = Array.from(document.getElementById('input-media').files);

    if (!text && mediaFiles.length === 0) {
      alert('Please enter some text or add media');
      return;
    }

    await createContent(text, links, mediaFiles);
    closeModal();
  } catch (error) {
    console.error('Error saving content:', error);
    alert('Failed to save content: ' + error.message);
  }
}

/**
 * Initialize database
 */
async function initializeStorage() {
  try {
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
    const allContent = await DBUtils.getAllContent();
    const quotaInfo = await DBUtils.getStorageEstimate();

    console.log('Storage Stats:', {
      contentCount: allContent.length,
      usage: `${(quotaInfo.usage / 1024 / 1024).toFixed(2)} MB`,
      quota: `${(quotaInfo.quota / 1024 / 1024).toFixed(2)} MB`,
      percentUsed: `${quotaInfo.percentUsed}%`
    });
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

    console.log('Content created:', contentId);
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
      console.log('Content not found:', contentId);
      return null;
    }

    console.log('Content loaded:', content);
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
    console.log('All content:', allContent);
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
    await DBUtils.deleteContent(contentId);
    console.log('Content deleted:', contentId);
    await renderContentList();
  } catch (error) {
    console.error('Error deleting content:', error);
    throw error;
  }
}

/**
 * Render content list in the UI
 */
async function renderContentList() {
  try {
    const contentList = await DBUtils.getAllContent();
    const container = document.getElementById('content-list');

    if (!container) return;

    container.innerHTML = '';

    if (contentList.length === 0) {
      container.innerHTML = '<div class="empty-state">No content yet. Create your first item!</div>';
      return;
    }

    for (const content of contentList) {
      const itemEl = createContentItemElement(content);
      container.appendChild(itemEl);
    }
  } catch (error) {
    console.error('Error rendering content list:', error);
  }
}

/**
 * Create DOM element for a content item
 */
function createContentItemElement(content) {
  const div = document.createElement('div');
  div.className = 'content-item';
  div.dataset.contentId = content.key;

  // Format date
  const date = new Date(content.modified);
  const dateStr = date.toLocaleDateString();

  // Truncate text preview
  const textPreview = content.text.substring(0, 100) + (content.text.length > 100 ? '...' : '');

  // Count media by type
  const imageCount = content.media.filter(m => m.type === 'image').length;
  const audioCount = content.media.filter(m => m.type === 'audio').length;
  const videoCount = content.media.filter(m => m.type === 'video').length;

  div.innerHTML = `
    <div class="content-header">
      <span class="content-date">${dateStr}</span>
      <button class="btn-delete" onclick="deleteContent('${content.key}')">Delete</button>
    </div>
    <div class="content-text">${textPreview || '<em>No text</em>'}</div>
    ${content.links.length > 0 ? `<div class="content-links">🔗 ${content.links.length} link(s)</div>` : ''}
    ${content.media.length > 0 ? `
      <div class="content-media-summary">
        ${imageCount > 0 ? `📷 ${imageCount} image(s)` : ''}
        ${audioCount > 0 ? `🎵 ${audioCount} audio` : ''}
        ${videoCount > 0 ? `🎬 ${videoCount} video` : ''}
      </div>
    ` : ''}
    ${content.media.filter(m => m.type === 'image').slice(0, 3).map(m => `
      <img src="${DBUtils.createObjectURL(m.blob)}" class="content-thumbnail" alt="${m.name}">
    `).join('')}
  `;

  return div;
}

// Make functions available in global scope for testing
window.ContentAssistant = {
  createContent,
  loadContent,
  listAllContent,
  deleteContent,
  renderContentList,
  DBUtils
};
