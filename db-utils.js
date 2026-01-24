/**
 * Database Utilities for Content Writing Assistant
 * Unified IndexedDB storage for all content and media
 *
 * Database Structure:
 * - Database Name: ContentWritingAssistant
 * - Object Store: items
 * - Key: string (e.g., "content:123" or "media:456")
 *
 * Content Object:
 * {
 *   "key": "content:123",
 *   "type": "content",
 *   "text": "User content text...",
 *   "links": ["https://example.com"],
 *   "media": [
 *     {
 *       "id": "media:456",
 *       "type": "image",
 *       "mimeType": "image/png",
 *       "blob": Blob,
 *       "size": 245678,
 *       "name": "photo.png"
 *     }
 *   ],
 *   "created": timestamp,
 *   "modified": timestamp
 * }
 */

const DBUtils = {
  DB_NAME: 'ContentWritingAssistant',
  DB_VERSION: 2,
  STORE_NAME: 'items',

  // Connection pool properties
  _dbConnection: null,              // Cached database connection
  _idleTimeout: 60000,              // Close after 60 seconds of inactivity
  _idleTimer: null,                 // Timer ID for idle timeout
  _connectionPromise: null,         // In-flight connection promise
  _isClosing: false,                // Prevent operations during close
  _keepAliveInterval: null,         // Keep service worker alive

  /**
   * Get cached connection or open a new one
   * @returns {Promise<IDBDatabase>} Database instance
   */
  async getConnection() {
    // Return cached connection if available
    if (this._dbConnection && !this._isClosing) {
      this.resetIdleTimer();
      return this._dbConnection;
    }

    // Return existing connection promise if already connecting
    if (this._connectionPromise) {
      return this._connectionPromise;
    }

    // Open new connection
    this._connectionPromise = this._openDatabaseInternal();

    try {
      this._dbConnection = await this._connectionPromise;
      this.resetIdleTimer();
      return this._dbConnection;
    } finally {
      this._connectionPromise = null;
    }
  },

  /**
   * Open database connection (internal)
   * @returns {Promise<IDBDatabase>} Database instance
   */
  async _openDatabaseInternal() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open database'));
      };

      request.onsuccess = () => {
        const db = request.result;

        // Listen for unexpected connection closes
        db.onclose = () => {
          console.warn('Database connection closed unexpectedly');
          this._dbConnection = null;
          this.clearIdleTimer();
        };

        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;

        // Migration from version 1 (media store) to version 2 (items store)
        if (oldVersion < 2) {
          // Delete old media store if it exists
          if (db.objectStoreNames.contains('media')) {
            db.deleteObjectStore('media');
          }
        }

        // Create new unified object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const objectStore = db.createObjectStore(this.STORE_NAME, { keyPath: 'key' });

          // Create indexes for efficient querying
          objectStore.createIndex('type', 'type', { unique: false });
          objectStore.createIndex('created', 'created', { unique: false });
          objectStore.createIndex('modified', 'modified', { unique: false });
        }
      };
    });
  },

  /**
   * Initialize and open the database (backwards compatible alias)
   * @returns {Promise<IDBDatabase>} Database instance
   */
  async openDatabase() {
    return this.getConnection();
  },

  /**
   * Reset the idle timer to keep connection alive
   */
  resetIdleTimer() {
    this.clearIdleTimer();

    // Start keep-alive interval to prevent service worker termination
    if (!this._keepAliveInterval) {
      this._keepAliveInterval = setInterval(() => {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.getPlatformInfo(() => {
            // This keeps service worker alive
          });
        }
      }, 25000); // Every 25 seconds
    }

    // Set timer to close connection after idle period
    this._idleTimer = setTimeout(() => {
      this.closeConnection();
    }, this._idleTimeout);
  },

  /**
   * Clear the idle timer
   */
  clearIdleTimer() {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
  },

  /**
   * Close the database connection
   */
  closeConnection() {
    this.clearIdleTimer();

    // Stop keep-alive
    if (this._keepAliveInterval) {
      clearInterval(this._keepAliveInterval);
      this._keepAliveInterval = null;
    }

    if (this._dbConnection) {
      this._isClosing = true;
      try {
        this._dbConnection.close();
        console.log('Database connection closed after idle timeout');
      } catch (error) {
        console.warn('Error closing database:', error);
      } finally {
        this._dbConnection = null;
        this._isClosing = false;
      }
    }
  },

  /**
   * Generate a unique ID for content
   * @returns {string} Unique content ID
   */
  generateContentId() {
    return `content:${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Generate a unique ID for media
   * @param {string} type - Media type (image, audio, video)
   * @returns {string} Unique ID
   */
  generateMediaId(type = 'img') {
    return `media:${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Validate MIME type
   * @param {string} mimeType - MIME type to validate
   * @param {string} expectedType - Expected type (image, audio, video)
   * @returns {boolean} Whether MIME type is valid
   */
  validateMimeType(mimeType, expectedType) {
    const validTypes = {
      image: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'],
      audio: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm'],
      video: ['video/mp4', 'video/webm', 'video/ogg']
    };

    return validTypes[expectedType]?.includes(mimeType) || false;
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
   * Save content with embedded media
   * @param {string} id - Content ID (optional, will generate if not provided)
   * @param {Object} data - Content data
   * @param {string} data.text - Text content
   * @param {string[]} [data.links] - Array of URLs
   * @param {Array} [data.media] - Array of media objects with blobs
   * @returns {Promise<string>} Content ID
   */
  async saveContent(id, data) {
    try {
      const contentId = id || this.generateContentId();
      const db = await this.getConnection();

      // Validate and sanitize links
      const validLinks = (data.links || [])
        .map(link => this.validateUrl(link))
        .filter(link => link !== null);

      // Process media array
      const processedMedia = (data.media || []).map(mediaItem => {
        if (mediaItem.blob && !(mediaItem.blob instanceof Blob)) {
          throw new Error('Invalid media blob provided');
        }
        return {
          id: mediaItem.id || this.generateMediaId(mediaItem.type || 'media'),
          type: mediaItem.type || 'image',
          mimeType: mediaItem.mimeType || mediaItem.blob?.type || 'application/octet-stream',
          blob: mediaItem.blob,
          size: mediaItem.blob?.size || 0,
          name: mediaItem.name || 'untitled'
        };
      });

      const contentObject = {
        key: contentId,
        type: 'content',
        text: data.text || '',
        links: validLinks,
        media: processedMedia,
        created: data.created || Date.now(),
        modified: Date.now()
      };

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const request = objectStore.put(contentObject);

        request.onsuccess = () => {
          resolve(contentId);
        };

        request.onerror = () => {
          reject(new Error('Failed to save content'));
        };
      });
    } catch (error) {
      console.error('Error saving content:', error);
      throw error;
    }
  },

  /**
   * Get content by ID
   * @param {string} id - Content ID
   * @returns {Promise<Object|null>} Content object or null
   */
  async getContent(id) {
    try {
      const db = await this.getConnection();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const request = objectStore.get(id);

        request.onsuccess = () => {
          resolve(request.result || null);
        };

        request.onerror = () => {
          reject(new Error('Failed to get content'));
        };
      });
    } catch (error) {
      console.error('Error getting content:', error);
      throw error;
    }
  },

  /**
   * Get all content entries
   * @returns {Promise<Object[]>} Array of content objects
   */
  async getAllContent() {
    try {
      const db = await this.getConnection();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const index = objectStore.index('type');
        const request = index.getAll('content');

        request.onsuccess = () => {
          const content = request.result || [];
          // Sort by modified date, most recent first
          resolve(content.sort((a, b) => b.modified - a.modified));
        };

        request.onerror = () => {
          reject(new Error('Failed to get all content'));
        };
      });
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
      const db = await this.getConnection();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const request = objectStore.delete(id);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(new Error('Failed to delete content'));
        };
      });
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
   * Add media to content
   * @param {string} contentId - Content ID
   * @param {Blob} blob - Media blob
   * @param {Object} metadata - Media metadata
   * @returns {Promise<string>} Media ID
   */
  async addMediaToContent(contentId, blob, metadata = {}) {
    try {
      const content = await this.getContent(contentId);
      if (!content) {
        throw new Error(`Content with ID ${contentId} not found`);
      }

      const mediaId = this.generateMediaId(metadata.type || 'media');
      const mediaItem = {
        id: mediaId,
        type: metadata.type || 'image',
        mimeType: metadata.mimeType || blob.type,
        blob: blob,
        size: blob.size,
        name: metadata.name || 'untitled'
      };

      content.media.push(mediaItem);
      content.modified = Date.now();
      await this.saveContent(contentId, content);

      return mediaId;
    } catch (error) {
      console.error('Error adding media to content:', error);
      throw error;
    }
  },


  /**
   * Get storage quota estimate
   * @returns {Promise<Object>} Storage quota information
   */
  async getStorageEstimate() {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        return {
          usage: estimate.usage || 0,
          quota: estimate.quota || 0,
          percentUsed: estimate.quota ? ((estimate.usage / estimate.quota) * 100).toFixed(2) : 0
        };
      }
      return {
        usage: 0,
        quota: 0,
        percentUsed: 0,
        error: 'Storage API not supported'
      };
    } catch (error) {
      console.error('Error getting storage estimate:', error);
      throw error;
    }
  },

  /**
   * Clear all content (use with caution)
   * @returns {Promise<void>}
   */
  async clearAllContent() {
    try {
      const db = await this.getConnection();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const request = objectStore.clear();

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(new Error('Failed to clear all content'));
        };
      });
    } catch (error) {
      console.error('Error clearing all content:', error);
      throw error;
    }
  },

  /**
   * Create object URL from blob for display
   * @param {Blob} blob - Blob to create URL for
   * @returns {string} Object URL
   */
  createObjectURL(blob) {
    return URL.createObjectURL(blob);
  },

  /**
   * Revoke object URL
   * @param {string} url - Object URL to revoke
   */
  revokeObjectURL(url) {
    URL.revokeObjectURL(url);
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DBUtils;
}
