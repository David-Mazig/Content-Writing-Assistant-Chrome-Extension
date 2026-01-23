/**
 * Database Utilities for Content Writing Assistant
 * Wrapper for IndexedDB API for media storage
 *
 * Database Structure:
 * - Database Name: ContentWritingAssistant
 * - Object Store: media
 * - Key: string (e.g., "img:456")
 *
 * Media Object:
 * {
 *   "key": "img:456",
 *   "type": "image",
 *   "mimeType": "image/png",
 *   "blob": Blob,
 *   "size": 245678,
 *   "created": timestamp
 * }
 */

const DBUtils = {
  DB_NAME: 'ContentWritingAssistant',
  DB_VERSION: 1,
  STORE_NAME: 'media',

  /**
   * Initialize and open the database
   * @returns {Promise<IDBDatabase>} Database instance
   */
  async openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open database'));
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const objectStore = db.createObjectStore(this.STORE_NAME, { keyPath: 'key' });

          // Create indexes for efficient querying
          objectStore.createIndex('type', 'type', { unique: false });
          objectStore.createIndex('created', 'created', { unique: false });
          objectStore.createIndex('mimeType', 'mimeType', { unique: false });
        }
      };
    });
  },

  /**
   * Generate a unique ID for media
   * @param {string} type - Media type (image, audio, video)
   * @returns {string} Unique ID
   */
  generateMediaId(type = 'img') {
    return `${type}:${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
   * Save image to IndexedDB
   * @param {string} id - Image ID (optional, will generate if not provided)
   * @param {Blob} blob - Image blob
   * @param {Object} metadata - Additional metadata
   * @param {string} metadata.mimeType - MIME type
   * @returns {Promise<string>} Image ID
   */
  async saveImage(id, blob, metadata = {}) {
    try {
      if (!(blob instanceof Blob)) {
        throw new Error('Invalid blob provided');
      }

      const mimeType = metadata.mimeType || blob.type;
      if (!this.validateMimeType(mimeType, 'image')) {
        throw new Error('Invalid image MIME type');
      }

      const imageId = id || this.generateMediaId('img');
      const db = await this.openDatabase();

      const mediaObject = {
        key: imageId,
        type: 'image',
        mimeType,
        blob,
        size: blob.size,
        created: Date.now(),
        ...metadata
      };

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const request = objectStore.put(mediaObject);

        request.onsuccess = () => {
          db.close();
          resolve(imageId);
        };

        request.onerror = () => {
          db.close();
          reject(new Error('Failed to save image'));
        };
      });
    } catch (error) {
      console.error('Error saving image:', error);
      throw error;
    }
  },

  /**
   * Get image from IndexedDB
   * @param {string} id - Image ID
   * @returns {Promise<Object|null>} Image object or null
   */
  async getImage(id) {
    try {
      const db = await this.openDatabase();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const request = objectStore.get(id);

        request.onsuccess = () => {
          db.close();
          resolve(request.result || null);
        };

        request.onerror = () => {
          db.close();
          reject(new Error('Failed to get image'));
        };
      });
    } catch (error) {
      console.error('Error getting image:', error);
      throw error;
    }
  },

  /**
   * Delete image from IndexedDB
   * @param {string} id - Image ID
   * @returns {Promise<void>}
   */
  async deleteImage(id) {
    try {
      const db = await this.openDatabase();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const request = objectStore.delete(id);

        request.onsuccess = () => {
          db.close();
          resolve();
        };

        request.onerror = () => {
          db.close();
          reject(new Error('Failed to delete image'));
        };
      });
    } catch (error) {
      console.error('Error deleting image:', error);
      throw error;
    }
  },

  /**
   * Get all images from IndexedDB
   * @returns {Promise<Object[]>} Array of image objects
   */
  async getAllImages() {
    try {
      const db = await this.openDatabase();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const index = objectStore.index('type');
        const request = index.getAll('image');

        request.onsuccess = () => {
          db.close();
          const images = request.result || [];
          // Sort by created date, most recent first
          resolve(images.sort((a, b) => b.created - a.created));
        };

        request.onerror = () => {
          db.close();
          reject(new Error('Failed to get all images'));
        };
      });
    } catch (error) {
      console.error('Error getting all images:', error);
      throw error;
    }
  },

  /**
   * Save audio to IndexedDB
   * @param {string} id - Audio ID (optional, will generate if not provided)
   * @param {Blob} blob - Audio blob
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<string>} Audio ID
   */
  async saveAudio(id, blob, metadata = {}) {
    try {
      if (!(blob instanceof Blob)) {
        throw new Error('Invalid blob provided');
      }

      const mimeType = metadata.mimeType || blob.type;
      if (!this.validateMimeType(mimeType, 'audio')) {
        throw new Error('Invalid audio MIME type');
      }

      const audioId = id || this.generateMediaId('audio');
      const db = await this.openDatabase();

      const mediaObject = {
        key: audioId,
        type: 'audio',
        mimeType,
        blob,
        size: blob.size,
        created: Date.now(),
        ...metadata
      };

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const request = objectStore.put(mediaObject);

        request.onsuccess = () => {
          db.close();
          resolve(audioId);
        };

        request.onerror = () => {
          db.close();
          reject(new Error('Failed to save audio'));
        };
      });
    } catch (error) {
      console.error('Error saving audio:', error);
      throw error;
    }
  },

  /**
   * Save video to IndexedDB
   * @param {string} id - Video ID (optional, will generate if not provided)
   * @param {Blob} blob - Video blob
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<string>} Video ID
   */
  async saveVideo(id, blob, metadata = {}) {
    try {
      if (!(blob instanceof Blob)) {
        throw new Error('Invalid blob provided');');
      }

      const mimeType = metadata.mimeType || blob.type;
      if (!this.validateMimeType(mimeType, 'video')) {
        throw new Error('Invalid video MIME type');
      }

      const videoId = id || this.generateMediaId('video');
      const db = await this.openDatabase();

      const mediaObject = {
        key: videoId,
        type: 'video',
        mimeType,
        blob,
        size: blob.size,
        created: Date.now(),
        ...metadata
      };

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const request = objectStore.put(mediaObject);

        request.onsuccess = () => {
          db.close();
          resolve(videoId);
        };

        request.onerror = () => {
          db.close();
          reject(new Error('Failed to save video'));
        };
      });
    } catch (error) {
      console.error('Error saving video:', error);
      throw error;
    }
  },

  /**
   * Get all media items
   * @returns {Promise<Object[]>} Array of all media objects
   */
  async getAllMedia() {
    try {
      const db = await this.openDatabase();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const request = objectStore.getAll();

        request.onsuccess = () => {
          db.close();
          const media = request.result || [];
          // Sort by created date, most recent first
          resolve(media.sort((a, b) => b.created - a.created));
        };

        request.onerror = () => {
          db.close();
          reject(new Error('Failed to get all media'));
        };
      });
    } catch (error) {
      console.error('Error getting all media:', error);
      throw error;
    }
  },

  /**
   * Delete media by ID
   * @param {string} id - Media ID
   * @returns {Promise<void>}
   */
  async deleteMedia(id) {
    try {
      const db = await this.openDatabase();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const request = objectStore.delete(id);

        request.onsuccess = () => {
          db.close();
          resolve();
        };

        request.onerror = () => {
          db.close();
          reject(new Error('Failed to delete media'));
        };
      });
    } catch (error) {
      console.error('Error deleting media:', error);
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
   * Clear all media (use with caution)
   * @returns {Promise<void>}
   */
  async clearAllMedia() {
    try {
      const db = await this.openDatabase();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const request = objectStore.clear();

        request.onsuccess = () => {
          db.close();
          resolve();
        };

        request.onerror = () => {
          db.close();
          reject(new Error('Failed to clear all media'));
        };
      });
    } catch (error) {
      console.error('Error clearing all media:', error);
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
