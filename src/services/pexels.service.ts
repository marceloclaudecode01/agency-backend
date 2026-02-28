import axios from 'axios';
import fs from 'fs';
import path from 'path';

const PEXELS_API = 'https://api.pexels.com/videos/search';

const MOTIVATIONAL_QUERIES = [
  'nature sunset',
  'ocean waves',
  'mountain landscape',
  'sunrise sky',
  'forest trees',
  'clouds timelapse',
  'waterfall',
  'starry night sky',
  'rain drops',
  'flower blooming',
];

export async function downloadPexelsVideo(outputPath: string): Promise<string> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    throw new Error('PEXELS_API_KEY não configurada');
  }

  const query = MOTIVATIONAL_QUERIES[Math.floor(Math.random() * MOTIVATIONAL_QUERIES.length)];

  const { data } = await axios.get(PEXELS_API, {
    headers: { Authorization: apiKey },
    params: {
      query,
      orientation: 'portrait',
      size: 'medium',
      per_page: 15,
    },
  });

  const videos = data.videos || [];
  if (videos.length === 0) {
    throw new Error(`Nenhum vídeo encontrado no Pexels para: ${query}`);
  }

  const video = videos[Math.floor(Math.random() * videos.length)];

  // Prefer HD quality, portrait orientation
  const videoFile =
    video.video_files.find((f: any) => f.quality === 'hd' && f.height > f.width) ||
    video.video_files.find((f: any) => f.quality === 'hd') ||
    video.video_files[0];

  if (!videoFile?.link) {
    throw new Error('Nenhum arquivo de vídeo disponível');
  }

  const response = await axios.get(videoFile.link, { responseType: 'stream' });

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);

  await new Promise<void>((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  return outputPath;
}
