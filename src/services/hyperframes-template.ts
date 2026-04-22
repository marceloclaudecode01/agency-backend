/**
 * HyperFrames HTML Template — Shopee Product Video
 *
 * Generates a parametrized HTML composition for HyperFrames rendering.
 * Based on the v2 template tested and approved (2026-04-18).
 * v3: color themes, hook badge rotation, adaptive duration (2026-04-22)
 *
 * 5 scenes: Hook → Feature → Proof → Price → CTA
 * 4 transitions: Overexposure → Light Leak → Zoom Through → Blur Crossfade
 * Effects: shimmer bar, neon ring, film grain, Ken Burns on backgrounds
 */

// ─── Color Themes ────────────────────────────────────────
export type ColorTheme = 'nike' | 'apple' | 'coca' | 'tiffany' | 'supreme' | 'chanel';

interface ThemeColors {
  accent: string;
  accentRgb: string;
  price: string;
  priceRgb: string;
  badgeBg: string;
  gold: string;
  goldRgb: string;
}

const THEMES: Record<ColorTheme, ThemeColors> = {
  // Nike — preto/branco contrastante, volt green no preco
  nike: {
    accent: '#FFFFFF', accentRgb: '255,255,255',
    price: '#CDFF00', priceRgb: '205,255,0',
    badgeBg: '#111111',
    gold: '#CDFF00', goldRgb: '205,255,0',
  },
  // Apple — minimalista, azul premium, verde no preco
  apple: {
    accent: '#0A84FF', accentRgb: '10,132,255',
    price: '#30D158', priceRgb: '48,209,88',
    badgeBg: '#1D1D1F',
    gold: '#FFD60A', goldRgb: '255,214,10',
  },
  // Coca-Cola — vermelho icônico, branco limpo
  coca: {
    accent: '#F40009', accentRgb: '244,0,9',
    price: '#FFFFFF', priceRgb: '255,255,255',
    badgeBg: '#F40009',
    gold: '#FFD700', goldRgb: '255,215,0',
  },
  // Tiffany — azul Tiffany elegante, dourado luxury
  tiffany: {
    accent: '#0ABAB5', accentRgb: '10,186,181',
    price: '#FFD700', priceRgb: '255,215,0',
    badgeBg: '#0ABAB5',
    gold: '#FFD700', goldRgb: '255,215,0',
  },
  // Supreme — vermelho bold, branco stark
  supreme: {
    accent: '#ED1C24', accentRgb: '237,28,36',
    price: '#4ADE80', priceRgb: '74,222,128',
    badgeBg: '#ED1C24',
    gold: '#FFFFFF', goldRgb: '255,255,255',
  },
  // Chanel — preto/dourado luxo, elegancia maxima
  chanel: {
    accent: '#D4AF37', accentRgb: '212,175,55',
    price: '#FFFFFF', priceRgb: '255,255,255',
    badgeBg: '#1A1A1A',
    gold: '#D4AF37', goldRgb: '212,175,55',
  },
};

// ─── Hook Badges ─────────────────────────────────────────
const HOOK_BADGES = [
  'VIRALIZOU NA SHOPEE',
  'ACHADO DO DIA',
  'OFERTA RELAMPAGO',
  'MAIS VENDIDO',
  'PRECO CAIU',
];

export function pickHookBadge(sales: number, discountPct: number): string {
  if (sales > 5000) return 'MAIS VENDIDO';
  if (discountPct > 50) return 'PRECO CAIU';
  return HOOK_BADGES[Math.floor(Date.now() / 60000) % HOOK_BADGES.length];
}

// ─── Scene Timing Presets ────────────────────────────────
export type VideoDuration = 10 | 15 | 20;

interface SceneTiming {
  total: number;
  s1End: number; t1: number;
  s2Start: number; s2End: number; t2: number;
  s3Start: number; s3End: number; t3: number;
  s4Start: number; s4End: number; t4: number;
  s5Start: number; fadeOut: number;
  shimmerDur: number; shimmerRepeats: number;
}

