/**
 * HyperFrames Video Service — Renders Shopee product videos via HyperFrames CLI
 *
 * Pipeline:
 *   1. Download product image → base64 data URI
 *   2. Generate AI hook/feature text via Gemini
 *   3. Generate TTS narration (ElevenLabs > Edge Neural)
 *   4. Build parametrized HTML (themes, hooks, adaptive duration)
 *   5. Write to temp HyperFrames project
 *   6. Render via `npx hyperframes render`
 *   7. Return MP4 path
 *
 * v3: narration, bg music, color themes, hook badges, adaptive duration
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';
import { execSync } from 'child_process';
import {
  buildHyperFramesHTML,
  HyperFramesTemplateParams,
  ColorTheme,
  pickHookBadge,
  pickDuration,
  VideoDuration,
} from './hyperframes-template';
import { askGemini } from '../agents/gemini';
import { ShopeeProduct } from './shopee-affiliate.service';
import { generateNarrationWithRetry } from './tts.service';

// ─── Config ─────────────────────────────────────────────────
const HYPERFRAMES_PROJECT = path.resolve(__dirname, '../../../hyperframes-shopee');
const OUTPUT_DIR = path.resolve(__dirname, '../../../hyperframes-shopee/renders');
const DESKTOP_DIR = path.join(os.homedir(), 'Desktop', 'shopee-videos');

export interface HyperFramesVideoResult {
  videoPath: string;
  desktopPath: string;
  durationSec: number;
  product: string;
  colorTheme: ColorTheme;
  hookBadge: string;
  hasNarration: boolean;
}

/**
 * Download image from URL → base64 data URI
 */
function downloadImageAsBase64(imageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const protocol = imageUrl.startsWith('https') ? https : http;
    const request = protocol.get(imageUrl, { timeout: 15000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadImageAsBase64(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Image download failed: HTTP ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || 'image/jpeg';
        const mimeType = contentType.split(';')[0].trim();
        resolve(`data:${mimeType};base64,${buffer.toString('base64')}`);
      });
      res.on('error', reject);
    });
    request.on('error', reject);
    request.on('timeout', () => { request.destroy(); reject(new Error('Image download timeout')); });
  });
}

/**
 * Generate hook and feature text via Gemini for a product.
 */
async function generateProductTexts(product: ShopeeProduct): Promise<{
  hookText: string;
  featureDesc: string;
}> {
  const prompt = `Voce e um copywriter de videos virais de achadinhos Shopee.
Gere textos CURTOS para um video de 15s sobre este produto:

Produto: ${product.productName}
Preco: R$${product.price.toFixed(2)}
Vendas: ${product.sales}+

Retorne APENAS JSON:
{
  "hookText": "frase de 3-5 palavras que PARA O SCROLL (ex: 'Achei na Shopee!')",
  "featureDesc": "beneficio principal em 1 frase curta (max 40 chars)"
}

REGRAS:
- hookText: max 5 palavras, IMPACTANTE, em portugues informal
- featureDesc: max 40 chars, foque na QUALIDADE/BENEFICIO
- NAO use aspas dentro dos textos
- Portugues brasileiro informal`;

  try {
    const raw = await askGemini(prompt);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        hookText: (parsed.hookText || 'Achei na Shopee!').slice(0, 60),
        featureDesc: (parsed.featureDesc || 'Qualidade premium').slice(0, 60),
      };
    }
  } catch {}

  const shortName = product.productName.split(' ').slice(0, 3).join(' ');
  return {
    hookText: `Olha esse ${shortName}!`,
    featureDesc: `${product.sales}+ vendidos - qualidade top`,
  };
}

/**
 * Build narration text from product data (one sentence per scene).
 */
function buildNarrationText(
  hookText: string,
  productName: string,
  featureDesc: string,
  salesCount: string,
  price: string,
  originalPrice: string,
): string {
  return [
    hookText,
    `${productName}. ${featureDesc}.`,
    `${salesCount} vendidos esse mes!`,
    `De ${originalPrice} por apenas ${price}.`,
    `Garanta o seu agora na Shopee!`,
  ].join(' ');
}

