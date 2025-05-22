const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();
const axios = require('axios');

const app = express();
const port = process.env.PORT || 5001;

// Configure Cloudinary
cloudinary.config({
  cloud_name: 'dxn80wdoa',
  api_key: process.env.CLOUDINARY_API_KEY || 'your_cloudinary_api_key_here',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'your_cloudinary_api_secret_here'
});

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// for testing temporty direcoty
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Helper function to create a temp file
const createTempFile = async (buffer, extension) => {
  const tempFileName = path.join(tempDir, `${uuidv4()}.${extension}`);
  await fs.promises.writeFile(tempFileName, buffer);
  return tempFileName;
};

// Helper function to create a temp file from URL
const createTempFileFromUrl = async (url, extension) => {
  const tempFileName = path.join(tempDir, `${uuidv4()}.${extension}`);
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  await fs.promises.writeFile(tempFileName, response.data);
  return tempFileName;
};

// Helper function to delete temp files
const deleteTempFile = async (filePath) => {
  try {
    if (filePath && await fs.promises.access(filePath).then(() => true).catch(() => false)) {
      await fs.promises.unlink(filePath);
    }
  } catch (error) {
    console.error(`Failed to delete temp file: ${filePath}`, error);
  }
};

// Helper function to get video duration
const getVideoDuration = async (filePath) => {
  return new Promise((resolve, reject) => {
    const ffprobeProcess = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ]);
    
    let durationOutput = '';
    ffprobeProcess.stdout.on('data', (data) => {
      durationOutput += data.toString();
    });
    ffprobeProcess.stderr.on('data', (data) => { // Log stderr for debugging
      console.error(`ffprobe stderr (getVideoDuration ${filePath}): ${data}`);
    });
    
    ffprobeProcess.on('close', (code) => {
      if (code !== 0) {
        console.warn(`FFprobe for duration of ${filePath} exited with code ${code}. Output: ${durationOutput}`);
        reject(new Error(`FFprobe failed for ${filePath} (code ${code})`));
      } else {
        const duration = parseFloat(durationOutput.trim());
        if (isNaN(duration)) {
            reject(new Error(`Could not parse duration for ${filePath}. Output: ${durationOutput}`));
        } else {
            resolve(duration);
        }
      }
    });
    ffprobeProcess.on('error', (err) => {
        reject(new Error(`Failed to start ffprobe for ${filePath}: ${err.message}`));
    });
  });
};

// Helper function to check if a video file has an audio stream
const hasAudioStream = async (filePath) => {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a:0', // Check for the first audio stream
      '-show_entries', 'stream=codec_name', // We just need to know if it exists
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ]);
    let output = '';
    ffprobe.stdout.on('data', (data) => output += data.toString().trim());
    ffprobe.stderr.on('data', (data) => console.error(`ffprobe stderr (hasAudioStream ${filePath}): ${data}`));
    ffprobe.on('close', code => {
      // If output is non-empty, an audio stream was found.
      // ffprobe might return non-zero if no stream of the specified type is found.
      // A non-empty output means a stream was described.
      if (output !== '') {
        resolve(true);
      } else {
        resolve(false); // No output means no such audio stream found
      }
    });
    ffprobe.on('error', err => {
      console.error(`Failed to start ffprobe for hasAudioStream ${filePath}: ${err.message}`);
      reject(err);
    });
  });
};