function getSceneTiming(duration: VideoDuration): SceneTiming {
  if (duration === 10) {
    return {
      total: 10, s1End: 2.0, t1: 2.0,
      s2Start: 2.3, s2End: 4.0, t2: 4.0,
      s3Start: 4.3, s3End: 6.0, t3: 6.0,
      s4Start: 6.3, s4End: 8.0, t4: 8.0,
      s5Start: 8.3, fadeOut: 9.2,
      shimmerDur: 2, shimmerRepeats: 4,
    };
  }
  if (duration === 20) {
    return {
      total: 20, s1End: 4.0, t1: 4.0,
      s2Start: 4.5, s2End: 8.0, t2: 8.0,
      s3Start: 8.5, s3End: 12.0, t3: 12.0,
      s4Start: 12.5, s4End: 16.0, t4: 16.0,
      s5Start: 16.5, fadeOut: 19.2,
      shimmerDur: 4, shimmerRepeats: 4,
    };
  }
  // 15s — original timing
  return {
    total: 15, s1End: 3.0, t1: 3.0,
    s2Start: 3.5, s2End: 6.0, t2: 6.0,
    s3Start: 6.5, s3End: 9.0, t3: 9.0,
    s4Start: 9.5, s4End: 12.0, t4: 12.0,
    s5Start: 12.5, fadeOut: 14.2,
    shimmerDur: 3, shimmerRepeats: 4,
  };
}

export function pickDuration(price: number): VideoDuration {
  if (price < 30) return 10;
  if (price > 100) return 20;
  return 15;
}

// ─── Template Params ─────────────────────────────────────
export interface HyperFramesTemplateParams {
  productName: string;
  hookText: string;
  featureDesc: string;
  price: string;
  originalPrice: string;
  discount: string;
  salesCount: string;
  ratingStars: number;
  imgDataUri: string;
  hasNarration?: boolean;
  hasBgMusic?: boolean;
  colorTheme?: ColorTheme;
  hookBadge?: string;
  duration?: VideoDuration;
}

