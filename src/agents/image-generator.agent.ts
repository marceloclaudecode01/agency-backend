import axios from 'axios';
import { askGemini } from './gemini';

// Curated Unsplash image pools by content category
// Each array has high-quality, on-brand images that work for social media
const IMAGE_POOLS: Record<string, string[]> = {
  educativo: [
    'photo-1484480974693-6ca0a78fb36b', // notebook and pen
    'photo-1434030216411-0b793f4b4173', // study desk
    'photo-1456324504439-367cee3b3c32', // open book
    'photo-1513475382585-d06e58bcb0e0', // lightbulb idea
    'photo-1503676260728-1c00da094a0b', // education
    'photo-1522202176988-66273c2fd55f', // learning
    'photo-1529070538774-1843cb3265df', // brainstorm
    'photo-1552664730-d307ca884978', // team learning
    'photo-1488190211105-8b0e65b80b4e', // writing
    'photo-1471107340929-a87cd0f5b5f3', // desk workspace
  ],
  engajamento: [
    'photo-1529156069898-49953e39b3ac', // friends together
    'photo-1522071820081-009f0129c71c', // teamwork
    'photo-1517048676732-d65bc937f952', // group discussion
    'photo-1543269865-cbf427effbad', // people talking
    'photo-1528605248644-14dd04022da1', // community
    'photo-1491438590914-bc09fcaaf77a', // happy people
    'photo-1556761175-5973dc0f32e7', // engaged group
    'photo-1515169067868-5387ec356754', // conversation
    'photo-1531498860502-7c67cf02f657', // social interaction
    'photo-1506869640319-fe1a24fd76cb', // connection
  ],
  autoridade: [
    'photo-1460925895917-afdab827c52f', // data dashboard
    'photo-1551288049-bebda4e38f71', // analytics
    'photo-1504868584819-f8e8b4b6d7e3', // charts
    'photo-1526628953301-3e589a6a8b74', // professional
    'photo-1507679799987-c73779587ccf', // business leader
    'photo-1454165804606-c3d57bc86b40', // business analytics
    'photo-1553877522-43269d4ea984', // strategy
    'photo-1559136555-9303baea8ebd', // professional desk
    'photo-1486406146926-c627a92ad1ab', // corporate
    'photo-1444653614773-995cb1ef9efa', // data visualization
  ],
  bastidores: [
    'photo-1497032628192-86f99bcd76bc', // workspace
    'photo-1498050108023-c5249f4df085', // coding
    'photo-1521737604893-d14cc237f11d', // team office
    'photo-1522202176988-66273c2fd55f', // collaboration
    'photo-1517245386747-bb302d517a43', // creative process
    'photo-1553028826-f4804a6dba3b', // behind scenes
    'photo-1542744173-8e7e91415657', // work in progress
    'photo-1504384308090-c894fdcc538d', // creative work
    'photo-1519389950473-47ba0277781c', // tech workspace
    'photo-1600880292203-757bb62b4baf', // office life
  ],
};

// Topic-based image pools for more specific matching
const TOPIC_IMAGES: Record<string, string[]> = {
  produtividade: [
    'photo-1484480974693-6ca0a78fb36b',
    'photo-1483058712412-4245e9b90334',
    'photo-1432888498266-38ffec3eaf0a',
    'photo-1471107340929-a87cd0f5b5f3',
  ],
  financas: [
    'photo-1554224155-6726b3ff858f',
    'photo-1579621970563-ebec7560ff3e',
    'photo-1611974789855-9c2a0a7236a3',
    'photo-1526304640581-d334cdbbf45e',
  ],
  tecnologia: [
    'photo-1518770660439-4636190af475',
    'photo-1485827404703-89b55fcc595e',
    'photo-1526374965328-7f61d4dc18c5',
    'photo-1550751827-4bd374c3f58b',
  ],
  saude: [
    'photo-1544367567-0f2fcb009e0b',
    'photo-1571019613454-1cb2f99b2d8b',
    'photo-1506126613408-eca07ce68773',
    'photo-1545205597-3d9d02c29597',
  ],
  empreendedorismo: [
    'photo-1507679799987-c73779587ccf',
    'photo-1556761175-5973dc0f32e7',
    'photo-1559136555-9303baea8ebd',
    'photo-1573164713714-d95e436ab8d6',
  ],
  mindset: [
    'photo-1506905925346-21bda4d32df4',
    'photo-1470770841497-7b3200c47961',
    'photo-1469474968028-56623f02e42e',
    'photo-1507003211169-0a1dd7228f2d',
  ],
};

