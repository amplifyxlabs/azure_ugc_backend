# ShortsGency Backend

Backend service for ShortsGency UGC video generator.

## Prerequisites

- Node.js (v14+)
- FFmpeg (must be installed and available in PATH)
- Cloudinary account

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the root directory with the following variables:
   ```
   PORT=5000
   CLOUDINARY_API_KEY=your_cloudinary_api_key
   CLOUDINARY_API_SECRET=your_cloudinary_api_secret
   ```

3. Create the required directories:
   ```bash
   mkdir -p uploads temp assets/fonts
   ```

4. Add a font file to `assets/fonts/Arial.ttf` (or update the path in server.js)

## Running the server

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

### POST /api/ugc/process-video

Process a video with hook text and optional audio replacement.

**Request:**
- Content-Type: multipart/form-data
- Body:
  - `uploadedVideo` (file, optional): User-uploaded video
  - `uploadedAudio` (file, optional): User-uploaded audio
  - `hookText` (string): Text to overlay on video
  - `hookPosition` (string): "top", "middle", or "bottom"
  - `cloudinaryVideoUrl` (string, optional): URL to Cloudinary video if not uploading
  - `cloudinaryAudioUrl` (string, optional): URL to Cloudinary audio if not uploading

**Response:**
```json
{
  "status": "success",
  "videoUrl": "https://res.cloudinary.com/xxx/video/upload/v1234/ugc/abc123.mp4",
  "message": "Video processed successfully"
}
``` 