// ─── HTML Builder ────────────────────────────────────────
export function buildHyperFramesHTML(p: HyperFramesTemplateParams): string {
  const theme = THEMES[p.colorTheme || 'nike'];
  const badge = escapeHtml(p.hookBadge || 'VIRALIZOU NA SHOPEE');
  const stars = '\u2B50'.repeat(Math.min(Math.max(Math.round(p.ratingStars), 1), 5));
  const dur = p.duration || 15;
  const t = getSceneTiming(dur as VideoDuration);

  // Scene durations for Ken Burns
  const s1Dur = t.s1End;
  const s2Dur = t.s2End - t.s2Start;
  const s3Dur = t.s3End - t.s3Start;
  const s4Dur = t.s4End - t.s4Start;
  const s5Dur = t.total - t.s5Start;

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"><\/script>
    <style>
      :root {
        --accent: ${theme.accent};
        --accent-rgb: ${theme.accentRgb};
        --price: ${theme.price};
        --price-rgb: ${theme.priceRgb};
        --badge-bg: ${theme.badgeBg};
        --gold: ${theme.gold};
        --gold-rgb: ${theme.goldRgb};
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        margin: 0; width: 1080px; height: 1920px;
        overflow: hidden; background: #0a0a0a;
        font-family: "Montserrat", sans-serif;
      }
      .scene {
        position: absolute; top: 0; left: 0;
        width: 1080px; height: 1920px; overflow: hidden;
      }
      .product-bg {
        position: absolute; top: -40px; left: -40px;
        width: 1160px; height: 2000px;
        object-fit: cover;
        filter: blur(25px) brightness(0.35);
        z-index: 0;
      }
      .vignette {
        position: absolute; top: 0; left: 0;
        width: 1080px; height: 1920px;
        background: radial-gradient(ellipse at center, rgba(10,10,10,0.1) 0%, rgba(10,10,10,0.75) 100%);
        z-index: 1; pointer-events: none;
      }
      .scene-content {
        display: flex; flex-direction: column; align-items: center;
        width: 100%; height: 100%; padding: 80px 50px; gap: 20px;
        box-sizing: border-box; position: relative; z-index: 3;
      }
      #scene1 { z-index: 1; }
      .hook-badge {
        display: inline-flex; align-items: center; gap: 10px;
        background: var(--badge-bg); color: #fff;
        font-size: 32px; font-weight: 900;
        padding: 16px 40px; border-radius: 50px;
        letter-spacing: 0.06em; text-transform: uppercase;
        margin-top: 180px;
        box-shadow: 0 6px 30px rgba(var(--accent-rgb),0.6);
      }
      .hook-title {
        font-size: 110px; font-weight: 900; color: #fff;
        line-height: 1.0; letter-spacing: -0.03em;
        max-width: 950px; margin-top: 50px; text-align: center;
        text-shadow: 0 4px 40px rgba(0,0,0,0.7), 0 0 60px rgba(var(--accent-rgb),0.3);
      }
      .hook-product-img {
        width: 650px; height: 650px; object-fit: contain;
        border-radius: 40px; margin-top: auto; margin-bottom: 120px;
        filter: drop-shadow(0 25px 70px rgba(0,0,0,0.8));
      }
      #scene2 { z-index: 2; opacity: 0; }
      .feature-product-wrap {
        flex: 1; display: flex; align-items: center;
        justify-content: center; position: relative;
      }
      .feature-product-img {
        width: 750px; height: 750px; object-fit: contain;
        border-radius: 40px;
        filter: drop-shadow(0 30px 80px rgba(0,0,0,0.8));
      }
      .feature-glow {
        position: absolute; width: 900px; height: 900px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(var(--accent-rgb),0.2) 0%, rgba(10,10,10,0) 65%);
        top: 50%; left: 50%; transform: translate(-50%,-50%); z-index: -1;
      }
      .feature-name {
        font-size: 60px; font-weight: 900; color: #fff;
        text-align: center; letter-spacing: -0.02em;
        text-shadow: 0 3px 20px rgba(0,0,0,0.6);
      }
      .feature-desc {
        font-family: "Inter", sans-serif; font-size: 38px;
        font-weight: 400; color: rgba(255,255,255,0.8);
        text-align: center; padding: 0 40px; margin-bottom: 100px;
        text-shadow: 0 2px 10px rgba(0,0,0,0.5);
      }
      #scene3 { z-index: 3; opacity: 0; }
      .proof-icon { font-size: 130px; text-align: center; margin-top: 240px; }
      .proof-number {
        font-size: 180px; font-weight: 900; color: var(--gold);
        text-align: center; letter-spacing: -0.04em;
        text-shadow: 0 0 80px rgba(var(--gold-rgb),0.5), 0 4px 20px rgba(0,0,0,0.5);
      }
      .proof-label {
        font-family: "Inter", sans-serif; font-size: 44px;
        font-weight: 400; color: rgba(255,255,255,0.8);
        text-align: center; text-shadow: 0 2px 10px rgba(0,0,0,0.4);
      }
      .proof-badge {
        display: inline-flex; align-items: center; gap: 10px;
        background: rgba(var(--accent-rgb),0.2); border: 3px solid var(--accent);
        color: var(--accent); font-size: 32px; font-weight: 900;
        padding: 18px 44px; border-radius: 50px;
        text-transform: uppercase; margin-top: 50px;
        box-shadow: 0 0 30px rgba(var(--accent-rgb),0.3);
      }
      .proof-stars {
        font-size: 64px; text-align: center; letter-spacing: 10px;
        margin-top: auto; margin-bottom: 200px;
      }
      #scene4 { z-index: 4; opacity: 0; }
      .price-label {
        font-family: "Inter", sans-serif; font-size: 36px;
        font-weight: 400; color: rgba(255,255,255,0.6);
        text-align: center; text-transform: uppercase;
        letter-spacing: 0.15em; margin-top: 320px;
      }
      .price-value {
        font-size: 160px; font-weight: 900; color: var(--price);
        text-align: center; letter-spacing: -0.04em;
        text-shadow: 0 0 100px rgba(var(--price-rgb),0.5), 0 4px 30px rgba(0,0,0,0.5);
      }
      .price-original {
        font-family: "Inter", sans-serif; font-size: 52px;
        font-weight: 400; color: rgba(255,255,255,0.4);
        text-align: center; text-decoration: line-through;
      }
      .price-discount {
        display: inline-flex; align-items: center;
        background: var(--accent); color: #fff;
        font-size: 42px; font-weight: 900;
        padding: 16px 44px; border-radius: 50px; margin-top: 40px;
        box-shadow: 0 8px 40px rgba(var(--accent-rgb),0.6);
      }
      .price-urgency {
        font-family: "Inter", sans-serif; font-size: 32px;
        font-weight: 400; color: rgba(255,255,255,0.6);
        text-align: center; margin-top: auto; margin-bottom: 200px;
        letter-spacing: 0.05em;
      }
      #scene5 { z-index: 5; opacity: 0; }
      .cta-product-img {
        width: 480px; height: 480px; object-fit: contain;
        border-radius: 30px; margin-top: 200px;
        filter: drop-shadow(0 25px 60px rgba(0,0,0,0.7));
      }
      .cta-text {
        font-size: 80px; font-weight: 900; color: #fff;
        text-align: center; letter-spacing: -0.02em; margin-top: 50px;
        text-shadow: 0 4px 30px rgba(0,0,0,0.6);
      }
      .cta-button {
        display: flex; align-items: center; justify-content: center; gap: 14px;
        background: var(--accent); color: #fff;
        font-size: 46px; font-weight: 900;
        padding: 30px 90px; border-radius: 60px; margin-top: 40px;
        text-transform: uppercase; letter-spacing: 0.05em;
        box-shadow: 0 8px 50px rgba(var(--accent-rgb),0.6);
      }
      .cta-arrow { font-size: 48px; }
      .cta-shopee-logo {
        font-size: 28px; font-weight: 400; color: rgba(255,255,255,0.5);
        text-align: center; margin-top: auto; margin-bottom: 120px;
        letter-spacing: 0.1em; text-transform: uppercase;
      }
      .neon-ring {
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%,-50%);
        width: 520px; height: 520px; border-radius: 50%;
        border: 3px solid rgba(var(--accent-rgb),0.4);
        box-shadow: 0 0 40px rgba(var(--accent-rgb),0.2), inset 0 0 40px rgba(var(--accent-rgb),0.1);
        z-index: 2; pointer-events: none; opacity: 0;
      }
      .flash-overlay {
        position: absolute; top: 0; left: 0;
        width: 1080px; height: 1920px;
        background: #fff; opacity: 0; z-index: 100; pointer-events: none;
      }
      .leak-overlay {
        position: absolute; width: 1600px; height: 2400px;
        border-radius: 50%; opacity: 0; z-index: 99; pointer-events: none;
      }
      #leak-warm { top: -200px; left: -200px; background: radial-gradient(circle, rgba(var(--accent-rgb),0.6) 0%, rgba(10,10,10,0) 60%); }
      #leak-cool { bottom: -300px; right: -300px; background: radial-gradient(circle, rgba(var(--gold-rgb),0.4) 0%, rgba(10,10,10,0) 60%); }
      .deco-glow-orange {
        position: absolute; width: 700px; height: 700px; border-radius: 50%;
        background: radial-gradient(circle, rgba(var(--accent-rgb),0.12) 0%, rgba(10,10,10,0) 65%);
        top: -150px; right: -150px; z-index: 2; pointer-events: none;
      }
      .deco-glow-green {
        position: absolute; width: 600px; height: 600px; border-radius: 50%;
        background: radial-gradient(circle, rgba(var(--price-rgb),0.08) 0%, rgba(10,10,10,0) 65%);
        bottom: 150px; left: -100px; z-index: 2; pointer-events: none;
      }
      .shimmer-bar {
        position: absolute; top: 0; left: -200px;
        width: 100px; height: 1920px;
        background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0) 100%);
        z-index: 97; pointer-events: none; transform: skewX(-15deg);
      }
      .grain-overlay {
        position: absolute; top: 0; left: 0;
        width: 1080px; height: 1920px;
        z-index: 98; pointer-events: none; opacity: 0.035;
      }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${t.total}" data-width="1080" data-height="1920">
      <div id="flash-overlay" class="flash-overlay"></div>
      <div id="leak-warm" class="leak-overlay"></div>
      <div id="leak-cool" class="leak-overlay"></div>
      <div id="shimmer" class="shimmer-bar"></div>
      <svg class="grain-overlay" viewBox="0 0 1080 1920">
        <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/></filter>
        <rect width="100%" height="100%" filter="url(#grain)"/>
      </svg>

      <div id="scene1" class="scene">
        <img class="product-bg" id="s1-bg" src="${p.imgDataUri}" />
        <div class="vignette"></div>
        <div class="deco-glow-orange" id="s1-deco1"></div>
        <div class="scene-content">
          <div class="hook-badge" id="s1-badge">${badge}</div>
          <div class="hook-title" id="s1-title">${escapeHtml(p.hookText)}</div>
          <img class="hook-product-img" id="s1-product" src="${p.imgDataUri}" />
        </div>
      </div>

      <div id="scene2" class="scene">
        <img class="product-bg" id="s2-bg" src="${p.imgDataUri}" />
        <div class="vignette"></div>
        <div class="deco-glow-orange" id="s2-deco1"></div>
        <div class="scene-content">
          <div class="feature-product-wrap">
            <div class="feature-glow" id="s2-glow"></div>
            <div class="neon-ring" id="s2-neon"></div>
            <img class="feature-product-img" id="s2-product" src="${p.imgDataUri}" />
          </div>
          <div class="feature-name" id="s2-name">${escapeHtml(p.productName)}</div>
          <div class="feature-desc" id="s2-desc">${escapeHtml(p.featureDesc)}</div>
        </div>
      </div>

      <div id="scene3" class="scene">
        <img class="product-bg" id="s3-bg" src="${p.imgDataUri}" />
        <div class="vignette"></div>
        <div class="deco-glow-green" id="s3-deco"></div>
        <div class="scene-content">
          <div class="proof-icon" id="s3-icon">&#128293;</div>
          <div class="proof-number" id="s3-number">${escapeHtml(p.salesCount)}</div>
          <div class="proof-label" id="s3-label">vendidas este mes</div>
          <div class="proof-badge" id="s3-badge">MAIS VENDIDO</div>
          <div class="proof-stars" id="s3-stars">${stars}</div>
        </div>
      </div>

      <div id="scene4" class="scene">
        <img class="product-bg" id="s4-bg" src="${p.imgDataUri}" />
        <div class="vignette"></div>
        <div class="deco-glow-green" id="s4-deco"></div>
        <div class="scene-content">
          <div class="price-label" id="s4-label">Preco especial</div>
          <div class="price-value" id="s4-price">${escapeHtml(p.price)}</div>
          <div class="price-original" id="s4-original">${escapeHtml(p.originalPrice)}</div>
          <div class="price-discount" id="s4-discount">${escapeHtml(p.discount)}</div>
          <div class="price-urgency" id="s4-urgency">Ultimas unidades disponiveis</div>
        </div>
      </div>

      <div id="scene5" class="scene">
        <img class="product-bg" id="s5-bg" src="${p.imgDataUri}" />
        <div class="vignette"></div>
        <div class="deco-glow-orange" id="s5-deco1"></div>
        <div class="deco-glow-green" id="s5-deco2"></div>
        <div class="scene-content">
          <img class="cta-product-img" id="s5-product" src="${p.imgDataUri}" />
          <div class="cta-text" id="s5-text">Garanta a sua agora</div>
          <div class="cta-button" id="s5-button">COMPRAR <span class="cta-arrow" id="s5-arrow">&#8595;</span></div>
          <div class="cta-shopee-logo" id="s5-logo">Disponivel na Shopee</div>
        </div>
      </div>
