import type { ImageMetadata } from 'astro';
import hummle from '~/assets/projects/hummle.png';
import linkify from '~/assets/projects/linkify.jpg';
import quickread from '~/assets/projects/quickread.jpg';
import threadfern from '~/assets/projects/threadfern-preview.jpg';
import reelrank from '~/assets/projects/reelrank.jpg';
import skyloom from '~/assets/projects/skyloom-preview.jpg';

/** A project's own colours, taken from its live site. */
export interface Brand {
  bg: string;
  accent: string;
}

export interface Feature {
  id: string;
  name: string;
  brand: Brand;
  url: string;
  linkText: string;
  status?: string;
  summary: string;
  stack: string[];
  image: ImageMetadata;
  imageAlt: string;
  /** What was hard, in plain sentences. */
  notes: string[];
}

export const features: Feature[] = [
  {
    id: 'hummle',
    name: 'Hummle',
    brand: { bg: '#1b1f2a', accent: '#f4d35e' },
    url: 'https://hummle.app',
    linkText: 'hummle.app',
    status: 'In progress',
    summary:
      'A private read-aloud app that runs on your own computer: drafts, articles and web novels read by expressive voices, with nothing sent to a cloud. Before building the app, I am proving the voice engine can carry it.',
    stack: ['Python', 'PyTorch on ROCm', 'llama.cpp (GGUF)', 'Whisper', 'CAM++'],
    image: hummle,
    imageAlt: 'Hummle’s homepage: “Give every line a voice”, beside a page of text with one word highlighted.',
    notes: [
      'Benchmarked five open-source text-to-speech models on an AMD RX 7900 XTX, comparing q8_0 GGUF on Vulkan with PyTorch on ROCm.',
      'Built automatic quality gates instead of trusting my ears: Whisper checks every word across 60 takes per engine, and CAM++ speaker similarity checks the voice stays the same person.',
      'Traced a drop in voice identity during emotional lines to a linear resample of a 48 kHz reference. A proper 16 kHz resample raised the worst speaker similarity from 0.57 to 0.86.',
      'Caught narrators drifting into a British accent with an accent-ID model and a rhoticity measure in Praat, and traced it to the voice-design prompt. Dropped an emotion classifier as a gate after it agreed with blind human ratings only 24% of the time.',
    ],
  },
  {
    id: 'linkify',
    name: 'Linkify',
    brand: { bg: '#4b2fe6', accent: '#f2684b' },
    url: 'https://uselinkify.com',
    linkText: 'uselinkify.com',
    summary:
      'Short links with custom slugs, expiry, QR codes and click analytics, built so that measuring a click never slows the redirect down. It also powers the campaign links at Believer’s LoveWorld.',
    stack: ['Java 21', 'Spring Boot', 'PostgreSQL', 'Redis', 'Next.js', 'TypeScript'],
    image: linkify,
    imageAlt: 'Linkify’s homepage: “Share the right thing. Learn what lands.” beside a card for creating a short link.',
    notes: [
      'Clicks are recorded on a bounded background executor. When it is full, work is shed and counted rather than pushed back onto the redirect.',
      'Unique visitors are counted with a SHA-256 hash that includes the date, so no IP address is stored and nobody can be followed from one day to the next.',
      '244 tests, with integration tests on real PostgreSQL and Redis through Testcontainers. They prove that simultaneous claims on one custom slug produce exactly one winner, and that replaying a used refresh token revokes the whole session family.',
    ],
  },
  {
    id: 'quickread',
    name: 'QuickRead',
    brand: { bg: '#173d2e', accent: '#d6f36b' },
    url: 'https://usequickread.com',
    linkText: 'usequickread.com',
    summary:
      'A study app that turns documents, web pages and recordings into summaries, questions with sources and study cards. Answers quote the original text exactly, so you can check them.',
    stack: ['Python', 'Pyodide', 'React', 'TypeScript', 'Cloudflare Workers, D1 and R2', 'Supabase Auth'],
    image: quickread,
    imageAlt: 'QuickRead’s workspace: “Turn anything into understanding”, with an upload area for documents.',
    notes: [
      'One Python engine serves both a command-line tool and a Pyodide web worker, so text extraction, OCR for scanned PDFs and speech transcription run in the browser.',
      'Handles files up to 1 GB and recordings up to 4 hours.',
      'Compared passage retrieval against TF-IDF baselines on 60 labelled questions, using precision, recall and reciprocal rank.',
    ],
  },
];

export interface Smaller {
  name: string;
  brand: Brand;
  url: string;
  linkText: string;
  what: string;
  detail: string;
  stack: string;
  image?: ImageMetadata;
}

export const smaller: Smaller[] = [
  {
    name: 'Threadfern',
    brand: { bg: '#251a33', accent: '#d9f27a' },
    url: 'https://threadfern.dev/demo',
    linkText: 'threadfern.dev',
    what: 'A concurrent web crawler with a searchable index of what it finds.',
    detail: 'Bounded worker pool, robots.txt rules, request pacing, and page and link writes that commit together or not at all.',
    stack: 'Java 17, JDBC, PostgreSQL, Docker',
    image: threadfern,
  },
  {
    name: 'Matchday ML',
    brand: { bg: '#16243c', accent: '#e8cc5a' },
    url: 'https://matchdayml.com',
    linkText: 'matchdayml.com',
    what: 'Pregame win, draw and loss forecasts for the Premier League, La Liga, the Champions League, the NBA and the WNBA.',
    detail: '53.4% accuracy on a 1,140-match historical football test, with models compared on log loss, Brier score and calibration, not accuracy alone. Forecasts are timestamped and stored, so live predictions stay separate from backtests.',
    stack: 'Python, scikit-learn, SQLite, Docker, Next.js',
  },
  {
    name: 'ReelRank',
    brand: { bg: '#15131f', accent: '#d4f05a' },
    url: 'https://www.reelrank.dev',
    linkText: 'reelrank.dev',
    what: 'Film recommendations from the films you already love.',
    detail: 'EASE collaborative filtering beat a popularity baseline by 56.7% on NDCG@10 (0.1118 against 0.0713) over MovieLens 32M. The trained model runs in the browser and ranks identically to Python on 12 reference cases.',
    stack: 'Python, pandas, SciPy, JavaScript',
    image: reelrank,
  },
  {
    name: 'Skyloom',
    brand: { bg: '#2f4257', accent: '#f59e42' },
    url: 'https://skyloom.app',
    linkText: 'skyloom.app',
    what: 'A weather app whose sky changes with the hourly forecast.',
    detail: 'A Three.js sky driven by Open-Meteo data, with rain and wind charts, radar, moon phases and a reduced-motion mode.',
    stack: 'React, TypeScript, React Three Fiber, Cloudflare Workers',
    image: skyloom,
  },
  {
    name: 'This Is It 2.0 avatars',
    brand: { bg: '#7c2bbd', accent: '#ffd23f' },
    url: 'https://thisisitavatar.com',
    linkText: 'thisisitavatar.com',
    what: 'An avatar maker for This Is It 2.0, an event in Winnipeg in August 2026.',
    detail: 'Add a photo, frame it with pinch and drag, and export a share-ready image, all on the phone.',
    stack: 'React, TypeScript, Canvas, Netlify',
  },
];
