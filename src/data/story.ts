import type { ImageMetadata } from 'astro';
import { stints } from '~/data/career';
import { projects } from '~/data/projects';
import { site } from '~/data/site';
import type { YearMonth } from '~/lib/timeline';

/**
 * The career story on the home page: milestones in order, each with the
 * skills it added. Scrolling through them drops those skills into a bucket;
 * a skill that comes back later grows, so the things I've worked on most
 * end up biggest. Projects appear where they really started and again when
 * they were rebuilt. Every skill here is backed by a role, a course, a
 * résumé or a repo.
 */
export interface Milestone {
  id: string;
  date: YearMonth;
  title: string;
  where: string;
  summary: string;
  skills: string[];
  /** For projects: whether this step started it or changed it. */
  kind?: 'Started' | 'Renamed' | 'Rebuilt' | undefined;
  /** A project screenshot, on the step that matches what the project looks like now. */
  image?: ImageMetadata | undefined;
  /** The organization's logo, when the milestone is a job or a degree. */
  logo?: ImageMetadata | undefined;
  brand?: { bg: string; accent: string } | undefined;
  link?: string | undefined;
}

const project = (slug: string) => projects.find((p) => p.slug === slug)!;

interface ProjectStep {
  id?: string;
  title?: string;
  kind?: Milestone['kind'];
  /** Earlier versions don't show today's screenshot. */
  current?: boolean;
}

const fromProject = (slug: string, date: YearMonth, summary: string, skills: string[], step: ProjectStep = {}): Milestone => {
  const p = project(slug);
  const current = step.current ?? true;
  return {
    id: step.id ?? slug,
    date,
    title: step.title ?? p.name,
    where: 'Project',
    summary,
    skills,
    kind: step.kind ?? 'Started',
    image: current ? p.image : undefined,
    brand: p.brand,
    link: `/projects/${slug}/`,
  };
};

/** A job or degree's logo, and its colour for the card's edge. */
const orgOf = (id: string) => {
  const stint = stints.find((s) => s.id === id);
  return { logo: stint?.logo, brand: stint?.brand ? { bg: stint.brand.bg, accent: stint.brand.fg } : undefined };
};

