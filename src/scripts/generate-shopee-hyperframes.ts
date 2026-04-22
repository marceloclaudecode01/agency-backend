/**
 * Generate Shopee HyperFrames videos with narration + music
 * Does NOT publish — only generates MP4 files locally.
 *
 * Usage: cd backend && npx tsx src/scripts/generate-shopee-hyperframes.ts
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';
import { execSync } from 'child_process';

// Load .env BEFORE importing services that need env vars
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim();
      const val = trimmed.substring(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
  console.log('[Setup] .env loaded');
}

import { searchProducts, ShopeeProduct } from '../services/shopee-affiliate.service';
import { buildHyperFramesHTML, HyperFramesTemplateParams, pickHookBadge, pickDuration, ColorTheme } from '../services/hyperframes-template';
import { askGemini } from '../agents/gemini';

// ─── Paths ──────────────────────────────────────────────────
const HF_PROJECT = path.resolve(__dirname, '../../../hyperframes-shopee');
const OUTPUT_DIR = path.join(os.homedir(), 'Desktop', 'shopee-videos');

// Ensure ffmpeg + ffprobe are in PATH (HyperFrames CLI needs both)
const ffmpegStaticDir = path.resolve(__dirname, '../../node_modules/ffmpeg-static');
const ffprobeDir = path.resolve(__dirname, '../../node_modules/@ffprobe-installer/win32-x64');
const extraPaths = [ffmpegStaticDir, ffprobeDir].filter(d => fs.existsSync(d));
if (extraPaths.length > 0) {
  process.env.PATH = extraPaths.join(path.delimiter) + path.delimiter + (process.env.PATH || '');
  console.log(`[Setup] FFmpeg/FFprobe added to PATH`);
}

// ─── Helpers ────────────────────────────────────────────────

function downloadImage(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadImage(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const ws = fs.createWriteStream(dest);
      res.pipe(ws);
      ws.on('finish', () => { ws.close(); resolve(); });
      ws.on('error', reject);
    }).on('error', reject);
  });
}

function imageToBase64DataUri(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function generateNarration(product: ShopeeProduct): Promise<string> {
  const priceStr = product.price > 0 ? `por apenas ${product.price.toFixed(2).replace('.', ',')} reais` : 'com preco incrivel';
  const salesStr = product.sales >= 1000
    ? `${(product.sales / 1000).toFixed(1).replace('.0', '')} mil`
    : `${product.sales}`;

  const prompt = `Escreva um roteiro de narração de 12 segundos para um video Reels/Shorts sobre este produto Shopee.

Produto: ${product.productName}
Preco: R$${product.price.toFixed(2)}
Vendas: ${salesStr}+ vendidos
Avaliacao: ${product.ratingStar || 4.5} estrelas

FORMATO EXATO (5 frases curtas, uma por cena):
Cena 1 (0-3s): Hook impactante — "Olha esse achado!" ou "Gente, voces precisam ver isso!"
Cena 2 (3-6s): Nome do produto + principal beneficio
Cena 3 (6-9s): Prova social — vendas + avaliacao
Cena 4 (9-12s): Preco com urgencia
Cena 5 (12-15s): CTA — "Corre pra garantir o seu!"

REGRAS:
- Portugues brasileiro informal, empolgado, como influenciadora de achadinhos
- Max 15 palavras por frase
- NAO use hashtags, emojis ou formatacao
- Retorne APENAS as 5 frases separadas por |

Exemplo: Gente olha esse achado incrivel!|Cortina blackout premium que bloqueia toda a luz|Mais de tres mil vendidas com cinco estrelas|Tudo isso por apenas sessenta e nove e noventa|Corre que ta acabando, garanta a sua agora!`;

  try {
    const raw = await askGemini(prompt);
    const cleaned = raw.replace(/[\n\r]+/g, '|').replace(/\|{2,}/g, '|').trim();
    // Validate: must have at least 3 segments
    if (cleaned.split('|').filter(s => s.trim().length > 5).length >= 3) {
      return cleaned;
    }
  } catch {}

  // Fallback narration
  const shortName = product.productName.split(' ').slice(0, 4).join(' ');
  return `Gente olha esse achado incrivel na Shopee!|${shortName} com qualidade premium|Mais de ${salesStr} vendidos com avaliacao top|${priceStr}, preco de achado!|Corre pra garantir o seu antes que acabe!`;
}

async function generateProductTexts(product: ShopeeProduct): Promise<{ hookText: string; featureDesc: string }> {
  const prompt = `Gere textos CURTOS para video Shopee. Produto: ${product.productName}. Preco: R$${product.price.toFixed(2)}. Vendas: ${product.sales}+.
Retorne APENAS JSON: {"hookText":"frase 3-5 palavras","featureDesc":"beneficio max 40 chars"}
hookText deve PARAR O SCROLL. featureDesc foca em qualidade/beneficio.`;

  try {
    const raw = await askGemini(prompt);
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      const p = JSON.parse(m[0]);
      return { hookText: (p.hookText || '').slice(0, 60), featureDesc: (p.featureDesc || '').slice(0, 60) };
    }
  } catch {}

  const short = product.productName.split(' ').slice(0, 3).join(' ');
  return { hookText: `Olha esse ${short}!`, featureDesc: `${product.sales}+ vendidos - qualidade top` };
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  SHOPEE HYPERFRAMES — Dia das Mães 2026 (no post) ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. Fetch 5 DIFFERENT products (Dia das Mães keywords, Shopee Affiliate API)
  console.log('🔍 Buscando produtos Dia das Mães na Shopee Affiliate API...\n');
  const mothersDayKeywords = [
    'kit skincare feminino', 'perfume feminino importado', 'air fryer fritadeira eletrica',
    'bolsa feminina couro', 'escova secadora cabelo', 'massageador eletrico portatil',
    'pijama feminino conjunto', 'colar feminino prata', 'cafeteira eletrica',
    'robe roupao feminino', 'smartwatch feminino', 'paleta sombras profissional',
    'hidratante corporal kit', 'sandalia confortavel feminina', 'jogo cama queen',
  ];
  // Shuffle for variety
  const shuffled = mothersDayKeywords.sort(() => Math.random() - 0.5);
  const products: ShopeeProduct[] = [];
  const seenNames = new Set<string>();

  for (const kw of shuffled) {
    if (products.length >= 5) break;
    try {
      const results = await searchProducts(kw, 5, 2);
      if (results.length > 0) {
        // Pick best product not already selected (avoid duplicates)
        const sorted = results.sort((a, b) => (b.commissionRate * b.sales) - (a.commissionRate * a.sales));
        for (const candidate of sorted) {
          const nameKey = candidate.productName.toLowerCase().slice(0, 40);
          if (!seenNames.has(nameKey) && candidate.price > 0 && candidate.imageUrl) {
            seenNames.add(nameKey);
            products.push(candidate);
            console.log(`  ✅ "${kw}" → ${candidate.productName.slice(0, 50)} (R$${candidate.price.toFixed(2)}, ${candidate.sales} vendas, ${(candidate.commissionRate * 100).toFixed(0)}%)`);
            break;
          }
        }
      } else {
        console.log(`  ⚠️  "${kw}" → sem resultados`);
      }
    } catch (err: any) {
      console.error(`  ❌ "${kw}" → erro: ${err.message}`);
    }
  }

  if (products.length === 0) {
    console.error('\n❌ Nenhum produto encontrado. Verifique SHOPEE_APP_ID/SHOPEE_SECRET.');
    process.exit(1);
  }
  console.log(`\n📦 ${products.length} produto(s) selecionado(s) (todos diferentes)\n`);

  // 2. Generate videos
  const results: { product: string; videoPath: string; affiliateLink: string }[] = [];

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const shortName = product.productName.slice(0, 40);
    console.log(`\n${'─'.repeat(55)}`);
    console.log(`[${i + 1}/${products.length}] ${shortName}`);
    console.log(`${'─'.repeat(55)}`);

    try {
      // 2a. Download product image (with retry)
      console.log('  📷 Baixando imagem do produto...');
      const imgPath = path.join(HF_PROJECT, 'product.jpg');
      let imgDownloaded = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await downloadImage(product.imageUrl, imgPath);
          imgDownloaded = true;
          break;
        } catch (dlErr: any) {
          console.warn(`  ⚠️  Download attempt ${attempt}/3 failed: ${dlErr.message}`);
          if (attempt < 3) await new Promise(r => setTimeout(r, 3000));
        }
      }
      if (!imgDownloaded) throw new Error('Image download failed after 3 attempts');
      const imgDataUri = imageToBase64DataUri(imgPath);
      console.log(`  ✅ Imagem: ${(fs.statSync(imgPath).size / 1024).toFixed(0)}KB`);

      // 2b. Generate narration text via Gemini
      console.log('  🗣️  Gerando roteiro de narração...');
      const narrationText = await generateNarration(product);
      const scenes = narrationText.split('|').map(s => s.trim()).filter(s => s.length > 3);
      console.log(`  ✅ Narração: ${scenes.length} cenas`);
      for (let j = 0; j < scenes.length; j++) {
        console.log(`     Cena ${j + 1}: "${scenes[j].slice(0, 60)}"`);
      }

      // 2c. Generate TTS audio via HyperFrames Kokoro
      console.log('  🔊 Gerando áudio TTS (Edge TTS pt-BR)...');
      const narrationFile = path.join(HF_PROJECT, 'narration.mp3');
      const fullNarration = scenes.join('. ');
      // Write narration to temp .txt file (avoids shell escaping issues)
      const ttsTextFile = path.join(HF_PROJECT, '_tts-input.txt');
      fs.writeFileSync(ttsTextFile, fullNarration, 'utf-8');
      try {
        // Edge TTS — free, high quality, pt-BR female voice
        execSync(
          `edge-tts --voice pt-BR-FranciscaNeural --rate +10% --file _tts-input.txt --write-media narration.mp3`,
          { cwd: HF_PROJECT, timeout: 30000, stdio: 'pipe', env: { ...process.env } },
        );
        console.log(`  ✅ TTS: ${(fs.statSync(narrationFile).size / 1024).toFixed(0)}KB`);
      } catch (ttsErr: any) {
        console.warn(`  ⚠️  TTS falhou: ${ttsErr.message.slice(0, 80)} — video sem narração`);
      }
      try { fs.unlinkSync(ttsTextFile); } catch {}

      // 2d. Generate hook/feature text
      console.log('  ✍️  Gerando textos visuais...');
      const { hookText, featureDesc } = await generateProductTexts(product);
      console.log(`  ✅ Hook: "${hookText}" | Feature: "${featureDesc}"`);

      // 2e. Build HTML with audio elements
      const price = product.price;
      const originalPrice = Math.round(price * (1.5 + Math.random() * 0.5));
      const discount = Math.round((1 - price / originalPrice) * 100);
      const salesFmt = product.sales >= 1000
        ? `${(product.sales / 1000).toFixed(product.sales >= 10000 ? 0 : 1).replace('.0', '')}k`
        : `${product.sales}`;

      const hasNarration = fs.existsSync(narrationFile) && fs.statSync(narrationFile).size > 1000;
      const bgMusicPath = path.join(HF_PROJECT, 'bg-music.mp3');
      const hasBgMusic = fs.existsSync(bgMusicPath);

      // v3: color theme, hook badge, adaptive duration
      const themes: ColorTheme[] = ['nike', 'apple', 'coca', 'tiffany', 'supreme', 'chanel'];
      const colorTheme = themes[i % themes.length];
      const hookBadge = pickHookBadge(product.sales, discount);
      const duration = pickDuration(price);
      console.log(`  🎨 Tema: ${colorTheme} | Badge: "${hookBadge}" | Duração: ${duration}s`);

      const params: HyperFramesTemplateParams = {
        productName: product.productName.slice(0, 50),
        hookText,
        featureDesc,
        price: `R$${price.toFixed(2).replace('.', ',')}`,
        originalPrice: `R$${originalPrice.toFixed(2).replace('.', ',')}`,
        discount: `-${discount}% OFF`,
        salesCount: salesFmt,
        ratingStars: product.ratingStar || 4.5,
        imgDataUri,
        hasNarration,
        hasBgMusic,
        colorTheme,
        hookBadge,
        duration,
      };

      const html = buildHyperFramesHTML(params);

      // Write HTML
      const indexPath = path.join(HF_PROJECT, 'index.html');
      fs.writeFileSync(indexPath, html, 'utf-8');
      console.log(`  📄 HTML: ${(html.length / 1024).toFixed(0)}KB`);

      // 2f. Render via HyperFrames CLI
      const safeName = product.productName
        .slice(0, 30)
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase();
      const outputFile = `shopee-${safeName}-${Date.now()}.mp4`;
      // Render to project-local renders/ dir (avoids Windows path-with-spaces issue)
      const rendersDir = path.join(HF_PROJECT, 'renders');
      if (!fs.existsSync(rendersDir)) fs.mkdirSync(rendersDir, { recursive: true });
      const localRenderPath = path.join(rendersDir, outputFile);
      const finalPath = path.join(OUTPUT_DIR, outputFile);

      // Step 1: Render visual-only MP4 via HyperFrames
      console.log('  🎬 Renderizando visual MP4 via HyperFrames...');
      const renderStart = Date.now();
      const silentFile = `silent-${safeName}.mp4`;
      const silentPath = path.join(rendersDir, silentFile);
      execSync(
        `npx hyperframes render --output renders/${silentFile} --quality standard --fps 30`,
        { cwd: HF_PROJECT, timeout: 180000, stdio: 'pipe', env: { ...process.env } },
      );
      const renderTime = ((Date.now() - renderStart) / 1000).toFixed(1);
      console.log(`  ✅ Visual renderizado (${renderTime}s)`);

      // Step 2: Mix narration + bg music via ffmpeg
      const narrationExists = fs.existsSync(narrationFile) && fs.statSync(narrationFile).size > 1000;
      const bgMusicExists = fs.existsSync(bgMusicPath);

      if (narrationExists || bgMusicExists) {
        console.log('  🔊 Mixando áudio (narração + música) via ffmpeg...');
        // Build ffmpeg command: video + narration (loud) + bg music (quiet)
        const inputs = [`-i "${silentPath}"`];
        const filterParts: string[] = [];
        let audioIdx = 1;

        if (narrationExists) {
          inputs.push(`-i "${narrationFile}"`);
          filterParts.push(`[${audioIdx}:a]volume=1.0[narr]`);
          audioIdx++;
        }
        if (bgMusicExists) {
          inputs.push(`-i "${bgMusicPath}"`);
          // Trim bg music to video duration, low volume, fade out last 2s
          filterParts.push(`[${audioIdx}:a]atrim=0:${duration},volume=0.12,afade=t=out:st=${duration - 2}:d=2[bgm]`);
          audioIdx++;
        }

        // Amerge: mix narration + music
        let amerge = '';
        if (narrationExists && bgMusicExists) {
          amerge = ';[narr][bgm]amix=inputs=2:duration=longest[aout]';
        } else if (narrationExists) {
          amerge = ';[narr]acopy[aout]';
        } else {
          amerge = ';[bgm]acopy[aout]';
        }

        const filterComplex = filterParts.join(';') + amerge;
        const ffmpegCmd = `ffmpeg -y ${inputs.join(' ')} -filter_complex "${filterComplex}" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -shortest "${localRenderPath}"`;

        try {
          execSync(ffmpegCmd, { cwd: HF_PROJECT, timeout: 60000, stdio: 'pipe', env: { ...process.env } });
          const finalSize = (fs.statSync(localRenderPath).size / 1024 / 1024).toFixed(1);
          console.log(`  ✅ Áudio mixado! Final: ${finalSize}MB`);
        } catch (ffErr: any) {
          console.warn(`  ⚠️  FFmpeg mix falhou: ${ffErr.message.slice(0, 80)} — usando video sem áudio`);
          fs.copyFileSync(silentPath, localRenderPath);
        }
        // Cleanup silent version
        try { fs.unlinkSync(silentPath); } catch {}
      } else {
        // No audio — just rename
        fs.renameSync(silentPath, localRenderPath);
      }

      const videoSize = (fs.statSync(localRenderPath).size / 1024 / 1024).toFixed(1);
      console.log(`  ✅ Video final: ${outputFile} (${videoSize}MB)`);

      // Copy to Desktop
      fs.copyFileSync(localRenderPath, finalPath);
      const affiliateLink = product.offerLink || product.productLink || '';
      results.push({ product: shortName, videoPath: finalPath, affiliateLink });
    } catch (err: any) {
      console.error(`  ❌ Falhou: ${err.message}`);
    }
  }

  // Summary
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`📊 RESULTADO: ${results.length}/${products.length} vídeos gerados\n`);
  for (const r of results) {
    console.log(`  🎬 ${r.product}`);
    console.log(`     Video: ${r.videoPath}`);
    console.log(`     Link afiliado: ${r.affiliateLink}\n`);
  }
  console.log(`📂 Pasta: ${OUTPUT_DIR}`);
  console.log(`${'═'.repeat(55)}`);
  console.log(`\n⚠️  Videos NÃO publicados — apenas gerados localmente.`);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