/**
 * Generate TTS narration and save to HyperFrames project.
 * Returns true if narration was generated successfully.
 */
async function generateAndSaveNarration(narrationText: string): Promise<boolean> {
  try {
    console.log(`[HyperFrames] Generating TTS narration (${narrationText.length} chars)...`);
    const narrationPath = await generateNarrationWithRetry(narrationText, 2);
    if (!narrationPath) {
      console.warn('[HyperFrames] TTS failed — video will be silent');
      return false;
    }

    // Copy narration to HyperFrames project directory
    const destPath = path.join(HYPERFRAMES_PROJECT, 'narration.mp3');
    fs.copyFileSync(narrationPath, destPath);
    console.log(`[HyperFrames] Narration saved (${(fs.statSync(destPath).size / 1024).toFixed(0)}KB)`);
    return true;
  } catch (err: any) {
    console.warn(`[HyperFrames] Narration error: ${err.message}`);
    return false;
  }
}

/**
 * Ensure bg-music.mp3 exists in the HyperFrames project.
 */
function ensureBgMusic(): boolean {
  const musicPath = path.join(HYPERFRAMES_PROJECT, 'bg-music.mp3');
  return fs.existsSync(musicPath);
}

/**
 * Select color theme — rotates deterministically per product.
 */
function selectTheme(productIndex: number): ColorTheme {
  const themes: ColorTheme[] = ['nike', 'apple', 'coca', 'tiffany', 'supreme', 'chanel'];
  return themes[productIndex % themes.length];
}

/**
 * Format product data into HyperFrames template params.
 */
function buildTemplateParams(
  product: ShopeeProduct,
  imgDataUri: string,
  hookText: string,
  featureDesc: string,
  opts: { theme: ColorTheme; badge: string; duration: VideoDuration; hasNarration: boolean; hasBgMusic: boolean },
): HyperFramesTemplateParams {
  const price = product.price;
  const originalPrice = Math.round(price * (1.5 + Math.random() * 0.5));
  const discount = Math.round((1 - price / originalPrice) * 100);
  const salesFormatted = product.sales >= 1000
    ? `${(product.sales / 1000).toFixed(product.sales >= 10000 ? 0 : 1).replace('.0', '')}k`
    : `${product.sales}`;

  return {
    productName: product.productName.slice(0, 50),
    hookText,
    featureDesc,
    price: `R$${price.toFixed(2).replace('.', ',')}`,
    originalPrice: `R$${originalPrice.toFixed(2).replace('.', ',')}`,
    discount: `-${discount}% OFF`,
    salesCount: salesFormatted,
    ratingStars: product.ratingStar || 4.5,
    imgDataUri,
    colorTheme: opts.theme,
    hookBadge: opts.badge,
    duration: opts.duration,
    hasNarration: opts.hasNarration,
    hasBgMusic: opts.hasBgMusic,
  };
}

/**
 * Render a Shopee product video via HyperFrames CLI.
 */
