import type { ImageMetadata } from 'astro';
import { projects } from '~/data/projects';
import type { YearMonth } from '~/lib/timeline';

/**
 * The career story on the home page: milestones in order, each with the
 * skills it added. Scrolling through them drops those skills into a bucket;
 * a skill that comes back later grows, so the things I've worked on most
 * end up biggest. Every skill here is backed by a role, a degree or a repo.
 */
export interface Milestone {
  id: string;
  date: YearMonth;
  title: string;
  where: string;
  summary: string;
  skills: string[];
  /** A project screenshot, when the milestone is a project. */
  image?: ImageMetadata | undefined;
  brand?: { bg: string; accent: string } | undefined;
  link?: string | undefined;
}

const project = (slug: string) => projects.find((p) => p.slug === slug)!;
const fromProject = (slug: string, date: YearMonth, summary: string, skills: string[]): Milestone => {
  const p = project(slug);
  return {
    id: slug,
    date,
    title: p.name,
    where: 'Project',
    summary,
    skills,
    image: p.image,
    brand: p.brand,
    link: `/projects/${slug}/`,
  };
};

export const milestones: Milestone[] = [
  {
    id: 'credit-direct',
    link: '#credit-direct',
    date: '2019-11',
    title: 'IT intern',
    where: 'Credit Direct, Lagos',
    summary: 'My first job in tech, before moving to Canada for university.',
    skills: ['IT support'],
  },
  {
    id: 'york',
    link: '#york',
    date: '2020-09',
    title: 'Honours BSc, Computer Science',
    where: 'York University, Toronto',
    summary: 'Five years of computer science, from first Java programs to operating systems and databases.',
    skills: ['Java', 'Operating systems', 'Databases', 'Security'],
  },
  {
    id: 'loveworld',
    link: '#loveworld',
    date: '2021-09',
    title: 'Web developer, part-time',
    where: 'Believer’s LoveWorld',
    summary: 'Started maintaining the ReachOut World Day and ROCK Solid campaign websites alongside my degree.',
    skills: ['HTML and CSS', 'JavaScript', 'Accessibility'],
  },
  {
    id: 'payaza',
    link: '#payaza',
    date: '2025-11',
    title: 'Backend engineer',
    where: 'Payaza',
    summary: 'Java services for a payments platform: checkout, foreign-exchange rates, onboarding and back-office security.',
    skills: ['Java', 'Spring Boot', 'Spring Security', 'Hibernate (JPA)', 'PostgreSQL', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'GitHub Actions', 'JUnit 5'],
  },
  fromProject('linkify', '2026-08', 'Rebuilt my link shortener’s core in Spring Boot 4, with a Redis redirect cache and 244 tests.', [
    'Java',
    'Spring Boot',
    'Spring Security',
    'PostgreSQL',
    'Flyway',
    'Redis',
    'Testcontainers',
    'Docker',
    'GitHub Actions',
    'TypeScript',
    'Next.js',
    'Cloudflare Workers',
  ]),
  {
    id: 'uiuc',
    link: '#uiuc',
    date: '2026-08',
    title: 'Master of Computer Science',
    where: 'University of Illinois Urbana-Champaign',
    summary: 'Started the part-time master’s, beginning with Applied Machine Learning.',
    skills: ['Machine learning'],
  },
  fromProject('threadfern', '2026-09', 'A concurrent crawler in plain Java, with a bounded worker pool and polite pacing.', [
    'Java',
    'JDBC',
    'PostgreSQL',
    'Docker',
    'Node.js',
    'GitHub Actions',
  ]),
  fromProject('quickread', '2026-09', 'A study app whose Python engine runs in the browser, on Cloudflare Workers.', [
    'Python',
    'TypeScript',
    'React',
    'Cloudflare Workers',
  ]),
  fromProject('matchday-ml', '2026-09', 'Sports forecasts chosen by log loss and frozen at kickoff.', [
    'Python',
    'scikit-learn',
    'Machine learning',
    'TypeScript',
    'React',
    'Next.js',
    'Node.js',
    'SQLite',
    'Docker',
    'GitHub Actions',
  ]),
  fromProject('skyloom', '2026-09', 'A weather app with a ray-marched Three.js sky.', ['TypeScript', 'React', 'Three.js', 'GLSL', 'Cloudflare Workers']),
  fromProject('reelrank', '2026-09', 'A recommender trained on 32 million ratings that runs in the browser.', [
    'Python',
    'pandas',
    'SciPy',
    'scikit-learn',
    'Machine learning',
    'JavaScript',
    'GitHub Actions',
  ]),
  fromProject('hummle', '2026-10', 'Measuring open-source voice models before building a private read-aloud app.', [
    'Python',
    'PyTorch',
    'Whisper',
    'Machine learning',
  ]),
];