${p.hasNarration ? '      <audio src="narration.mp3" data-start="0.3" data-duration="' + (t.total - 1) + '" data-volume="0.9" data-has-audio="true" class="clip"></audio>' : ''}
${p.hasBgMusic ? '      <audio src="bg-music.mp3" data-start="0" data-duration="' + t.total + '" data-volume="0.15" data-has-audio="true" class="clip"></audio>' : ''}
    </div>

    <script>
      window.__timelines = window.__timelines || {};
      var tl = gsap.timeline({ paused: true });

      // Timing constants
      var T1 = ${t.t1}, T2 = ${t.t2}, T3 = ${t.t3}, T4 = ${t.t4};
      var S2 = ${t.s2Start}, S3 = ${t.s3Start}, S4 = ${t.s4Start}, S5 = ${t.s5Start};
      var FADE_OUT = ${t.fadeOut}, TOTAL = ${t.total};

      tl.fromTo("#shimmer", { x: -200 }, { x: 1280, duration: ${t.shimmerDur}, ease: "power1.inOut", repeat: ${t.shimmerRepeats} }, 0);

      // SCENE 1 — Hook
      tl.fromTo("#s1-bg", { scale: 1.1 }, { scale: 1.2, duration: ${s1Dur + 0.5}, ease: "sine.inOut" }, 0);
      tl.fromTo("#s1-deco1", { scale: 0.8, opacity: 0 }, { scale: 1.3, opacity: 1, duration: ${s1Dur}, ease: "sine.inOut" }, 0);
      tl.from("#s1-badge", { y: -100, opacity: 0, scale: 0.7, duration: 0.5, ease: "back.out(2)" }, 0.15);
      tl.from("#s1-title", { y: 80, opacity: 0, duration: 0.6, ease: "power4.out" }, 0.4);
      tl.from("#s1-product", { scale: 0.4, opacity: 0, y: 150, duration: 0.8, ease: "back.out(1.4)" }, 0.7);
      tl.to("#s1-product", { y: -15, scale: 1.03, duration: ${Math.max(s1Dur - 1.6, 0.5)}, ease: "sine.inOut" }, 1.6);

      // T1 — Overexposure Flash
      tl.to("#scene1", { filter: "brightness(1.6)", scale: 1.03, duration: 0.2, ease: "power1.in" }, T1);
      tl.to("#scene1", { filter: "brightness(3.5)", scale: 1.06, duration: 0.2, ease: "power2.in" }, T1+0.2);
      tl.to("#flash-overlay", { opacity: 0.6, duration: 0.25, ease: "power1.in" }, T1+0.15);
      tl.to("#flash-overlay", { opacity: 1, duration: 0.15, ease: "power2.in" }, T1+0.4);
      tl.set("#scene1", { opacity: 0, filter: "brightness(1)", scale: 1 }, T1+0.55);
      tl.set("#scene1", { visibility: "hidden" }, T1+0.56);
      tl.set("#scene2", { opacity: 1 }, T1+0.55);
      tl.to("#flash-overlay", { opacity: 0, duration: 0.4, ease: "power2.out" }, T1+0.55);

      // SCENE 2 — Feature
      tl.fromTo("#s2-bg", { scale: 1.15 }, { scale: 1.25, duration: ${s2Dur}, ease: "sine.inOut" }, S2);
      tl.fromTo("#s2-neon", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1.1, duration: ${Math.min(s2Dur * 0.6, 1.5)}, ease: "sine.inOut", yoyo: true, repeat: 1 }, S2+0.1);
      tl.fromTo("#s2-glow", { scale: 0.6, opacity: 0 }, { scale: 1.4, opacity: 1, duration: ${s2Dur}, ease: "sine.inOut" }, S2);
      tl.from("#s2-product", { scale: 0.3, opacity: 0, rotation: -8, duration: 0.7, ease: "expo.out" }, S2+0.15);
      tl.to("#s2-product", { rotation: 4, y: -20, duration: ${Math.max(s2Dur - 1, 0.5)}, ease: "sine.inOut" }, S2+1);
      tl.from("#s2-name", { y: 60, opacity: 0, duration: 0.5, ease: "power3.out" }, S2+0.7);
      tl.from("#s2-desc", { y: 35, opacity: 0, duration: 0.4, ease: "power2.out" }, S2+1);
      tl.fromTo("#s2-deco1", { scale: 0.8, opacity: 0 }, { scale: 1.3, opacity: 1, duration: ${s2Dur}, ease: "sine.inOut" }, S2);

      // T2 — Light Leak
      tl.to("#leak-warm", { opacity: 0.6, x: 250, duration: 0.4, ease: "sine.inOut" }, T2);
      tl.to("#leak-cool", { opacity: 0.5, x: -200, duration: 0.5, ease: "sine.inOut" }, T2+0.05);
      tl.set("#scene2", { opacity: 0 }, T2+0.4);
      tl.set("#scene2", { visibility: "hidden" }, T2+0.41);
      tl.set("#scene3", { opacity: 1 }, T2+0.4);
      tl.to("#leak-warm", { opacity: 0, x: 500, duration: 0.4, ease: "power2.out" }, T2+0.45);
      tl.to("#leak-cool", { opacity: 0, x: -400, duration: 0.4, ease: "power2.out" }, T2+0.5);

      // SCENE 3 — Social Proof
      tl.fromTo("#s3-bg", { scale: 1.1 }, { scale: 1.2, duration: ${s3Dur}, ease: "sine.inOut" }, S3);
      tl.from("#s3-icon", { scale: 0, opacity: 0, rotation: -20, duration: 0.45, ease: "back.out(3)" }, S3+0.05);
      tl.from("#s3-number", { scale: 0.2, opacity: 0, duration: 0.7, ease: "elastic.out(1, 0.35)" }, S3+0.35);
      tl.fromTo("#s3-number",
        { textShadow: "0 0 80px rgba(var(--gold-rgb),0.5), 0 4px 20px rgba(0,0,0,0.5)" },
        { textShadow: "0 0 150px rgba(var(--gold-rgb),0.9), 0 4px 40px rgba(0,0,0,0.3)", duration: 1.0, ease: "sine.inOut", yoyo: true, repeat: 1 }, S3+0.8);
      tl.from("#s3-label", { y: 45, opacity: 0, duration: 0.4, ease: "power3.out" }, S3+0.7);
      tl.from("#s3-badge", { scale: 0.4, opacity: 0, duration: 0.5, ease: "back.out(2)" }, S3+1);
      tl.from("#s3-stars", { y: 35, opacity: 0, scale: 0.7, duration: 0.5, ease: "power2.out" }, S3+1.35);
      tl.fromTo("#s3-deco", { scale: 0.8, opacity: 0 }, { scale: 1.2, opacity: 1, duration: ${s3Dur}, ease: "sine.inOut" }, S3);

      // T3 — Zoom Through
      tl.to("#scene3", { scale: 2.8, opacity: 0, filter: "blur(10px)", duration: 0.4, ease: "power3.in" }, T3);
      tl.set("#scene3", { visibility: "hidden" }, T3+0.41);
      tl.fromTo("#scene4",
        { opacity: 0, scale: 0.4, filter: "blur(10px)" },
        { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.45, ease: "power3.out" }, T3+0.15);

      // SCENE 4 — Price
      tl.fromTo("#s4-bg", { scale: 1.15 }, { scale: 1.25, duration: ${s4Dur}, ease: "sine.inOut" }, S4);
      tl.from("#s4-label", { opacity: 0, y: -25, duration: 0.3, ease: "power2.out" }, S4+0.15);
      tl.from("#s4-price", { scale: 0.15, opacity: 0, duration: 0.8, ease: "elastic.out(1, 0.3)" }, S4+0.35);
      tl.fromTo("#s4-price",
        { textShadow: "0 0 100px rgba(var(--price-rgb),0.5), 0 4px 30px rgba(0,0,0,0.5)" },
        { textShadow: "0 0 180px rgba(var(--price-rgb),1), 0 4px 50px rgba(0,0,0,0.3)", duration: 0.7, ease: "sine.inOut", yoyo: true, repeat: 2 }, S4+0.9);
      tl.from("#s4-original", { x: -50, opacity: 0, duration: 0.4, ease: "power3.out" }, S4+0.8);
      tl.from("#s4-discount", { scale: 0.3, opacity: 0, rotation: -15, duration: 0.5, ease: "back.out(2.5)" }, S4+1.1);
      tl.from("#s4-urgency", { y: 35, opacity: 0, duration: 0.4, ease: "power2.out" }, S4+1.5);
      tl.fromTo("#s4-deco", { scale: 0.8, opacity: 0 }, { scale: 1.2, opacity: 1, duration: ${s4Dur}, ease: "sine.inOut" }, S4);

      // T4 — Blur Crossfade
      tl.to("#scene4", { filter: "blur(12px)", scale: 1.04, opacity: 0, duration: 0.5, ease: "power2.inOut" }, T4);
      tl.set("#scene4", { visibility: "hidden" }, T4+0.51);
      tl.fromTo("#scene5",
        { opacity: 0, filter: "blur(12px)", scale: 0.96 },
        { opacity: 1, filter: "blur(0px)", scale: 1, duration: 0.5, ease: "power2.inOut" }, T4+0.1);

      // SCENE 5 — CTA
      tl.fromTo("#s5-bg", { scale: 1.1 }, { scale: 1.2, duration: ${s5Dur}, ease: "sine.inOut" }, S5);
      tl.from("#s5-product", { y: 100, opacity: 0, scale: 0.6, duration: 0.6, ease: "back.out(1.6)" }, S5+0.05);
      tl.from("#s5-text", { y: 60, opacity: 0, duration: 0.5, ease: "power4.out" }, S5+0.4);
      tl.from("#s5-button", { scale: 0.3, opacity: 0, duration: 0.6, ease: "elastic.out(1, 0.45)" }, S5+0.65);
      tl.fromTo("#s5-arrow", { y: 0 }, { y: 14, duration: 0.35, ease: "power2.inOut", yoyo: true, repeat: 3 }, S5+1);
      tl.fromTo("#s5-button",
        { boxShadow: "0 8px 50px rgba(var(--accent-rgb),0.6)" },
        { boxShadow: "0 8px 100px rgba(var(--accent-rgb),1)", duration: 0.5, ease: "sine.inOut", yoyo: true, repeat: 1 }, S5+0.85);
      tl.from("#s5-logo", { opacity: 0, duration: 0.4, ease: "power1.out" }, S5+0.9);
      tl.fromTo("#s5-deco1", { scale: 0.8, opacity: 0 }, { scale: 1.2, opacity: 1, duration: ${s5Dur * 0.8}, ease: "sine.inOut" }, S5);
      tl.fromTo("#s5-deco2", { scale: 0.9, opacity: 0 }, { scale: 1.1, opacity: 1, duration: ${s5Dur}, ease: "sine.inOut" }, S5+0.2);
      tl.to("#scene5", { opacity: 0, duration: 0.8, ease: "power2.in" }, FADE_OUT);
      tl.set("#scene5", { visibility: "hidden" }, TOTAL);

      window.__timelines["main"] = tl;
    <\/script>
  </body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
