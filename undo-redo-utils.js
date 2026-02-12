/**
 * Shared Undo/Redo Utilities
 * Used by both popup.js and background.js
 */

const UndoRedoUtils = {
  // Storage key for undo/redo state
  UNDO_REDO_KEY: 'undoRedoHistory',

  // Maximum actions to store
  MAX_UNDO_HISTORY: 50,

  /**
   * Convert blob to base64 for storage
   */
  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },

  /**
   * Convert base64 back to blob
   */
  base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64.split(',')[1]);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  },

  /**
   * Serialize content for storage (convert blobs to base64)
   */
  async serializeContent(content) {
    if (!content) return null;

    const serialized = { ...content };
    if (content.media && content.media.length > 0) {
      serialized.media = await Promise.all(
        content.media.map(async (m) => {
          // Handle table type (no blob, has data property)
          if (m.type === 'table') {
            return { ...m };
          }
          // Handle blob-based media
          const base64 = m.blob ? await this.blobToBase64(m.blob) : null;
          return {
            ...m,
            blob: undefined,
            base64Data: base64
          };
        })
      );
    }
    return serialized;
  },

  /**
   * Deserialize content from storage (convert base64 back to blobs)
   */
  deserializeContent(serialized) {
    if (!serialized) return null;

    const content = { ...serialized };
    if (serialized.media && serialized.media.length > 0) {
      content.media = serialized.media.map((m) => {
        // Handle table type (no blob)
        if (m.type === 'table') {
          return { ...m };
        }
        // Handle blob-based media
        const blob = m.base64Data ? this.base64ToBlob(m.base64Data, m.mimeType) : null;
        return {
          ...m,
          base64Data: undefined,
          blob
        };
      });
    }
    return content;
  },

  /**
   * Generate unique action ID
   */
  generateActionId() {
    return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Load all project states from chrome.storage.session
   */
  async loadAllStates() {
    try {
      const result = await chrome.storage.session.get(this.UNDO_REDO_KEY);
      return result[this.UNDO_REDO_KEY] || {};
    } catch (error) {
      console.error('Error loading all undo/redo states:', error);
      return {};
    }
  },

  /**
   * Load undo/redo state for a specific project
   * @param {string} projectId - Project ID
   * @returns {Promise<{undoStack: Array, redoStack: Array}>}
   */
  async loadState(projectId) {
    try {
      if (!projectId) {
        console.warn('loadState called without projectId');
        return { undoStack: [], redoStack: [] };
      }

      const allStates = await this.loadAllStates();
      if (allStates[projectId]) {
        return {
          undoStack: allStates[projectId].undoStack || [],
          redoStack: allStates[projectId].redoStack || []
        };
      }
      return { undoStack: [], redoStack: [] };
    } catch (error) {
      console.error('Error loading undo/redo state for project:', projectId, error);
      return { undoStack: [], redoStack: [] };
    }
  },

  /**
   * Save undo/redo state for a specific project
   * @param {string} projectId - Project ID
   * @param {Array} undoStack - Undo stack
   * @param {Array} redoStack - Redo stack
   */
  async saveState(projectId, undoStack, redoStack) {
    try {
      if (!projectId) {
        console.warn('saveState called without projectId');
        return;
      }

      const allStates = await this.loadAllStates();
      allStates[projectId] = { undoStack, redoStack };

      await chrome.storage.session.set({
        [this.UNDO_REDO_KEY]: allStates
      });
    } catch (error) {
      console.error('Error saving undo/redo state for project:', projectId, error);
    }
  },

  /**
   * Clear undo/redo history for a specific project
   * @param {string} projectId - Project ID to clear
   */
  async clearProjectHistory(projectId) {
    try {
      if (!projectId) return;

      const allStates = await this.loadAllStates();
      delete allStates[projectId];

      await chrome.storage.session.set({
        [this.UNDO_REDO_KEY]: allStates
      });
    } catch (error) {
      console.error('Error clearing project history:', projectId, error);
    }
  },

  /**
   * Record a new undo action (atomic operation)
   * This is the key function that background.js uses
   * @param {string} projectId - Project ID
   * @param {string} type - Action type (create, update, delete)
   * @param {string} contentId - Content ID
   * @param {object} beforeSnapshot - State before action
   * @param {object} afterSnapshot - State after action
   * @returns {Promise<string>} Action ID
   */
  async recordAction(projectId, type, contentId, beforeSnapshot, afterSnapshot) {
    if (!projectId) {
      console.warn('recordAction called without projectId');
      return null;
    }

    // Load current state for this project
    const state = await this.loadState(projectId);

    // Serialize snapshots
    const action = {
      id: this.generateActionId(),
      type,
      contentId,
      timestamp: Date.now(),
      beforeSnapshot: await this.serializeContent(beforeSnapshot),
      afterSnapshot: await this.serializeContent(afterSnapshot)
    };

    // Add to undo stack
    state.undoStack.push(action);

    // Limit history size
    if (state.undoStack.length > this.MAX_UNDO_HISTORY) {
      state.undoStack.shift();
    }

    // Clear redo stack on new action
    state.redoStack = [];

    // Save state for this project
    await this.saveState(projectId, state.undoStack, state.redoStack);

    return action.id;
  },

  /**
   * Record a reorder action for undo/redo
   * @param {string} projectId - Project ID
   * @param {Array<{key: string, order: number}>} beforeOrder - Order before drag
   * @param {Array<{key: string, order: number}>} afterOrder - Order after drag
   * @returns {Promise<string>} Action ID
   */
  async recordReorderAction(projectId, beforeOrder, afterOrder) {
    if (!projectId) {
      console.warn('recordReorderAction called without projectId');
      return null;
    }

    const state = await this.loadState(projectId);
    const action = {
      id: this.generateActionId(),
      type: 'reorder',
      timestamp: Date.now(),
      beforeOrder,
      afterOrder
    };
    state.undoStack.push(action);
    if (state.undoStack.length > this.MAX_UNDO_HISTORY) {
      state.undoStack.shift();
    }
    state.redoStack = [];
    await this.saveState(projectId, state.undoStack, state.redoStack);
    return action.id;
  }
};
