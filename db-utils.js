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
  DB_VERSION: 3,
  STORE_NAME: 'items',
  DEFAULT_PROJECT_ID: 'project:default',

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
        const transaction = event.target.transaction;

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

        // Migration from version 2 to version 3 (add projects support)
        if (oldVersion < 3) {
          const objectStore = transaction.objectStore(this.STORE_NAME);

          // Add projectId index for efficient project-based filtering
          if (!objectStore.indexNames.contains('projectId')) {
            objectStore.createIndex('projectId', 'projectId', { unique: false });
          }

          // Create default project
          const defaultProject = {
            key: this.DEFAULT_PROJECT_ID,
            type: 'project',
            name: 'Untitled',
            created: Date.now(),
            modified: Date.now(),
            isDefault: true,
            itemCount: 0
          };

          try {
            objectStore.add(defaultProject);
          } catch (error) {
            console.warn('Default project may already exist:', error);
          }

          // Migrate all existing content items to default project
          const contentIndex = objectStore.index('type');
          const contentRequest = contentIndex.openCursor(IDBKeyRange.only('content'));

          contentRequest.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              const content = cursor.value;
              // Add projectId if it doesn't exist
              if (!content.projectId) {
                content.projectId = this.DEFAULT_PROJECT_ID;
                cursor.update(content);
              }
              cursor.continue();
            }
          };
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
        // Handle table type (has data instead of blob)
        if (mediaItem.type === 'table') {
          return {
            id: mediaItem.id || this.generateMediaId('table'),
            type: 'table',
            data: mediaItem.data,
            name: mediaItem.name || 'untitled table'
          };
        }

        // Handle blob-based media (image, audio, video)
        if (mediaItem.blob && !(mediaItem.blob instanceof Blob)) {
          console.error('[DB] Invalid media blob provided:', mediaItem);
          throw new Error('Invalid media blob provided');
        }
        const processedItem = {
          id: mediaItem.id || this.generateMediaId(mediaItem.type || 'media'),
          type: mediaItem.type || 'image',
          mimeType: mediaItem.mimeType || mediaItem.blob?.type || 'application/octet-stream',
          blob: mediaItem.blob,
          size: mediaItem.blob?.size || 0,
          name: mediaItem.name || 'untitled'
        };
        // Preserve tableImageIndex for table images (used for cell positioning)
        if (mediaItem.tableImageIndex !== undefined) {
          processedItem.tableImageIndex = mediaItem.tableImageIndex;
        }
        return processedItem;
      });

      const contentObject = {
        key: contentId,
        type: 'content',
        text: data.text || '',
        links: validLinks,
        media: processedMedia,
        created: data.created || Date.now(),
        modified: Date.now(),
        // Project association (defaults to default project if not specified)
        projectId: data.projectId || this.DEFAULT_PROJECT_ID,
        // Preserve order if specified (for drag-drop reordering)
        ...(data.order !== undefined && { order: data.order }),
        // Preserve contentType if specified (e.g., 'link' for saved links)
        ...(data.contentType && { contentType: data.contentType })
      };

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const request = objectStore.put(contentObject);

        request.onsuccess = () => {
          resolve(contentId);
        };

        request.onerror = () => {
          console.error('[DB] Failed to save content:', request.error);
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
          // Sort by order field (ascending), then by modified date (descending)
          resolve(content.sort((a, b) => {
            // Items with order field come first, sorted by order
            if (a.order !== undefined && b.order !== undefined) {
              return a.order - b.order;
            }
            // Items without order come after, sorted by modified date
            if (a.order !== undefined) return -1;
            if (b.order !== undefined) return 1;
            return b.modified - a.modified;
          }));
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
   * Update order field for content items (for drag and drop reordering)
   * @param {Array<{key: string, order: number}>} updates - Array of content keys with new order values
   * @returns {Promise<void>}
   */
  async updateContentOrder(updates) {
    try {
      const db = await this.getConnection();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(this.STORE_NAME);

        let completed = 0;
        const total = updates.length;

        if (total === 0) {
          resolve();
          return;
        }

        updates.forEach(({ key, order }) => {
          const getRequest = objectStore.get(key);

          getRequest.onsuccess = () => {
            const content = getRequest.result;
            if (content) {
              content.order = order;
              content.modified = Date.now();

              const putRequest = objectStore.put(content);

              putRequest.onsuccess = () => {
                completed++;
                if (completed === total) {
                  resolve();
                }
              };

              putRequest.onerror = () => {
                reject(new Error(`Failed to update order for ${key}`));
              };
            } else {
              completed++;
              if (completed === total) {
                resolve();
              }
            }
          };

          getRequest.onerror = () => {
            reject(new Error(`Failed to get content ${key}`));
          };
        });
      });
    } catch (error) {
      console.error('Error updating content order:', error);
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
  },

  // ============================================
  // Project Management Functions
  // ============================================

  /**
   * Generate unique project ID
   * @returns {string} Unique project ID
   */
  generateProjectId() {
    return `project:${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Save project (create or update)
   * @param {string} id - Project ID (optional, will generate if not provided)
   * @param {Object} data - Project data
   * @param {string} data.name - Project name
   * @param {boolean} [data.isDefault] - Whether this is the default project
   * @returns {Promise<string>} Project ID
   */
  async saveProject(id, data) {
    try {
      const projectId = id || this.generateProjectId();
      const db = await this.getConnection();

      // Prevent modifying the default project's isDefault flag
      if (id === this.DEFAULT_PROJECT_ID && data.isDefault === false) {
        throw new Error('Cannot modify default project flag');
      }

      // Get existing project for created timestamp
      let existingProject = null;
      if (id) {
        try {
          existingProject = await this.getProject(id);
        } catch (error) {
          // Project doesn't exist, that's ok
        }
      }

      const projectObject = {
        key: projectId,
        type: 'project',
        name: data.name || 'Untitled',
        created: existingProject?.created || data.created || Date.now(),
        modified: Date.now(),
        isDefault: data.isDefault || false,
        itemCount: data.itemCount !== undefined ? data.itemCount : (existingProject?.itemCount || 0)
      };

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const request = objectStore.put(projectObject);

        request.onsuccess = () => {
          resolve(projectId);
        };

        request.onerror = () => {
          console.error('[DB] Failed to save project:', request.error);
          reject(new Error('Failed to save project'));
        };
      });
    } catch (error) {
      console.error('Error saving project:', error);
      throw error;
    }
  },

  /**
   * Get project by ID
   * @param {string} id - Project ID
   * @returns {Promise<Object|null>} Project object or null
   */
  async getProject(id) {
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
          reject(new Error('Failed to get project'));
        };
      });
    } catch (error) {
      console.error('Error getting project:', error);
      throw error;
    }
  },

  /**
   * Get all projects
   * @returns {Promise<Object[]>} Array of project objects
   */
  async getAllProjects() {
    try {
      const db = await this.getConnection();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const index = objectStore.index('type');
        const request = index.getAll('project');

        request.onsuccess = () => {
          const projects = request.result || [];
          // Sort: default project first, then by name
          resolve(projects.sort((a, b) => {
            if (a.isDefault) return -1;
            if (b.isDefault) return 1;
            return a.name.localeCompare(b.name);
          }));
        };

        request.onerror = () => {
          reject(new Error('Failed to get all projects'));
        };
      });
    } catch (error) {
      console.error('Error getting all projects:', error);
      throw error;
    }
  },

  /**
   * Get default project
   * @returns {Promise<Object>} Default project object
   */
  async getDefaultProject() {
    try {
      const project = await this.getProject(this.DEFAULT_PROJECT_ID);
      if (!project) {
        throw new Error('Default project not found - database may be corrupted');
      }
      return project;
    } catch (error) {
      console.error('Error getting default project:', error);
      throw error;
    }
  },

  /**
   * Delete project by ID
   * @param {string} id - Project ID
   * @returns {Promise<void>}
   */
  async deleteProject(id) {
    try {
      if (id === this.DEFAULT_PROJECT_ID) {
        throw new Error('Cannot delete default project');
      }

      const db = await this.getConnection();

      return new Promise(async (resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(this.STORE_NAME);

        // Delete all content items in this project
        const projectIndex = objectStore.index('projectId');
        const contentRequest = projectIndex.openCursor(IDBKeyRange.only(id));

        contentRequest.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            // Then delete the project itself
            const deleteRequest = objectStore.delete(id);
            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = () => reject(new Error('Failed to delete project'));
          }
        };

        contentRequest.onerror = () => {
          reject(new Error('Failed to delete project content'));
        };
      });
    } catch (error) {
      console.error('Error deleting project:', error);
      throw error;
    }
  },

  /**
   * Get all content for a specific project
   * @param {string} projectId - Project ID
   * @returns {Promise<Object[]>} Array of content objects
   */
  async getContentByProject(projectId) {
    try {
      const db = await this.getConnection();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const index = objectStore.index('projectId');
        const request = index.getAll(projectId);

        request.onsuccess = () => {
          const content = (request.result || []).filter(item => item.type === 'content');
          // Sort by order field (ascending), then by modified date (descending)
          resolve(content.sort((a, b) => {
            if (a.order !== undefined && b.order !== undefined) {
              return a.order - b.order;
            }
            if (a.order !== undefined) return -1;
            if (b.order !== undefined) return 1;
            return b.modified - a.modified;
          }));
        };

        request.onerror = () => {
          reject(new Error('Failed to get content by project'));
        };
      });
    } catch (error) {
      console.error('Error getting content by project:', error);
      throw error;
    }
  },

  /**
   * Get count of content items in a project
   * @param {string} projectId - Project ID
   * @returns {Promise<number>} Count of content items
   */
  async getProjectContentCount(projectId) {
    try {
      const db = await this.getConnection();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const index = objectStore.index('projectId');
        const request = index.count(projectId);

        request.onsuccess = () => {
          resolve(request.result || 0);
        };

        request.onerror = () => {
          reject(new Error('Failed to count project content'));
        };
      });
    } catch (error) {
      console.error('Error counting project content:', error);
      throw error;
    }
  },

  /**
   * Move content item to a different project
   * @param {string} contentId - Content ID
   * @param {string} targetProjectId - Target project ID
   * @returns {Promise<void>}
   */
  async moveContentToProject(contentId, targetProjectId) {
    try {
      const db = await this.getConnection();

      // Validate target project exists
      const project = await this.getProject(targetProjectId);
      if (!project) {
        throw new Error('Target project not found');
      }

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(this.STORE_NAME);
        const getRequest = objectStore.get(contentId);

        getRequest.onsuccess = () => {
          const content = getRequest.result;
          if (!content || content.type !== 'content') {
            reject(new Error('Content not found'));
            return;
          }

          content.projectId = targetProjectId;
          content.modified = Date.now();

          const putRequest = objectStore.put(content);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(new Error('Failed to move content'));
        };

        getRequest.onerror = () => {
          reject(new Error('Failed to get content'));
        };
      });
    } catch (error) {
      console.error('Error moving content to project:', error);
      throw error;
    }
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DBUtils;
}