export async function renderShopeeVideo(
  product: ShopeeProduct,
  productIndex = 0,
): Promise<HyperFramesVideoResult> {
  // 1. Download product image
  console.log(`[HyperFrames] Downloading image for "${product.productName.slice(0, 40)}"...`);
  const imgDataUri = await downloadImageAsBase64(product.imageUrl);

  // 2. Generate texts via Gemini
  console.log(`[HyperFrames] Generating hook/feature text...`);
  const { hookText, featureDesc } = await generateProductTexts(product);

  // 3. Pick theme, badge, duration
  const theme = selectTheme(productIndex);
  const originalPrice = Math.round(product.price * (1.5 + Math.random() * 0.5));
  const discountPct = Math.round((1 - product.price / originalPrice) * 100);
  const badge = pickHookBadge(product.sales, discountPct);
  const duration = pickDuration(product.price);

  console.log(`[HyperFrames] Theme: ${theme} | Badge: "${badge}" | Duration: ${duration}s`);

  // 4. Generate narration
  const salesFormatted = product.sales >= 1000
    ? `${(product.sales / 1000).toFixed(1).replace('.0', '')} mil`
    : `${product.sales}`;
  const priceFormatted = `R$${product.price.toFixed(2).replace('.', ',')}`;
  const origFormatted = `R$${originalPrice.toFixed(2).replace('.', ',')}`;
  const narrationText = buildNarrationText(hookText, product.productName.slice(0, 50), featureDesc, salesFormatted, priceFormatted, origFormatted);
  const hasNarration = await generateAndSaveNarration(narrationText);

  // 5. Check background music
  const hasBgMusic = ensureBgMusic();

  // 6. Build HTML
  const params = buildTemplateParams(product, imgDataUri, hookText, featureDesc, {
    theme, badge, duration, hasNarration, hasBgMusic,
  });
  const html = buildHyperFramesHTML(params);

  // 7. Write to HyperFrames project
  const indexPath = path.join(HYPERFRAMES_PROJECT, 'index.html');
  fs.writeFileSync(indexPath, html, 'utf-8');
  console.log(`[HyperFrames] HTML written (${(html.length / 1024).toFixed(0)}KB) — narration: ${hasNarration}, music: ${hasBgMusic}`);

  // 8. Ensure output dirs exist
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(DESKTOP_DIR)) fs.mkdirSync(DESKTOP_DIR, { recursive: true });

  // 9. Render via HyperFrames CLI
  const timestamp = Date.now();
  const safeName = product.productName
    .slice(0, 40)
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
  const outputFile = `shopee-${safeName}-${timestamp}.mp4`;
  const outputPath = path.join(OUTPUT_DIR, outputFile);

  console.log(`[HyperFrames] Rendering video (${duration}s, ${theme} theme)...`);
  try {
    execSync(
      `npx hyperframes render --output "${outputPath}"`,
      {
        cwd: HYPERFRAMES_PROJECT,
        timeout: 120_000,
        stdio: 'pipe',
      },
    );
  } catch (err: any) {
    const stderr = err.stderr?.toString() || '';
    const stdout = err.stdout?.toString() || '';
    throw new Error(`HyperFrames render failed: ${stderr || stdout || err.message}`);
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error(`HyperFrames render produced no output at ${outputPath}`);
  }

  const stats = fs.statSync(outputPath);
  console.log(`[HyperFrames] Render complete: ${outputFile} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);

  // 10. Copy to Desktop for easy access
  const desktopPath = path.join(DESKTOP_DIR, outputFile);
  fs.copyFileSync(outputPath, desktopPath);

  return {
    videoPath: outputPath,
    desktopPath,
    durationSec: duration,
    product: product.productName,
    colorTheme: theme,
    hookBadge: badge,
    hasNarration,
  };
}

/**
 * Batch render multiple Shopee products.
 */
export async function renderShopeeVideoBatch(
  products: ShopeeProduct[],
  delayBetweenMs = 5000,
): Promise<HyperFramesVideoResult[]> {
  const results: HyperFramesVideoResult[] = [];

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    console.log(`\n[HyperFrames] === Video ${i + 1}/${products.length}: ${product.productName.slice(0, 40)} ===`);
    try {
      const result = await renderShopeeVideo(product, i);
      results.push(result);
    } catch (err: any) {
      console.error(`[HyperFrames] Failed for "${product.productName.slice(0, 40)}": ${err.message}`);
    }

    if (i < products.length - 1 && delayBetweenMs > 0) {
      await new Promise(r => setTimeout(r, delayBetweenMs));
    }
  }

  console.log(`\n[HyperFrames] Batch complete: ${results.length}/${products.length} videos rendered`);
  return results;
}
