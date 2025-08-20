# OneDrive Music Player

A modern web application that allows you to play music files stored in your OneDrive account. Built with Next.js, TypeScript, and HeroUI.

## Features

- **File Explorer Interface**: Navigate through your OneDrive music folders like a file explorer
- **Audio Playback**: Play various audio formats (MP3, WAV, FLAC, M4A, AAC, OGG)
- **Folder Navigation**: Click on folders to explore their contents
- **Breadcrumb Navigation**: Easy navigation with breadcrumb trail
- **Responsive Design**: Works on desktop and mobile devices
- **Dark Mode Support**: Built-in dark/light theme support

## How It Works

The application uses the Microsoft Graph API to:

1. **Browse Folders**: Uses the `/me/drive/root:/path:/children` endpoint to list folder contents
2. **Navigate Structure**: Allows you to click into folders and navigate back
3. **Play Audio**: Streams audio files directly from OneDrive for playback
4. **Authentication**: Uses NextAuth with Azure AD for secure access to your OneDrive

## File Explorer Features

- **Folder View**: See all folders and audio files in the current directory
- **Audio File Detection**: Automatically identifies supported audio formats
- **Play Controls**: Click on audio files to play them
- **Navigation**: Use breadcrumbs or back button to navigate
- **Home Button**: Quick return to the root music folder

## Supported Audio Formats

- MP3
- WAV
- FLAC
- M4A
- AAC
- OGG

## Getting Started

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd onedrive-music-player
   ```

2. **Install dependencies**

   ```bash
   yarn install
   ```

3. **Set up environment variables**
   Create a `.env.local` file with your Microsoft Azure app credentials:

   ```
   MICROSOFT_CLIENT_ID=your_client_id
   MICROSOFT_CLIENT_SECRET=your_client_secret
   MICROSOFT_TENANT_ID=your_tenant_id
   ```

4. **Run the development server**

   ```bash
   yarn dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:3000`

## Usage

1. **Sign In**: Click "Sign in with Microsoft" to authenticate with your OneDrive account
2. **Browse Music**: Use the file explorer to navigate through your music folders
3. **Play Music**: Click on any audio file to start playback
4. **Navigate**: Click on folders to explore their contents, use breadcrumbs to go back
5. **Control Playback**: Use the sticky player at the bottom to control audio playback

## Architecture

- **Frontend**: Next.js 15 with React 19, TypeScript, and HeroUI
- **Backend**: Next.js API routes for Microsoft Graph API integration
- **Authentication**: NextAuth.js (Azure AD provider)
- **Styling**: Tailwind CSS with HeroUI components
- **Audio**: HTML5 Audio API with streaming support

## API Endpoints

- `GET /api/music?path=<path>` - Get contents of a specific folder
- `GET /api/music/stream?fileId=<id>` - Stream audio file content
- NextAuth routes under `/api/auth/*` (handled internally by NextAuth)

## Recent Changes

- **Replaced search API with children API**: Now uses `/me/drive/root:/path:/children` instead of search
- **Added FileExplorer component**: New explorer-like interface for browsing folders
- **Folder navigation**: Click on folders to explore contents
- **Breadcrumb navigation**: Easy path navigation with clickable breadcrumbs
- **Improved UX**: Better visual hierarchy and navigation controls

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.
