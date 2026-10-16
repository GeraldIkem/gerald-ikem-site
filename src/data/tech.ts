import * as icons from 'simple-icons';
import { readableOn } from '~/lib/shelf';

/** Where a tool sits in a stack, from what you see down to what runs it. */
export type Layer = 'Interface' | 'Services' | 'Models' | 'Data' | 'Delivery' | 'Testing';
export const LAYERS: Layer[] = ['Interface', 'Services', 'Models', 'Data', 'Delivery', 'Testing'];

export interface Tech {
  name: string;
  /** Identity for counting usage, so "Java 21" and "Java 17" count as one tool. */
  key: string;
  layer: Layer;
  /** The tool's own brand colour where it has a logo. */
  color: string;
  text: string;
  /** SVG path of the logo on a 24×24 grid, or initials when there's no logo. */
  path?: string;
  initials: string;
}

type IconKey = keyof typeof icons;

/** First matching rule wins: [pattern, simple-icons key or null, layer, usage key]. */
const RULES: Array<[RegExp, IconKey | null, Layer, string?]> = [
  [/testcontainers/i, null, 'Testing'],
  [/playwright/i, null, 'Testing'],
  [/junit/i, 'siJunit5', 'Testing'],
  [/vitest/i, 'siVitest', 'Testing'],
  [/spring security/i, 'siSpringsecurity', 'Services'],
  [/spring boot|^spring$/i, 'siSpringboot', 'Services'],
  [/hibernate|jpa/i, 'siHibernate', 'Data'],
  [/flyway/i, 'siFlyway', 'Data'],
  [/kotlin/i, 'siKotlin', 'Services'],
  [/c\+\+|^c and c\+\+$/i, 'siCplusplus', 'Services'],
  [/jdbc/i, 'siOpenjdk', 'Services', 'jdbc'],
  [/java(?!script)/i, 'siOpenjdk', 'Services'],
  [/react three fiber|three\.js/i, 'siThreedotjs', 'Interface'],
  [/next\.js/i, 'siNextdotjs', 'Interface'],
  [/react/i, 'siReact', 'Interface'],
  [/typescript/i, 'siTypescript', 'Interface'],
  [/javascript/i, 'siJavascript', 'Interface'],
  [/tailwind/i, 'siTailwindcss', 'Interface'],
  [/html/i, 'siHtml5', 'Interface'],
  [/glsl|webgl/i, 'siOpengl', 'Interface'],
  [/leaflet/i, 'siLeaflet', 'Interface'],
  [/recharts/i, null, 'Interface'],
  [/pdf\.js|tesseract|pyodide/i, null, 'Interface'],
  [/transformers\.js|hugging ?face/i, 'siHuggingface', 'Models'],
  [/pytorch/i, 'siPytorch', 'Models'],
  [/scikit/i, 'siScikitlearn', 'Models'],
  [/whisper/i, null, 'Models', 'whisper'],
  [/catboost|cam\+\+|deepfilter|praat|librosa|audio\.cpp/i, null, 'Models'],
  [/pandas/i, 'siPandas', 'Models'],
  [/numpy/i, 'siNumpy', 'Models'],
  [/scipy/i, 'siScipy', 'Models'],
  [/python/i, 'siPython', 'Services'],
  [/node/i, 'siNodedotjs', 'Services'],
  [/zod/i, 'siZod', 'Services'],
  [/supabase/i, 'siSupabase', 'Services'],
  [/postgres/i, 'siPostgresql', 'Data'],
  [/redis/i, 'siRedis', 'Data'],
  [/^sql$/i, null, 'Data'],
  [/sqlite/i, 'siSqlite', 'Data'],
  [/drizzle/i, 'siDrizzle', 'Data'],
  [/neon/i, 'siNeon', 'Data'],
  [/s3/i, null, 'Data'],
  [/cloudflare/i, 'siCloudflareworkers', 'Delivery'],
  [/kubernetes/i, 'siKubernetes', 'Delivery'],
  [/docker/i, 'siDocker', 'Delivery'],
  [/caddy/i, 'siCaddy', 'Delivery'],
  [/github actions/i, 'siGithubactions', 'Delivery'],
  [/vercel/i, 'siVercel', 'Delivery'],
  [/render/i, 'siRender', 'Delivery'],
  [/aws/i, null, 'Delivery'],
];

/** Colours for tools without a logo, so their bricks still look like bricks. */
const PLAIN = ['#3f4a5a', '#5a4b3f', '#3f5a4f', '#4f3f5a'];

const initialsOf = (name: string) =>
  name
    .replace(/\(.*?\)/g, '')
    .split(/[\s.\-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');

export function techOf(name: string): Tech {
  const rule = RULES.find(([pattern]) => pattern.test(name));
  const layer = rule?.[2] ?? 'Services';
  const icon = rule?.[1] ? (icons[rule[1]] as { hex: string; path: string } | undefined) : undefined;
  const color = icon ? `#${icon.hex}` : PLAIN[name.length % PLAIN.length]!;
  const key = rule?.[3] ?? rule?.[1] ?? name.toLowerCase().replace(/\(.*?\)/g, '').replace(/[\d.]+$/, '').trim();
  return {
    name,
    key,
    layer,
    color,
    text: readableOn(color),
    ...(icon ? { path: icon.path } : {}),
    initials: initialsOf(name),
  };
}

/** Group a project's tools into stack layers, top (what you see) to bottom. */
export function layered(names: string[]): Array<{ label: string; items: Tech[] }> {
  const techs = names.map(techOf);
  return LAYERS.map((layer) => ({ label: layer, items: techs.filter((tech) => tech.layer === layer) })).filter(
    (group) => group.items.length > 0,
  );
}
