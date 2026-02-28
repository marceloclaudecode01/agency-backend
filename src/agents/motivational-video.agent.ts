import path from 'path';
import fs from 'fs';
import os from 'os';
import { v2 as cloudinary } from 'cloudinary';
import prisma from '../config/database';
import { askGemini } from './gemini';
import { agentLog } from './agent-logger';
import { downloadPexelsVideo } from '../services/pexels.service';
import { composeMotivationalVideo } from '../services/video-composer';

const AGENT_NAME = 'Motivational Video';

const QUOTE_PROMPT = `Gere UMA frase motivacional curta e impactante em português brasileiro.
Regras:
- Máximo 15 palavras
- Sem aspas, sem autor, sem emojis
- Tom: inspirador, positivo, direto
- Temas: superação, foco, gratidão, coragem, persistência
Responda APENAS com a frase, nada mais.`;

async function generateQuote(): Promise<string> {
  const raw = await askGemini(QUOTE_PROMPT);
  // Clean up: remove quotes, author attributions, extra whitespace
  return raw.replace(/[""\u201C\u201D]/g, '').replace(/\s*[-—]\s*.+$/, '').trim();
}

async function uploadToCloudinary(filePath: string): Promise<string> {
  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: 'video',
    folder: 'motivational-videos',
    transformation: [{ quality: 'auto' }],
  });
  return result.secure_url;
}

export async function generateMotivationalVideo(): Promise<void> {
  const tmpDir = path.join(os.tmpdir(), 'motivational-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // 1. Generate motivational quote
    await agentLog(AGENT_NAME, 'Gerando frase motivacional via Groq...', { type: 'communication', to: 'Groq AI' });
    const quote = await generateQuote();
    await agentLog(AGENT_NAME, `Frase: "${quote}"`, { type: 'result' });

    // 2. Download background video from Pexels
    await agentLog(AGENT_NAME, 'Baixando vídeo de fundo do Pexels...', { type: 'action', to: 'Pexels API' });
    const bgVideo = path.join(tmpDir, 'background.mp4');
    await downloadPexelsVideo(bgVideo);
    await agentLog(AGENT_NAME, 'Vídeo de fundo baixado.', { type: 'result' });

    // 3. Compose video with FFmpeg
    await agentLog(AGENT_NAME, 'Compondo vídeo com FFmpeg (texto + música)...', { type: 'action' });
    const outputPath = path.join(tmpDir, 'motivational-final.mp4');
    await composeMotivationalVideo({
      quote,
      backgroundVideo: bgVideo,
      outputPath,
      duration: 20,
    });
    await agentLog(AGENT_NAME, 'Vídeo composto com sucesso.', { type: 'result' });

    // 4. Upload to Cloudinary
    await agentLog(AGENT_NAME, 'Fazendo upload para Cloudinary...', { type: 'action', to: 'Cloudinary' });
    const videoUrl = await uploadToCloudinary(outputPath);
    await agentLog(AGENT_NAME, `Upload concluído: ${videoUrl}`, { type: 'result' });

    // 5. Create scheduled post
    const hashtags = '#motivação #frases #inspiração #sucesso #mindset #foco';
    const message = `✨ ${quote}\n\n${hashtags}`;

    await prisma.scheduledPost.create({
      data: {
        topic: 'Vídeo Motivacional',
        message,
        hashtags,
        imageUrl: videoUrl, // videoUrl stored in imageUrl field (used for media)
        status: 'APPROVED',
        scheduledFor: new Date(Date.now() + 5 * 60 * 1000), // 5 min from now
      },
    });

    await agentLog(AGENT_NAME, `✅ Vídeo motivacional agendado! Frase: "${quote}"`, {
      type: 'result',
      to: 'Scheduler',
      payload: { quote, videoUrl },
    });
  } catch (err: any) {
    await agentLog(AGENT_NAME, `❌ Erro ao gerar vídeo motivacional: ${err.message}`, { type: 'error' });
    throw err;
  } finally {
    // Cleanup temp files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}
