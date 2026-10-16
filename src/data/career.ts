import type { ImageMetadata } from 'astro';
import type { Axis, Span } from '~/lib/timeline';
import creditDirectLogo from '~/assets/orgs/credit-direct.png';
import payazaLogo from '~/assets/orgs/payaza.png';
import uiucLogo from '~/assets/orgs/uiuc.png';
import yorkLogo from '~/assets/orgs/york.png';

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
  /** The organization's logo and colours for its card. */
  logo?: ImageMetadata | undefined;
  brand?: { bg: string; fg: string } | undefined;
  /** Pictures of the work, where it is public. */
  shots?: Array<{ image: ImageMetadata; alt: string; caption: string; href?: string | undefined }> | undefined;
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
    logo: payazaLogo,
    brand: { bg: '#360e54', fg: '#58fa5a' },
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
      'Optimized images, caching and routing across the campaign sites so the most-visited pages load quickly.',
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
    logo: creditDirectLogo,
    brand: { bg: '#107ebc', fg: '#ffffff' },
    points: [
      'Helped colleagues with IT problems around the office.',
      'Set up the company’s smartphones for staff across the building.',
      'Answered customer calls, and learned how consumer loans work from the inside.',
    ],
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
    logo: uiucLogo,
    brand: { bg: '#ff5f05', fg: '#13294b' },
    points: [
      'Part-time, alongside my job at Payaza.',
      'Starting with Applied Machine Learning (CS 441), the first step toward the ML side of backend work.',
    ],
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
    logo: yorkLogo,
    brand: { bg: '#e31837', fg: '#ffffff' },
    points: [
      'Courses included design and analysis of algorithms, advanced object-oriented programming, software design, operating systems, databases and computer security.',
      'Built an Android app with a team for the Mobile User Interfaces research project; my part was the networking, privacy and security changes.',
      'Mentor in the Lassonde School of Engineering’s k2i outreach program, summer 2023.',
      'Wrote my first Java programs and JUnit tests in first year.',
    ],
  },
];