// Track recently used images to avoid repetition
let recentImages: string[] = [];
const MAX_RECENT = 30;

function buildUnsplashUrl(photoId: string): string {
  return `https://images.unsplash.com/${photoId}?w=1080&h=1080&fit=crop&q=80`;
}

function pickImage(pool: string[]): string {
  // Filter out recently used
  const available = pool.filter((id) => !recentImages.includes(id));
  const source = available.length > 0 ? available : pool;

  // Random pick
  const picked = source[Math.floor(Math.random() * source.length)];

  // Track usage
  recentImages.push(picked);
  if (recentImages.length > MAX_RECENT) {
    recentImages = recentImages.slice(-MAX_RECENT);
  }

  return picked;
}

function detectTopicPool(topic: string): string[] | null {
  const lower = topic.toLowerCase();
  for (const [key, pool] of Object.entries(TOPIC_IMAGES)) {
    if (lower.includes(key)) return pool;
  }
  // Check common keywords
  if (lower.match(/produti|hábito|rotina|tempo|organiz/)) return TOPIC_IMAGES.produtividade;
  if (lower.match(/dinheiro|finan|invest|econom|poup/)) return TOPIC_IMAGES.financas;
  if (lower.match(/tecno|ia|intelig|digital|app|futuro/)) return TOPIC_IMAGES.tecnologia;
  if (lower.match(/saúde|saude|mental|bem.estar|exerc|medita/)) return TOPIC_IMAGES.saude;
  if (lower.match(/empreend|negócio|negocio|startup|empresa/)) return TOPIC_IMAGES.empreendedorismo;
  if (lower.match(/mindset|mentalidade|cresci|supera|motiv/)) return TOPIC_IMAGES.mindset;
  return null;
}

export interface GeneratedImage {
  url: string;
  source: string;
}

export async function generateImageForPost(
  topic: string,
  category: string
): Promise<GeneratedImage> {
  // 1. Try topic-specific pool first
  const topicPool = detectTopicPool(topic);
  if (topicPool) {
    const photoId = pickImage(topicPool);
    return { url: buildUnsplashUrl(photoId), source: 'unsplash-topic' };
  }

  // 2. Fall back to category pool
  const categoryPool = IMAGE_POOLS[category] || IMAGE_POOLS.educativo;
  const photoId = pickImage(categoryPool);
  return { url: buildUnsplashUrl(photoId), source: 'unsplash-category' };
}

export async function generateImageWithAIPrompt(
  postMessage: string,
  category: string
): Promise<GeneratedImage> {
  // Use LLM to pick the best image topic, then map to pool
  try {
    const raw = await askGemini(
      `Based on this Facebook post, which ONE keyword best describes the visual theme? Choose from: produtividade, financas, tecnologia, saude, empreendedorismo, mindset

POST: "${postMessage.substring(0, 200)}"

Return ONLY the keyword, nothing else.`
    );
    const keyword = raw.trim().toLowerCase();
    const pool = TOPIC_IMAGES[keyword];
    if (pool) {
      const photoId = pickImage(pool);
      return { url: buildUnsplashUrl(photoId), source: 'unsplash-ai-matched' };
    }
  } catch {
    // Fallback silently
  }

  return generateImageForPost(postMessage, category);
}

// Try Pollinations.ai for AI-generated images (when available)
export async function generateAIImage(topic: string): Promise<GeneratedImage | null> {
  const prompt = `professional social media graphic about ${topic}, modern minimalist design, vibrant colors, no text overlay, high quality, square format`;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1080&height=1080&nologo=true&model=flux&seed=${Date.now()}`;

  try {
    const resp = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (resp.status === 200 && resp.data.byteLength > 10000) {
      // Upload to Cloudinary if available, otherwise use base64
      return { url, source: 'pollinations' };
    }
  } catch {
    // Pollinations unavailable, return null
  }

  return null;
}
