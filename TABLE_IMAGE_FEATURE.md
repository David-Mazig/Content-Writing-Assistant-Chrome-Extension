# Table Image Capture Feature

## Overview
Enhanced the table saving feature to automatically capture and store images embedded within tables.

## Implementation Summary

### Files Modified

1. **content-script.js** (3 changes)
   - Enhanced `extractTableData()` to detect and collect `<img>` elements
   - Added image fetching logic to table save handler
   - Updated preview to show image count

2. **background.js** (1 change)
   - Updated table save handler to process and store embedded images

## How It Works

### Step 1: Image Detection (content-script.js)
When a user hovers over a table, `extractTableData()` now:
- Scans the table for all `<img>` elements
- Filters out tiny images (< 30x30 pixels) to exclude icons and UI elements
- Returns image elements along with table data

### Step 2: Image Fetching (content-script.js)
When the user clicks "Save":
- Each detected image is fetched using the existing `fetchImageData()` function
- Images are fetched sequentially with progress updates shown in the button
- Failed image fetches are logged but don't block the save operation
- All successfully fetched images are sent to background.js

### Step 3: Storage (background.js)
The background worker:
- Receives the table data and image data array
- Converts base64-encoded image data back to Blobs
- Creates a media array containing both the table and all images
- Saves everything together in one content item
- Adds a note to the text indicating how many images were captured

## Key Features

- **Automatic Detection**: Images are detected automatically, no user action needed
- **Progress Feedback**: Shows "Fetching images (X/Y)..." during download
- **Error Resilience**: Individual image failures don't prevent table save
- **Smart Filtering**: Excludes tiny images (icons, spacers) using 30x30px threshold
- **CORS Handling**: Uses existing CORS bypass via background worker
- **Organized Storage**: Images stored alongside table in same content item

## User Experience

1. User hovers over a table with embedded images
2. Popover shows: "Table: X rows, Y images"
3. User clicks "Save"
4. Button shows progress: "Fetching images (1/3)..." → "Saving..."
5. Content saved with table + all images together

## Technical Details

### Image Size Threshold
- Minimum: 30x30 pixels
- Purpose: Filter out UI elements, icons, spacers, buttons
- Lower than standalone image threshold (50x50) because table images tend to be smaller

### Data Flow
```
Table Element
  └─> extractTableData()
        └─> Returns: {headers, rows, images[]}
              └─> fetchImageData() for each image
                    └─> Send to background.js
                          └─> Convert to Blobs
                                └─> Save in media array with table
```

### Error Handling
- Network failures: Logged, other images continue
- CORS issues: Handled by background worker fetch
- Invalid images: Skipped, save continues
- Extension reload: User prompted to refresh page

## Testing Checklist

- [ ] Table with 1 image saves correctly
- [ ] Table with multiple images saves all images
- [ ] Table with no images saves normally
- [ ] Table with mix of large and small images filters correctly
- [ ] Progress indicator updates during fetch
- [ ] CORS-protected images are handled via background worker
- [ ] Failed image fetches don't block table save
- [ ] Saved content shows table + images in popup
- [ ] Preview shows correct image count before save

## Future Enhancements

- Parallel image fetching (currently sequential)
- Image deduplication (if same image appears multiple times)
- Option to exclude images from table save
- Thumbnail generation for table preview
