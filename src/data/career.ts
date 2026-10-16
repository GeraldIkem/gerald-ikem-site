import type { Axis, Span } from '~/lib/timeline';

export type Track = 'work' | 'study';

export interface Stint extends Span {
  id: string;
  track: Track;
  org: string;
  role: string;
  place?: string;
  /** Short label for the timeline row. */
  short: string;
  points: string[];
}

export const axis: Axis = { start: '2019-09', end: '2028-08' };

export const stints: Stint[] = [
  {
    id: 'payaza',
    track: 'work',
    org: 'Payaza',
    role: 'Backend engineer',
    short: 'Payaza',
    start: '2025-11',
    points: [
      'Built a foreign-exchange rate module end to end in Java 17 and Spring Boot: buy and sell rates per currency pair, a change history you can filter by currency, and analytics endpoints that tie every rate to its source.',
      'Extended the checkout payment service with Redis-cached fee recalculation, rejection of duplicate payment references, rounding per currency and support for ZAR, AED and XAF. Replaced console output with structured, asynchronous logging.',
      'Secured MFA administration in the back office: TOTP soft-token provisioning, an API to switch MFA on or off, callers checked against the admin user store, and an audit entry for every privileged change.',
      'Found why MFA updates were silently reverting in a multi-tenant service: the re-read ran before a tenant was bound. Binding the tenant context first and forcing a transactional flush made the settings stick.',
      'Fixed three notification-settings defects (updates that reverted, came back blank or reached old recipients) and wrote the service’s first unit tests.',
      'Shipped merchant onboarding features: scheduled reminder emails, admin uploads of KYC documents on a business’s behalf, and country, currency and bank lookup APIs.',
    ],
  },
  {
    id: 'loveworld',
    track: 'work',
    org: 'Believer’s LoveWorld',
    role: 'Web developer, part-time',
    short: 'Believer’s LoveWorld',
    start: '2021-09',
    points: [
      'Maintain the ReachOut World Day and ROCK Solid campaign websites, improving form validation, accessibility, and the sign-up and donation flows.',
      'Adapted Linkify into the organization’s campaign-link tool, with branded short URLs, social previews and click tracking.',
    ],
  },
  {
    id: 'credit-direct',
    track: 'work',
    org: 'Credit Direct',
    role: 'IT intern',
    place: 'Lagos',
    short: 'Credit Direct',
    start: '2019-11',
    end: '2020-08',
    points: [],
  },
  {
    id: 'uiuc',
    track: 'study',
    org: 'University of Illinois Urbana-Champaign',
    role: 'Master of Computer Science, part-time',
    short: 'UIUC, MCS',
    start: '2026-08',
    end: '2028-05',
    expected: true,
    points: ['Coursework includes Applied Machine Learning (CS 441).'],
  },
  {
    id: 'york',
    track: 'study',
    org: 'York University',
    role: 'Honours BSc, Computer Science',
    place: 'Toronto',
    short: 'York, BSc',
    start: '2020-09',
    end: '2025-04',
    points: [],
  },
];

export const toolbox: Array<{ label: string; items: string[] }> = [
  { label: 'Languages', items: ['Java', 'Kotlin', 'Python', 'TypeScript', 'SQL', 'C++'] },
  { label: 'Backend', items: ['Spring Boot', 'Spring Security', 'Hibernate (JPA)', 'JDBC', 'Flyway', 'Node.js'] },
  { label: 'Data', items: ['PostgreSQL', 'Redis', 'SQLite'] },
  { label: 'Cloud and delivery', items: ['AWS', 'Docker', 'Kubernetes', 'GitHub Actions', 'Cloudflare Workers'] },
  { label: 'Testing', items: ['JUnit 5', 'Testcontainers'] },
  { label: 'Machine learning', items: ['PyTorch', 'scikit-learn', 'pandas', 'Hugging Face', 'Whisper'] },
];