export const milestones: Milestone[] = [
  {
    id: 'credit-direct',
    link: '#credit-direct',
    ...orgOf('credit-direct'),
    date: '2019-11',
    title: 'IT intern',
    where: 'Credit Direct, Lagos',
    summary: 'My first job in tech, before moving to Canada for university: office IT, phones and the customer line.',
    skills: ['IT support', 'Customer service'],
  },
  {
    id: 'york',
    link: '#york',
    ...orgOf('york'),
    date: '2020-09',
    title: 'Honours BSc, Computer Science',
    where: 'York University, Toronto',
    summary: 'First year: Python, then Java with my first JUnit tests and Git repository, alongside calculus and linear algebra.',
    skills: ['Python', 'Java', 'JUnit', 'Git', 'Linear algebra'],
  },
  {
    id: 'loveworld',
    link: '#loveworld',
    ...orgOf('loveworld'),
    date: '2021-09',
    title: 'Web developer, part-time',
    where: 'Believer’s LoveWorld',
    summary: 'Started maintaining the ReachOut World Day and ROCK Solid campaign websites alongside my degree.',
    skills: ['HTML and CSS', 'JavaScript', 'Accessibility'],
  },
  {
    id: 'york-2',
    link: '#york',
    ...orgOf('york'),
    date: '2021-09',
    title: 'Second year',
    where: 'York University',
    summary:
      'Object-oriented Java, C and RISC-V assembly, and data structures from linked lists to red-black trees and graphs.',
    skills: ['Java', 'Object-oriented design', 'C', 'Assembly (RISC-V)', 'Data structures', 'Probability'],
  },
  {
    id: 'york-3',
    link: '#york',
    ...orgOf('york'),
    date: '2023-03',
    title: 'Third and fourth year',
    where: 'York University',
    summary:
      'Usability studies and database design, then operating systems (scheduling, deadlock, virtual memory) and computer security and cryptography.',
    skills: ['Usability testing', 'Databases', 'Operating systems', 'Security'],
  },
  {
    id: 'first-projects',
    link: '/projects/quickread/',
    date: '2024-01',
    title: 'Text Summarizer and Movie Finder',
    where: 'My first projects',
    kind: 'Started',
    summary:
      'A text summarizer in Python and Flask with NLTK, the start of QuickRead, and a React app that searches films through the OMDb API.',
    skills: ['Python', 'Flask', 'NLTK', 'JavaScript', 'HTML and CSS', 'React', 'REST APIs'],
  },
  {
    id: 'york-4',
    link: '#york',
    ...orgOf('york'),
    date: '2024-09',
    title: 'Final year, graduated April 2025',
    where: 'York University',
    summary:
      'Java web services with Servlets, JSP, JDBC and MySQL on Tomcat, an Android app built by a team in Git, and database internals: B+ tree and hash indexes.',
    skills: ['Java', 'Java EE', 'JDBC', 'MySQL', 'REST APIs', 'Tomcat', 'Android', 'Gradle', 'Git', 'Databases'],
  },
  fromProject(
    'quickread',
    '2025-08',
    'Text Summarizer became QuickRead: TF-IDF summaries in four styles with scikit-learn, from PDFs and Word files as well as text.',
    ['Python', 'scikit-learn', 'NLTK'],
    { id: 'quickread-2025', kind: 'Renamed', current: false },
  ),
  fromProject(
    'linkify',
    '2025-09',
    'The first Linkify: short links and QR codes, with a Next.js front end and a Spring Boot API secured with JWTs.',
    ['Next.js', 'TypeScript', 'Tailwind', 'Spring Boot', 'Spring Security', 'Hibernate (JPA)', 'JWT', 'PostgreSQL', 'Redis', 'AWS'],
    { id: 'linkify-2025', current: false },
  ),
  {
    id: 'payaza',
    link: '#payaza',
    ...orgOf('payaza'),
    date: '2025-11',
    title: 'Backend engineer',
    where: 'Payaza',
    summary: 'Java services for a payments platform: checkout, foreign-exchange rates, onboarding and back-office security.',
    skills: ['Java', 'Spring Boot', 'Spring Security', 'Hibernate (JPA)', 'PostgreSQL', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'GitHub Actions', 'JUnit 5'],
  },
  fromProject(
    'matchday-ml',
    '2026-03',
    'The first Matchday: live scores with an AI narrator, from a Spring Boot API, a Next.js site and a Python FastAPI service.',
    ['Java', 'Spring Boot', 'Next.js', 'Python', 'FastAPI', 'Redis', 'Docker'],
    { id: 'matchday-2026', title: 'Matchday', current: false },
  ),
  fromProject(
    'linkify',
    '2026-08',
    'Rebuilt the core in Spring Boot 4 with a Redis redirect cache and 244 tests, then shipped the live version on Cloudflare Workers with 1 GB file sharing.',
    ['Java', 'Spring Boot', 'PostgreSQL', 'Flyway', 'Redis', 'Testcontainers', 'Docker', 'GitHub Actions', 'Cloudflare Workers', 'Drizzle', 'Supabase'],
    { kind: 'Rebuilt' },
  ),
  {
    id: 'uiuc',
    link: '#uiuc',
    ...orgOf('uiuc'),
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
  fromProject(
    'quickread',
    '2026-09',
    'Rebuilt as a study app: the same Python engine now runs in the browser, on Cloudflare Workers.',
    ['Python', 'TypeScript', 'React', 'Next.js', 'Cloudflare Workers', 'Supabase'],
    { kind: 'Rebuilt' },
  ),
  fromProject(
    'matchday-ml',
    '2026-09',
    'Rebuilt as a forecaster: models chosen by log loss and frozen at kickoff, for four leagues.',
    ['Python', 'scikit-learn', 'Machine learning', 'TypeScript', 'React', 'Next.js', 'Node.js', 'SQLite', 'Docker', 'GitHub Actions'],
    { kind: 'Rebuilt' },
  ),
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
  {
    id: 'shelf',
    link: site.links.shelf,
    date: '2026-10',
    title: 'Gerald’s shelf',
    where: 'Project',
    kind: 'Started',
    summary: 'A tracker for my comics and LEGO, pre-orders and reading orders included, imported from my comic catalogue.',
    skills: ['Astro', 'TypeScript', 'Cloudflare Workers', 'Cloudflare D1', 'Three.js'],
  },
];