// Process video endpoint
app.post('/api/ugc/process-video', upload.fields([
  { name: 'uploadedVideo', maxCount: 1 },
  { name: 'uploadedAudio', maxCount: 1 }
]), async (req, res) => {
  let ffmpeg = null;
  let tempFiles = [];
  
  try {
    const { hookText, hookPosition, cloudinaryVideoUrl, cloudinaryAudioUrl, demoVideoUrl } = req.body;
    console.log('Processing video with options:', { 
      hookText, 
      hookPosition, 
      hasCloudinaryVideo: !!cloudinaryVideoUrl,
      hasCloudinaryAudio: !!cloudinaryAudioUrl,
      hasDemoVideo: !!demoVideoUrl,
      hasUploadedVideo: !!(req.files && req.files.uploadedVideo),
      hasUploadedAudio: !!(req.files && req.files.uploadedAudio)
    });
    
    const fontFile = path.join(__dirname, 'assets', 'fonts', 'Arial.ttf');

    // Input files - using temp files instead of pipes for more reliability
    let videoFilePath = null;
    let audioFilePath = null;
    let demoFilePath = null;
    let intermediateFilePath = null;
    let outputFilePath = path.join(tempDir, `${uuidv4()}.mp4`);
    tempFiles.push(outputFilePath);

    // Process video input
    if (req.files && req.files.uploadedVideo) {
      videoFilePath = await createTempFile(req.files.uploadedVideo[0].buffer, 'mp4');
      tempFiles.push(videoFilePath);
    } else if (cloudinaryVideoUrl) {
      videoFilePath = await createTempFileFromUrl(cloudinaryVideoUrl, 'mp4');
      tempFiles.push(videoFilePath);
    } else {
      return res.status(400).json({ status: 'error', message: 'No video source provided' });
    }

    // Process audio input
    if (req.files && req.files.uploadedAudio) {
      audioFilePath = await createTempFile(req.files.uploadedAudio[0].buffer, 'mp3');
      tempFiles.push(audioFilePath);
      console.log('Using uploaded audio file');
    } else if (cloudinaryAudioUrl) {
      audioFilePath = await createTempFileFromUrl(cloudinaryAudioUrl, 'mp3');
      tempFiles.push(audioFilePath);
      console.log('Using Cloudinary audio URL:', cloudinaryAudioUrl);
    } else {
      console.log('No audio source provided, proceeding with video only');
    }

    // Process demo video if provided
    if (demoVideoUrl) {
      demoFilePath = await createTempFileFromUrl(demoVideoUrl, 'mp4');
      tempFiles.push(demoFilePath);
      console.log('Using demo video URL:', demoVideoUrl);
    }

    let textY;
    switch (hookPosition) {
      case 'top':
        textY = '(h/10)';
        break;
      case 'bottom':
        textY = '(h*9/10)';
        break;
      case 'middle':
      default:
        textY = '(h/2)';
        break;
    }

    // Create a complex filtergraph for text with wrapping and proper sizing
    const escapedText = hookText.replace(/'/g, "'\\''");
    
    // Create a filter to handle long text
    // Using line wrapping at approximately 27 characters (reduced from 35)
    const lineLength = Math.min(27, escapedText.length);
    let textCommands = [];
    
    if (escapedText.length <= lineLength) {
      textCommands.push(`drawtext=fontfile=${fontFile}:text='${escapedText}':fontcolor=white:fontsize=min(32\\,w/20):borderw=2:bordercolor=black:box=0:x=(w-text_w)/2:y=${textY}`);
    } else {
      // Break into multiple lines if text is long
      const words = escapedText.split(' ');
      let lines = [];
      let currentLine = '';
      
      for (const word of words) {
        if ((currentLine + word).length > lineLength && currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine += (currentLine.length > 0 ? ' ' : '') + word;
        }
      }
      
      if (currentLine.length > 0) {
        lines.push(currentLine);
      }
      
      // Calculate the line height to position the text block properly
      const lineHeight = 'min(32\\,w/20)*1.5'; // Increased spacing
      const totalHeight = `${lines.length}*${lineHeight}`;
      
      // Calculate starting Y position based on the total text block height
      let startY;
      switch (hookPosition) {
        case 'top':
          startY = `(h/8)`;
          break;
        case 'bottom':
          startY = `(h*7/8)-(${totalHeight})`;
          break;
        case 'middle':
        default:
          startY = `(h-${totalHeight})/2`;
          break;
      }
      
      // Create a filter for each line
      lines.forEach((line, index) => {
        textCommands.push(`drawtext=fontfile=${fontFile}:text='${line}':fontcolor=white:fontsize=min(32\\,w/20):borderw=2:bordercolor=black:box=0:x=(w-text_w)/2:y=(${startY}+${index}*${lineHeight})`);
      });
    }
    
    // Join all text commands with commas for the filter
    const textStyle = textCommands.join(',');

    // Get video duration
    const ffprobeProcess = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoFilePath
    ]);
    
    let durationOutput = '';
    ffprobeProcess.stdout.on('data', (data) => {
      durationOutput += data.toString();
    });
    
    const videoDuration = await new Promise((resolve) => {
      ffprobeProcess.on('close', (code) => {
        if (code !== 0) {
          console.warn('FFprobe process exited with code', code);
          resolve(null);
        } else {
          resolve(parseFloat(durationOutput.trim()));
        }
      });
    });

    // First, create the video with text overlay and audio (if available)
    let ffmpegArgs = [];
    
    if (audioFilePath) {
      // With audio - use file-based approach and trim audio if needed
      if (videoDuration) {
        ffmpegArgs = [
          '-i', videoFilePath,
          '-i', audioFilePath,
          '-filter_complex', `[1:a]atrim=0:${videoDuration},asetpts=PTS-STARTPTS[a]`,
          '-map', '0:v',
          '-map', '[a]',
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-vf', `scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1:1,${textStyle}`,
          '-y',
          outputFilePath
        ];
      } else {
        ffmpegArgs = [
          '-i', videoFilePath,
          '-i', audioFilePath,
          '-map', '0:v',
          '-map', '1:a',
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-shortest',
          '-vf', `scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1:1,${textStyle}`,
          '-y',
          outputFilePath
        ];
      }
    } else {
      // No audio, just video
      ffmpegArgs = [
        '-i', videoFilePath,
        '-c:v', 'libx264',
        '-preset', 'medium', 
        '-crf', '23',
        '-c:a', 'copy',
        '-vf', `scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1:1,${textStyle}`,
        '-y',
        outputFilePath
      ];
    }

    // Execute FFmpeg for first stage
    ffmpeg = spawn('ffmpeg', ffmpegArgs);

    let ffmpegLogs = '';
    ffmpeg.stderr.on('data', (data) => {
      ffmpegLogs += data.toString();
      console.log(`FFmpeg: ${data}`);
    });

    const ffmpegExitCode = await new Promise((resolve) => {
      ffmpeg.on('close', (code) => {
        resolve(code);
      });
    });

    if (ffmpegExitCode !== 0) {
      console.error('FFmpeg process exited with code', ffmpegExitCode);
      console.error(ffmpegLogs);
      throw new Error(`FFmpeg exited with code ${ffmpegExitCode}`);
    }

    // If we have a demo video, concatenate it with the generated video
    if (demoFilePath) {
      intermediateFilePath = path.join(tempDir, `${uuidv4()}_concat.mp4`);
      tempFiles.push(intermediateFilePath);
      
      let durationOutputVideo = 0; // Duration of the video content in outputFilePath (main video part)
      let durationDemoVideo = 0;

      try {
        console.log(`Getting duration for main video part: ${outputFilePath}`);
        durationOutputVideo = await getVideoDuration(outputFilePath);
        console.log(`Duration of main video part: ${durationOutputVideo}`);
        
        console.log(`Getting duration for demo video: ${demoFilePath}`);
        durationDemoVideo = await getVideoDuration(demoFilePath);
        console.log(`Duration of demo video: ${durationDemoVideo}`);
      } catch (err) {
        console.error("Failed to get video properties for concatenation:", err);
        await Promise.all(tempFiles.map(file => deleteTempFile(file)));
        throw new Error(`Failed to get video properties for concatenation: ${err.message}`);
      }
      
      const totalDuration = durationOutputVideo + durationDemoVideo;
      console.log(`Total calculated duration for concatenation: ${totalDuration}`);

      // --- Start of new concatenation input and filter setup ---
      const ffmpegInputArgs = ['-i', outputFilePath, '-i', demoFilePath];

      let videoProcessingFilter = 
        `[0:v:0]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1:1[v0scaled];` +
        `[1:v:0]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1:1,settb=AVTB,fps=30[v1scaled];` +
        `[v0scaled][v1scaled]concat=n=2:v=1:a=0,fps=30,format=yuv420p[outv]`;

      let audioProcessingFilter = "";
      const ffmpegMapArgs = ['-map', '[outv]']; // Default map for video output
      const ffmpegCodecVideoArgs = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '23'];
      let ffmpegCodecAudioArgs = [];

      if (audioFilePath) { // audioFilePath contains the path to the original full-length background audio
        ffmpegInputArgs.push('-i', audioFilePath); // Add original audio as input (will be input 2)
        // Use audio from input 2 (original audio), trim to totalDuration, reset PTS
        audioProcessingFilter = `[2:a:0]atrim=0:${totalDuration},asetpts=PTS-STARTPTS[outa]`;
        ffmpegMapArgs.push('-map', '[outa]'); // Map the processed audio stream
        ffmpegCodecAudioArgs = ['-c:a', 'aac', '-b:a', '192k'];
        console.log('Concatenation: Using original audio source, trimmed to total video duration.');
      } else {
        console.log('Concatenation: No original background audio file provided. The concatenated video might not have continuous background audio.');
        // If outputFilePath (input 0) had its own inherent audio, and no audioFilePath was given,
        // that audio would only play for the duration of outputFilePath and then stop, as concat is a=0.
        // This behavior is acceptable if no global background audio is specified.
      }
      
      const filterComplex = videoProcessingFilter + (audioProcessingFilter ? ";" + audioProcessingFilter : "");
      // --- End of new concatenation input and filter setup ---
      
      // Create a new FFmpeg process to concatenate videos
      const concatArgs = [
        ...ffmpegInputArgs, // Contains -i for main video, demo video, and optionally original audio
        '-filter_complex', filterComplex,
        ...ffmpegMapArgs,
        ...ffmpegCodecVideoArgs,
        ...ffmpegCodecAudioArgs,
        '-y',
        intermediateFilePath
      ];
      
      console.log('Concatenating videos with args:', concatArgs.join(' '));
      
      const ffmpegConcat = spawn('ffmpeg', concatArgs);
      
      let concatLogs = '';
      ffmpegConcat.stderr.on('data', (data) => {
        concatLogs += data.toString();
        console.log(`FFmpeg Concat: ${data}`);
      });
      
      const concatExitCode = await new Promise((resolve) => {
        ffmpegConcat.on('close', (code) => {
          resolve(code);
        });
      });
      
      if (concatExitCode !== 0) {
        console.error('FFmpeg concat process exited with code', concatExitCode);
        console.error(concatLogs);
        throw new Error(`FFmpeg concat exited with code ${concatExitCode}`);
      }
      
      // Use the concatenated video as the final output
      const finalOutput = intermediateFilePath;
      
      // Upload the processed video to Cloudinary from the file
      const cloudinaryResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload(finalOutput, 
          { 
            resource_type: 'video', 
            folder: 'ugc',
            chunk_size: 6000000 // 6MB chunks
          }, 
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          }
        );
      });
      
      // Clean up temp files
      await Promise.all(tempFiles.map(file => deleteTempFile(file)));
      
      // Return the Cloudinary URL
      res.json({ status: 'success', videoUrl: cloudinaryResult.secure_url });
    } else {
      // No demo video, just upload the processed video to Cloudinary
      const cloudinaryResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload(outputFilePath, 
          { 
            resource_type: 'video', 
            folder: 'ugc',
            chunk_size: 6000000 // 6MB chunks
          }, 
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          }
        );
      });

      // Clean up temp files
      await Promise.all(tempFiles.map(file => deleteTempFile(file)));
      
      // Return the Cloudinary URL
      res.json({ status: 'success', videoUrl: cloudinaryResult.secure_url });
    }
    
  } catch (error) {
    console.error('Server error:', error);
    
    // Clean up resources
    if (ffmpeg && !ffmpeg.killed) {
      try { ffmpeg.kill('SIGKILL'); } catch (e) {}
    }
    
    // Clean up temp files
    await Promise.all(tempFiles.map(file => deleteTempFile(file)));
    
    if (!res.headersSent) {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 