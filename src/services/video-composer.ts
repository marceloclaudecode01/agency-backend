import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// In production (dist/services/), assets are at ../../src/assets/music
// In dev (src/services/), assets are at ../assets/music
const MUSIC_DIR = fs.existsSync(path.join(__dirname, '..', 'assets', 'music'))
  ? path.join(__dirname, '..', 'assets', 'music')
  : path.join(__dirname, '..', '..', 'src', 'assets', 'music');

interface ComposeOptions {
  quote: string;
  backgroundVideo: string;
  outputPath: string;
  duration?: number; // seconds, default 15
}

function getRandomMusic(): string | null {
  if (!fs.existsSync(MUSIC_DIR)) return null;
  const files = fs.readdirSync(MUSIC_DIR).filter((f) => f.endsWith('.mp3'));
  if (files.length === 0) return null;
  return path.join(MUSIC_DIR, files[Math.floor(Math.random() * files.length)]);
}

function wrapText(text: string, maxCharsPerLine: number): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxCharsPerLine) {
      lines.push(current.trim());
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current.trim()) lines.push(current.trim());

  return lines.join('\n');
}

function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('FFmpeg timeout (180s)'));
    }, 180_000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exit code ${code}: ${stderr.slice(-500)}`));
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function composeMotivationalVideo(opts: ComposeOptions): Promise<string> {
  const { quote, backgroundVideo, outputPath, duration = 15 } = opts;

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const wrappedQuote = wrapText(quote, 28);
  // Escape special chars for FFmpeg drawtext
  const escapedQuote = wrappedQuote
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%');

  const musicPath = getRandomMusic();

  // Build FFmpeg filter: trim video, scale to 1080x1920, add text overlay
  const textFilter = [
    `drawtext=text='${escapedQuote}'`,
    'fontsize=40',
    'fontcolor=white',
    'borderw=3',
    'bordercolor=black',
    'x=(w-text_w)/2',
    'y=(h-text_h)/2',
    'line_spacing=12',
  ].join(':');

  // 720x1280 for faster encoding on Railway (still HD portrait)
  const videoFilter = `[0:v]setpts=PTS-STARTPTS,scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,${textFilter}[vout]`;

  const args: string[] = [
    '-y',
    '-i', backgroundVideo,
  ];

  // Music only as audio track (Pexels videos often have no audio stream)
  if (musicPath) {
    args.push('-i', musicPath);
    args.push(
      '-filter_complex', `${videoFilter};[1:a]atrim=0:${duration},asetpts=PTS-STARTPTS,volume=0.3[aout]`,
      '-map', '[vout]',
      '-map', '[aout]',
    );
  } else {
    args.push(
      '-filter_complex', videoFilter,
      '-map', '[vout]',
      '-an',
    );
  }

  args.push(
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    '-t', String(duration),
    '-movflags', '+faststart',
    outputPath,
  );

  await runFFmpeg(args);

  return outputPath;
}
