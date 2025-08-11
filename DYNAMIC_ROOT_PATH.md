# Dynamic Root Path Feature

## Overview

The OneDrive Music Player now supports dynamic root paths, allowing users to select their own music library root directory instead of being limited to the hardcoded "Music/Music Library/Main Library" path.

## Features

### 1. User-Configurable Root Path

- Users can set their own music library root path through the UI
- The root path is stored per-user and persists across sessions
- **Default: OneDrive root (/) when no custom path is set** - no more hardcoded paths

### 2. Root Path Selector Component

- New `RootPathSelector` component with a modal interface
- Accessible via a "Root Path" button in the File Explorer header
- Input validation to prevent invalid paths
- Real-time preview of current vs. new path
- **"Use Current Path as Root" button** - Quickly set current explorer location as root path

### 3. Automatic Cache Management

- When the root path changes, all cached data is automatically cleared
- This ensures that music files from the old path don't interfere with the new path
- Forces a fresh scan of the new music library location

### 4. Seamless Integration

- File Explorer automatically uses the user's selected root path
- All API endpoints respect the user's root path setting
- Scan functionality works with any valid OneDrive path

## Technical Implementation

### New API Endpoints

- `GET /api/user/settings` - Retrieve user settings
- `POST /api/user/settings` - Set user settings (including root path)
- `PATCH /api/user/settings` - Update user settings

### Storage Changes

- New user settings storage system in `src/lib/storage.ts`
- User-specific cache directories with settings persistence
- Automatic cache clearing when root path changes

### Component Updates

- `FileExplorer` - Now uses dynamic root paths and includes root path selector
- `TrackList` - Handles root path changes and refreshes cache
- `RootPathSelector` - New component for managing root paths

### API Endpoint Logic

- **Empty path (`""`)**: Uses `https://graph.microsoft.com/v1.0/me/drive/root/children` (OneDrive root)
- **Non-empty paths**: Uses `https://graph.microsoft.com/v1.0/me/drive/root:/{path}:/children` (subfolder access)
- This ensures proper Microsoft Graph API usage for both root and subfolder scenarios

## Usage

### Setting a Custom Root Path

1. Click the "Root Path" button in the File Explorer header
2. Enter your desired music library path (e.g., "Music", "Documents/Music", "OneDrive/Music")
   - **Quick option**: Use the "Use Current Path as Root" button to set your current location as the root
3. Click "Save Path"
4. The cache will be cleared and the new path will be used

### Valid Path Examples

- **Empty string** - OneDrive root (/) - scans entire OneDrive for music files
- `Music` - Simple music folder
- `Documents/Music` - Music folder inside Documents
- `OneDrive/Music` - Music folder inside OneDrive
- `Music Library` - Alternative music library folder

### Path Validation

- Paths cannot be empty
- Paths cannot contain `..` (parent directory traversal)
- Paths are automatically trimmed of leading/trailing whitespace

## Benefits

1. **Flexibility**: Users can organize their music in any OneDrive folder structure
2. **Personalization**: Each user can have their own music library organization
3. **Compatibility**: Works with existing OneDrive folder structures
4. **Performance**: Automatic cache management ensures optimal performance
5. **User Experience**: Seamless switching between different music library locations

## Migration

**Breaking Change**: The default root path has changed from "Music/Music Library/Main Library" to the OneDrive root (empty string). This means:

- New users will scan their entire OneDrive by default
- Existing users with custom paths are unaffected
- Users can still set specific folders as their music root if desired

## Error Handling

- Invalid paths are rejected with clear error messages
- Network failures during path changes are handled gracefully
- Cache clearing failures don't prevent path updates
- Fallback to default path if user settings cannot be loaded
