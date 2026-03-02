import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateImageForPost } from './image-generator.agent';
import { agentLog } from './agent-logger';

// Set ffmpeg binary path
ffmpeg.setFfmpegPath(ffmpegStatic as string);

// Pool of royalty-free music URLs (Pixabay direct download links - short clips ~15-30s)
const MUSIC_POOL = [
  'https://cdn.pixabay.com/audio/2024/11/29/audio_301e1ef043.mp3', // upbeat corporate
  'https://cdn.pixabay.com/audio/2024/09/10/audio_6e80c36c05.mp3', // inspiring piano
  'https://cdn.pixabay.com/audio/2024/10/08/audio_43fa84c3a3.mp3', // motivational
  'https://cdn.pixabay.com/audio/2024/08/14/audio_5765af0019.mp3', // chill lofi
  'https://cdn.pixabay.com/audio/2024/06/11/audio_2e5ca9b02a.mp3', // positive energy
  'https://cdn.pixabay.com/audio/2024/05/16/audio_166b844233.mp3', // soft ambient
  'https://cdn.pixabay.com/audio/2024/03/21/audio_78a8df8846.mp3', // happy upbeat
  'https://cdn.pixabay.com/audio/2024/02/07/audio_79a3b8de4c.mp3', // energetic
  'https://cdn.pixabay.com/audio/2024/01/18/audio_4ade22ccb7.mp3', // calm background
  'https://cdn.pixabay.com/audio/2023/12/10/audio_6c3ab2fe42.mp3', // gentle acoustic
];

// Cache directory for downloaded music
const CACHE_DIR = path.join(os.tmpdir(), 'video-gen-cache');

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await axios.get(url, { responseType: 'stream', timeout: 30000 });
  const writer = fs.createWriteStream(destPath);
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function downloadImage(imageUrl: string): Promise<string> {
  ensureCacheDir();
  const imgPath = path.join(CACHE_DIR, `img-${Date.now()}.jpg`);
  await downloadFile(imageUrl, imgPath);
  return imgPath;
}

async function getMusic(): Promise<string> {
  ensureCacheDir();
  const url = MUSIC_POOL[Math.floor(Math.random() * MUSIC_POOL.length)];
  // Use URL hash as cache key
  const cacheKey = Buffer.from(url).toString('base64').replace(/[/+=]/g, '').slice(0, 20);
  const cachedPath = path.join(CACHE_DIR, `music-${cacheKey}.mp3`);

  if (fs.existsSync(cachedPath)) {
    return cachedPath;
  }

  await downloadFile(url, cachedPath);
  return cachedPath;
}

function cleanupFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
}

// Minimum free memory (MB) required to start video generation
const MIN_FREE_MEMORY_MB = 200;

function checkMemoryAvailable(): boolean {
  const freeMem = os.freemem() / (1024 * 1024);
  return freeMem >= MIN_FREE_MEMORY_MB;
}

/**
 * Generate a 15s vertical video (720x1280) from a static image with Ken Burns effect + music.
 * Uses ultrafast preset and lower resolution to minimize RAM usage on cloud (Railway 1GB).
 */
export async function generateVideoForPost(
  topic: string,
  category: string
): Promise<{ videoPath: string; cleanup: () => void }> {
  // Memory guard: abort early if not enough RAM available
  if (!checkMemoryAvailable()) {
    const freeMb = Math.round(os.freemem() / (1024 * 1024));
    await agentLog('Video Generator', `⚠️ Memória insuficiente (${freeMb}MB livre, mínimo ${MIN_FREE_MEMORY_MB}MB). Abortando geração de vídeo.`, { type: 'error' });
    throw new Error(`Insufficient memory for video generation (${freeMb}MB free, need ${MIN_FREE_MEMORY_MB}MB)`);
  }

  const outputPath = path.join(os.tmpdir(), `reel-${Date.now()}.mp4`);
  let imgPath = '';
  let musicPath = '';

  try {
    // 1. Get image
    await agentLog('Video Generator', `Gerando imagem para vídeo: "${topic}"`, { type: 'action' });
    const image = await generateImageForPost(topic, category);
    imgPath = await downloadImage(image.url);

    // 2. Get music
    await agentLog('Video Generator', 'Baixando música de fundo...', { type: 'action' });
    musicPath = await getMusic();

    // 3. Compose video with ffmpeg
    await agentLog('Video Generator', 'Compondo vídeo com Ken Burns + música (720x1280 ultrafast)...', { type: 'action' });

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(imgPath)
        .loop(15)
        .inputOptions(['-framerate', '30'])
        .input(musicPath)
        .outputOptions([
          '-t', '15',
          // Ken Burns: zoom from 1.0 to 1.3 over 15s, centered, output 720x1280 (lower res for cloud)
          '-vf', "scale=4000:-1,zoompan=z='min(zoom+0.002,1.3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=450:s=720x1280:fps=30",
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '26',
          '-c:a', 'aac',
          '-b:a', '96k',
          '-shortest',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    await agentLog('Video Generator', `✅ Vídeo gerado: ${outputPath}`, { type: 'result' });

    // Cleanup image (music stays cached)
    cleanupFile(imgPath);

    return {
      videoPath: outputPath,
      cleanup: () => cleanupFile(outputPath),
    };
  } catch (err: any) {
    cleanupFile(imgPath);
    cleanupFile(outputPath);
    throw err;
  }
}
