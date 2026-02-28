import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);

// In production (dist/services/), assets are at ../../src/assets/music
// In dev (src/services/), assets are at ../assets/music
const MUSIC_DIR = fs.existsSync(path.join(__dirname, '..', 'assets', 'music'))
  ? path.join(__dirname, '..', 'assets', 'music')
  : path.join(__dirname, '..', '..', 'src', 'assets', 'music');

interface ComposeOptions {
  quote: string;
  backgroundVideo: string;
  outputPath: string;
  duration?: number; // seconds, default 20
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

export async function composeMotivationalVideo(opts: ComposeOptions): Promise<string> {
  const { quote, backgroundVideo, outputPath, duration = 20 } = opts;

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
    'fontsize=56',
    'fontcolor=white',
    'borderw=3',
    'bordercolor=black',
    'x=(w-text_w)/2',
    'y=(h-text_h)/2',
    'line_spacing=12',
  ].join(':');

  const videoFilter = `[0:v]trim=0:${duration},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,${textFilter}[vout]`;

  const args: string[] = [
    '-y',
    '-i', backgroundVideo,
  ];

  if (musicPath) {
    args.push('-i', musicPath);
  }

  args.push(
    '-filter_complex', musicPath
      ? `${videoFilter};[0:a]volume=0.1[va];[1:a]atrim=0:${duration},asetpts=PTS-STARTPTS,volume=0.2[ma];[va][ma]amix=inputs=2:duration=shortest[aout]`
      : videoFilter,
    '-map', '[vout]',
    '-map', musicPath ? '[aout]' : '0:a?',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-t', String(duration),
    '-movflags', '+faststart',
    outputPath,
  );

  await execFileAsync('ffmpeg', args, { timeout: 120_000 });

  return outputPath;
}
