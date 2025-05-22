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

Processes a video by adding hook text, optional background audio, and optionally concatenating a demo video. The resulting video is uploaded to Cloudinary.

**Endpoint:** `/api/ugc/process-video`
**Method:** `POST`
**Content-Type:** `multipart/form-data`

**Request Body Parameters:**

*   `uploadedVideo` (file, optional): The video file to process. Use this if uploading a video directly. Either `uploadedVideo` or `cloudinaryVideoUrl` is required.
*   `uploadedAudio` (file, optional): The audio file to use as background audio. Use this if uploading audio directly. Either `uploadedAudio` or `cloudinaryAudioUrl` can be provided, or neither if no background audio is desired.
*   `hookText` (string, required): The text string to overlay on the video.
*   `hookPosition` (string, required): The vertical position for the `hookText`. Accepted values are "top", "middle", or "bottom".
*   `cloudinaryVideoUrl` (string, optional): A Cloudinary URL to the video to process. Use this if the video is already on Cloudinary. Either `uploadedVideo` or `cloudinaryVideoUrl` is required.
*   `cloudinaryAudioUrl` (string, optional): A Cloudinary URL to the audio to use as background audio. Use this if the audio is already on Cloudinary. Either `uploadedAudio` or `cloudinaryAudioUrl` can be provided, or neither.
*   `demoVideoUrl` (string, optional): A URL to a demo video that will be concatenated after the processed video.

**Response:**

Returns a JSON object upon successful processing and upload.

```json
{
  "status": "success",
  "videoUrl": "https://res.cloudinary.com/your_cloud_name/video/upload/vTIMESTAMP/ugc/GENERATED_ID.mp4"
}
```

In case of an error during processing, an error response is returned:

```json
{
  "status": "error",
  "message": "Detailed error message"
}
``` 