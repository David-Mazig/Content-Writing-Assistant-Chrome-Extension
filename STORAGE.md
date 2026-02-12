# Storage Architecture

## Overview

**Unified IndexedDB storage** - content + media stored together atomically. Automatic Chrome sandbox isolation, no encryption at rest (Chrome profile protection), CSP prevents XSS.

## Database Schema

- **Database:** `ContentWritingAssistant` (v2)
- **Object Store:** `items`
- **Key Path:** `key` (e.g., "content:123")
- **Indexes:** `type`, `created`, `modified`

## Data Structure

```javascript
{
  "key": "content:123",
  "type": "content",
  "text": "User content...",
  "links": ["https://example.com"],
  "media": [
    {
      "id": "media:456",
      "type": "image|audio|video|table",
      "mimeType": "image/png",
      "blob": Blob,
      "size": 245678,
      "name": "photo.png"
    }
  ],
  "created": 1234567890,
  "modified": 1234567890,
  "order": 0  // Optional: drag-drop ordering
}
```

## Supported Media Types

**Images:** PNG, JPEG, GIF, WebP, SVG
**Audio:** MP3, WAV, OGG, WebM
**Video:** MP4, WebM, OGG

MIME validation enforced in `DBUtils.validateMimeType()`.

## API Reference

See `db-utils.js` for complete implementation.

### Core Operations

**Create/Update:**
```javascript
const contentId = await DBUtils.saveContent(null, {
  text: "My content",
  links: ["https://example.com"],
  media: [
    {
      type: "image",
      mimeType: "image/png",
      blob: imageBlob,
      name: "photo.png"
    }
  ]
});
```

**Read:**
```javascript
const content = await DBUtils.getContent("content:123");
const allContent = await DBUtils.getAllContent(); // Sorted by order/modified
```

**Update:**
```javascript
await DBUtils.updateContentText(contentId, newText);
await DBUtils.addLink(contentId, url);
await DBUtils.addMediaToContent(contentId, blob, metadata);
await DBUtils.updateContentOrder([{key: id1, order: 0}, {key: id2, order: 1}]);
```

**Delete:**
```javascript
await DBUtils.deleteContent(contentId); // Auto-deletes embedded media
await DBUtils.clearAllContent(); // Nuclear option
```

**Monitoring:**
```javascript
const quota = await DBUtils.getStorageEstimate();
console.log(`Using ${quota.usage} of ${quota.quota} bytes`);
```

## Security Model

**Isolation:**
- Automatic per-extension namespace (Chrome enforces)
- Other extensions cannot access this storage
- Web pages cannot access extension storage

**Data Protection:**
- No encryption at rest (relies on Chrome profile protection)
- CSP prevents XSS: `script-src 'self'`
- URL validation: HTTP/HTTPS only
- MIME type validation: whitelist approach
- **No sensitive data** should be stored (passwords, API keys)

**Permissions:**
- `storage` - Extension storage APIs (no user warning)
- `unlimitedStorage` - Removes IndexedDB quota limits (no user warning)

## Migration

Database auto-migrates v1 → v2 (dual-storage → unified storage). Preserves existing data during upgrade.
