/**
 * Storage Utilities for Content Writing Assistant
 * Wrapper for chrome.storage.local API
 *
 * Data Structure:
 * {
 *   "content:{id}": {
 *     "id": "123",
 *     "text": "User content...",
 *     "links": ["https://example.com"],
 *     "imageRefs": ["img:456"],  // References to IndexedDB
 *     "created": timestamp,
 *     "modified": timestamp
 *   }
 * }
 */

const StorageUtils = {
  /**
   * Generate a unique ID for content
   * @returns {string} Unique ID
   */
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Validate and sanitize URL
   * @param {string} url - URL to validate
   * @returns {string|null} Valid URL or null
   */
  validateUrl(url) {
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
        return urlObj.href;
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Save content with metadata
   * @param {string} id - Content ID (optional, will generate if not provided)
   * @param {Object} data - Content data
   * @param {string} data.text - Text content
   * @param {string[]} [data.links] - Array of URLs
   * @param {string[]} [data.imageRefs] - Array of image IDs from IndexedDB
   * @returns {Promise<string>} Content ID
   */
  async saveContent(id, data) {
    try {
      const contentId = id || this.generateId();
      const key = `content:${contentId}`;

      // Validate and sanitize links
      const validLinks = (data.links || [])
        .map(link => this.validateUrl(link))
        .filter(link => link !== null);

      const content = {
        id: contentId,
        text: data.text || '',
        links: validLinks,
        imageRefs: data.imageRefs || [],
        created: data.created || Date.now(),
        modified: Date.now()
      };

      await chrome.storage.local.set({ [key]: content });
      return contentId;
    } catch (error) {
      if (error.message && error.message.includes('QUOTA_BYTES')) {
        throw new Error('Storage quota exceeded. Please delete some content.');
      }
      throw error;
    }
  },

  /**
   * Get content by ID
   * @param {string} id - Content ID
   * @returns {Promise<Object|null>} Content data or null
   */
  async getContent(id) {
    try {
      const key = `content:${id}`;
      const result = await chrome.storage.local.get(key);
      return result[key] || null;
    } catch (error) {
      console.error('Error getting content:', error);
      throw error;
    }
  },

  /**
   * Get all stored content
   * @returns {Promise<Object[]>} Array of content objects
   */
  async getAllContent() {
    try {
      const allData = await chrome.storage.local.get(null);
      const contentItems = [];

      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('content:')) {
          contentItems.push(value);
        }
      }

      // Sort by modified date, most recent first
      return contentItems.sort((a, b) => b.modified - a.modified);
    } catch (error) {
      console.error('Error getting all content:', error);
      throw error;
    }
  },

  /**
   * Delete content by ID
   * @param {string} id - Content ID
   * @returns {Promise<void>}
   */
  async deleteContent(id) {
    try {
      const key = `content:${id}`;
      await chrome.storage.local.remove(key);
    } catch (error) {
      console.error('Error deleting content:', error);
      throw error;
    }
  },

  /**
   * Update content text
   * @param {string} id - Content ID
   * @param {string} text - New text content
   * @returns {Promise<void>}
   */
  async updateContentText(id, text) {
    try {
      const content = await this.getContent(id);
      if (!content) {
        throw new Error(`Content with ID ${id} not found`);
      }

      content.text = text;
      content.modified = Date.now();

      await this.saveContent(id, content);
    } catch (error) {
      console.error('Error updating content text:', error);
      throw error;
    }
  },

  /**
   * Add link to content
   * @param {string} id - Content ID
   * @param {string} url - URL to add
   * @returns {Promise<void>}
   */
  async addLink(id, url) {
    try {
      const content = await this.getContent(id);
      if (!content) {
        throw new Error(`Content with ID ${id} not found`);
      }

      const validUrl = this.validateUrl(url);
      if (!validUrl) {
        throw new Error('Invalid URL');
      }

      if (!content.links.includes(validUrl)) {
        content.links.push(validUrl);
        content.modified = Date.now();
        await this.saveContent(id, content);
      }
    } catch (error) {
      console.error('Error adding link:', error);
      throw error;
    }
  },

  /**
   * Remove link from content
   * @param {string} id - Content ID
   * @param {string} url - URL to remove
   * @returns {Promise<void>}
   */
  async removeLink(id, url) {
    try {
      const content = await this.getContent(id);
      if (!content) {
        throw new Error(`Content with ID ${id} not found`);
      }

      content.links = content.links.filter(link => link !== url);
      content.modified = Date.now();
      await this.saveContent(id, content);
    } catch (error) {
      console.error('Error removing link:', error);
      throw error;
    }
  },

  /**
   * Add image reference to content
   * @param {string} id - Content ID
   * @param {string} imageId - Image ID from IndexedDB
   * @returns {Promise<void>}
   */
  async addImageRef(id, imageId) {
    try {
      const content = await this.getContent(id);
      if (!content) {
        throw new Error(`Content with ID ${id} not found`);
      }

      if (!content.imageRefs.includes(imageId)) {
        content.imageRefs.push(imageId);
        content.modified = Date.now();
        await this.saveContent(id, content);
      }
    } catch (error) {
      console.error('Error adding image reference:', error);
      throw error;
    }
  },

  /**
   * Remove image reference from content
   * @param {string} id - Content ID
   * @param {string} imageId - Image ID to remove
   * @returns {Promise<void>}
   */
  async removeImageRef(id, imageId) {
    try {
      const content = await this.getContent(id);
      if (!content) {
        throw new Error(`Content with ID ${id} not found`);
      }

      content.imageRefs = content.imageRefs.filter(ref => ref !== imageId);
      content.modified = Date.now();
      await this.saveContent(id, content);
    } catch (error) {
      console.error('Error removing image reference:', error);
      throw error;
    }
  },

  /**
   * Get storage usage statistics
   * @returns {Promise<Object>} Storage statistics
   */
  async getStorageStats() {
    try {
      const allData = await chrome.storage.local.get(null);
      const dataString = JSON.stringify(allData);
      const bytesUsed = new Blob([dataString]).size;

      return {
        bytesUsed,
        itemCount: Object.keys(allData).length,
        contentCount: Object.keys(allData).filter(k => k.startsWith('content:')).length
      };
    } catch (error) {
      console.error('Error getting storage stats:', error);
      throw error;
    }
  },

  /**
   * Clear all content (use with caution)
   * @returns {Promise<void>}
   */
  async clearAllContent() {
    try {
      const allData = await chrome.storage.local.get(null);
      const contentKeys = Object.keys(allData).filter(k => k.startsWith('content:'));
      await chrome.storage.local.remove(contentKeys);
    } catch (error) {
      console.error('Error clearing all content:', error);
      throw error;
    }
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StorageUtils;
}
