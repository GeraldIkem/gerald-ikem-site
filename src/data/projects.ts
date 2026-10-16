import type { ImageMetadata } from 'astro';
import hummle from '~/assets/projects/hummle.png';
import linkify from '~/assets/projects/linkify.jpg';
import matchday from '~/assets/projects/matchday.png';
import quickread from '~/assets/projects/quickread.jpg';
import reelrank from '~/assets/projects/reelrank.jpg';
import skyloom from '~/assets/projects/skyloom-preview.jpg';
import threadfern from '~/assets/projects/threadfern-preview.jpg';

/** A project's own colours, taken from its live site. */
export interface Brand {
  bg: string;
  accent: string;
}

export interface Fact {
  value: string;
  label: string;
}

/** Something that was hard, what caused it and what fixed it. */
export interface Problem {
  title: string;
  problem: string;
  fix: string;
  result?: string;
}

export interface Section {
  title: string;
  body?: string[];
  points?: string[];
  problems?: Problem[];
  table?: { caption?: string; head: string[]; rows: string[][] };
  /** An interactive piece that lives on this project's page. */
  demo?: 'redirect' | 'rtf';
}

export interface Project {
  slug: string;
  name: string;
  url: string;
  linkText: string;
  status?: string;
  brand: Brand;
  image: ImageMetadata;
  imageAlt: string;
  /** One sentence for the home page list. */
  oneLine: string;
  /** Two short facts for the home page list. */
  highlights: [string, string];
  /** The opening paragraph of the project page. */
  intro: string;
  facts: Fact[];
  sections: Section[];
  limits: string[];
  next: string[];
  stack: string[];
}

export const projects: Project[] = [
  {
    slug: 'linkify',
    name: 'Linkify',
    url: 'https://uselinkify.com',
    linkText: 'uselinkify.com',
    brand: { bg: '#4b2fe6', accent: '#f2684b' },
    image: linkify,
    imageAlt: 'Linkify’s homepage: “Share the right thing. Learn what lands.” beside a card for creating a short link.',
    oneLine: 'Short links, QR codes and click analytics, built so that measuring a click never slows the redirect down.',
    highlights: ['Live on Cloudflare Workers, with 1 GB file sharing through S3', 'A Spring Boot 4 rewrite of the core with 244 tests'],
    intro:
      'Paste a URL, get a short one, share it, and see what happened to it. Linkify exists in two versions. The one live at uselinkify.com runs on Cloudflare Workers, with a Java core for large-file sharing. The second is a rewrite of the core in Java 21 and Spring Boot 4, where I worked through the redirect path, the analytics pipeline and the security properly. The rewrite is tested end to end but not deployed yet, and this page is clear about which version does what.',
    facts: [
      { value: '244', label: 'tests in the Spring Boot rewrite, with Postgres and Redis run for real in Testcontainers' },
      { value: '60 s', label: 'how long a missing short code is cached, so scans for codes don’t reach the database' },
      { value: '1 GB', label: 'largest file the live site uploads, in 16 MiB parts straight to S3' },
      { value: '0', label: 'IP addresses stored. Unique visitors come from a daily-rotating hash' },
    ],
    sections: [
      {
        title: 'Two versions, one product',
        points: [
          'Live at uselinkify.com: Next.js on Cloudflare Workers, D1 with Drizzle, Supabase Auth, and an optional Java 17 Spring Boot core that handles S3 multipart uploads, passcodes, click limits, activation dates, CSV import and profile pages.',
          'The rewrite: a modular Spring Boot 4.1 monolith on Java 21, organised by feature (auth, link, redirect, analytics, abuse) rather than by layer, with PostgreSQL 17 as the source of truth and Redis 7.4 for the redirect cache and rate limits. Accounts, links, cached redirects, analytics, QR codes, rate limiting, anonymous links and password reset all work; it just isn’t deployed yet.',
          'A modular monolith, not microservices: every module shares one database and one deployment, and splitting them would add network calls and distributed transactions to buy independence nothing needs yet.',
        ],
      },
      {
        title: 'The redirect path',
        body: [
          'A redirect is the request people actually feel, so it does as little as possible. It checks Redis, falls back to a six-column Postgres projection with no joins, answers with a 302, and hands the click to a background worker. Pick a case below to see the path it takes.',
        ],
        demo: 'redirect',
        points: [
          'Hits are cached for an hour, capped at the link’s own expiry, and the expiry is re-checked on every hit, so a stale cache can never keep an expired link alive.',
          'The cache entry is evicted after the transaction commits, so a read racing an edit can’t put the old row back. Title-only edits don’t evict at all.',
          'Any Redis error counts as a miss. The instance reports itself not ready, so the load balancer drains it, but stays live, so a cache blip doesn’t become a restart storm.',
          '302, not 301: a permanent redirect is cached by browsers forever, so edits, disabled links and repeat clicks would all become invisible.',
        ],
      },
      {
        title: 'Analytics that can’t slow a click',
        problems: [
          {
            title: 'Recording a click on the request thread',
            problem: 'Parsing the user agent, classifying the referrer and writing two rows on every redirect would make the visitor wait for analytics.',
            fix: 'The handler only builds a small event. A bounded executor (2 to 4 threads, a 1,000-item queue) does the rest, and when the queue is full the event is dropped and counted rather than pushed back onto the request.',
          },
          {
            title: 'A transaction that silently wasn’t one',
            problem: 'Spring’s @Transactional does nothing when a bean calls its own method, so the click write ran without a transaction.',
            fix: 'The database write moved into its own ClickWriter bean, so Spring’s proxy wraps it.',
          },
          {
            title: 'Counting people without tracking them',
            problem: 'Unique visitors need to tell two visitors apart, not know who they are.',
            fix: 'The stored value is a SHA-256 of a per-process secret, the UTC date, the IP and the user agent. Because the date is in the hash, the same person hashes differently tomorrow, so the metric is honestly “unique per day”. Country comes from CDN headers, not a GeoIP lookup.',
          },
        ],
      },
      {
        title: 'Short codes and the race for a custom slug',
        points: [
          'Generated codes are 7 random Base62 characters from SecureRandom: 62⁷ is about 3.5 trillion codes, enough for roughly 111 years at 1,000 links a second.',
          'A collision is retried up to five times, each attempt in its own REQUIRES_NEW transaction, because a failed INSERT poisons the JPA session it ran in.',
          'Two people claiming the same custom slug at once are settled by a UNIQUE index: one wins, the other gets a 409. A test fires both claims behind a latch and repeats five times.',
          'Postgres char(n) and citext both failed Hibernate’s schema validation, so both became varchar with a CHECK constraint.',
        ],
      },
      {
        title: 'Accounts and security',
        points: [
          'Passwords use Argon2id at 19 MiB, two passes. I rejected 64 MiB: twenty concurrent logins would need about 1.3 GB, enough for an attacker to knock over a 512 MB container. Unknown emails are checked against a dummy hash so response time doesn’t reveal which accounts exist.',
          'The access token lives only in memory. The 30-day refresh token is stored hashed, sent in an HttpOnly SameSite=Strict cookie, rotated on every use, and replaying a used one revokes the whole session family.',
          'A Next.js route acts as a same-origin proxy, which keeps that cookie strict and avoids CORS entirely.',
          'The API never fetches the URLs people shorten, so there is no server-side request forgery to defend. Destinations are parsed, not prefix-matched, and javascript:, data: and file: are refused.',
        ],
        table: {
          caption: 'Each rate limit chooses how it fails when Redis is down',
          head: ['Action', 'Limit', 'If Redis fails'],
          rows: [
            ['Anonymous link', '5 an hour', 'Refuse: it’s the one open write'],
            ['Password reset request', '3 an hour', 'Refuse'],
            ['Log in', '20 per 15 minutes', 'Allow'],
            ['Register', '5 an hour', 'Allow'],
            ['Redeem reset link', '10 per 15 minutes', 'Allow'],
          ],
        },
      },
      {
        title: 'Large files on the live site',
        points: [
          'Uploads go straight from the browser to S3 in 16 MiB parts, up to 1 GB, so the server never carries the file.',
          'Each part URL is signed for 15 minutes and each download URL for 5. The part list and ETags are checked before an upload completes, and failed uploads are aborted so no half-files linger.',
          'Moving data from D1 into Postgres runs as a single, restart-safe transaction, and old salted SHA-256 passcodes are upgraded to bcrypt the first time someone enters them correctly.',
        ],
      },
      {
        title: 'How it’s tested',
        points: [
          '244 tests in the rewrite, with no failures or skips. Integration tests run against real PostgreSQL 17 and Redis 7.4 through Testcontainers, because an in-memory database would let SQL mistakes through.',
          'One suite runs with no Redis at all, which is harsher than a real outage. Another proves that replaying a used refresh token revokes every session in its family.',
          'The live version has 54 Node tests and 14 JUnit tests in CI, plus a manual browser checklist.',
        ],
      },
    ],
    limits: [
      'The rewrite isn’t deployed, and no performance numbers have been measured for it yet, so none are claimed.',
      'The rewrite has no email provider: in development the reset link is logged, elsewhere the mailer returns 503.',
      'Access tokens can’t be revoked before they expire; a 15-minute lifetime is the mitigation.',
    ],
    next: [
      'Deploy the rewrite and move the live site onto it.',
      'Password-protected and one-time links, custom domains and file sharing in the rewrite.',
      'A k6 load test comparing redirects with and without Redis, then Terraform for AWS.',
    ],
    stack: ['Java 21', 'Spring Boot 4.1', 'Spring Security', 'JPA and Flyway', 'PostgreSQL 17', 'Redis 7.4', 'Testcontainers', 'Next.js 16', 'TypeScript', 'Cloudflare Workers and D1', 'AWS S3', 'Docker', 'GitHub Actions'],
  },
  {
    slug: 'threadfern',
    name: 'Threadfern',
    url: 'https://threadfern.dev/demo',
    linkText: 'threadfern.dev',
    brand: { bg: '#251a33', accent: '#d9f27a' },
    image: threadfern,
    imageAlt: 'Threadfern’s public demo, showing a saved crawl of example.com with its status, depth and processing time.',
    oneLine: 'A concurrent web crawler and searchable metadata index, written in plain Java 17 with no framework.',
    highlights: ['Bounded worker pool, polite pacing and robots.txt rules', 'Each page and its links commit together or not at all'],
    intro:
      'Threadfern crawls a website within strict limits and keeps what it finds: page titles, URLs, status codes and the links between pages. You can start bounded crawls, search the results, check for broken links, revisit earlier runs and export them. The engine is plain Java 17 with no framework; the PostgreSQL JDBC driver is its only runtime dependency. A public demo lets anyone look around without signing in.',
    facts: [
      { value: '2.95×', label: 'faster with concurrent workers when the server is slow, in a 13-page microbenchmark' },
      { value: '1.00×', label: 'no gain when the polite delay between requests is what limits speed' },
      { value: '1', label: 'runtime dependency: the JDBC driver' },
      { value: '500 ms', label: 'minimum gap between requests to a site, retries and robots.txt included' },
    ],
    sections: [
      {
        title: 'How the engine is put together',
        points: [
          'Small classes with one job each: a coordinator (Crawler), a Fetcher on java.net.http, Robots, URL normalisation, an HTML parser, JDBC persistence, and account-scoped web commands.',
          'A small Node bridge starts the Java engine for each command with a 192 MB heap and streams its output as newline-delimited JSON to the website.',
          'Pages are keyed by crawl and URL, and links by crawl, source and target, with a foreign key back to pages.',
        ],
      },
      {
        title: 'Concurrency that stays bounded',
        body: [
          'The pool is a ThreadPoolExecutor whose core and maximum sizes are equal, fed from an ArrayBlockingQueue the same size as the pool. The coordinator submits one breadth-first batch at a time, no bigger than the pool, and it alone touches the visited set, the frontier and the database connection. That gives up some peak throughput in exchange for scheduling you can reason about: no unbounded queues, and no shared mutable state between workers.',
        ],
        table: {
          caption: 'Microbenchmark: 13 pages, depth 1, three trials, Java 17',
          head: ['Situation', 'One worker', 'Concurrent', 'Speed-up'],
          rows: [
            ['Server takes 120 ms to answer', '2,167 ms', '735 ms', 'about 2.95×'],
            ['An 80 ms polite delay dominates', 'n/a', 'n/a', 'about 1.00×'],
          ],
        },
      },
      {
        title: 'Being a good guest on someone else’s site',
        points: [
          'Every request to a site, including robots.txt and retries, passes through one synchronized pacing gate.',
          'Retries back off exponentially. A 429 or 503 with Retry-After is recorded and never retried early.',
          'Responses larger than 2 MB are cancelled mid-download by a custom body subscriber.',
          'robots.txt support is a deliberately conservative subset of RFC 9309: if robots.txt can’t be read, crawling is refused, and a Crawl-delay over 60 seconds stops the run.',
          'Redirects go back into the frontier and use up a page slot and a depth level, which stops redirect loops without hidden requests.',
        ],
      },
      {
        title: 'Data that’s never half-written',
        problems: [
          {
            title: 'A page saved without its links',
            problem: 'If the process died between writing a page and writing its links, the index would be quietly wrong.',
            fix: 'Each page and its links are written in one JDBC transaction, rolled back on any SQLException. A test against real Postgres 17 checks the unique-violation path and the rollback.',
          },
          {
            title: 'Too many crawls at once across instances',
            problem: 'Per-account and global daily limits only work if every instance agrees on the count.',
            fix: 'Admission takes a Postgres advisory transaction lock, so instances queue rather than race. Runs that have gone quiet for 15 minutes are marked failed.',
          },
          {
            title: 'Stopping a crawl that’s running elsewhere',
            problem: 'The process doing the crawl may not be the one that received “stop”.',
            fix: 'Cancellation is a durable flag in the database that the coordinator checks between batches. A client disconnecting or the 10-minute deadline sets it too.',
          },
        ],
      },
      {
        title: 'Safe to put on the public internet',
        points: [
          'The crawler only talks to public addresses on ports 80 and 443: private, loopback, link-local, carrier-grade NAT and multicast ranges are refused, and the JVM DNS cache is pinned so a hostname can’t swap addresses mid-crawl.',
          'Online limits: depth up to 5, at most 100 pages and 8 workers, one active crawl per account, 10 runs per account and 30 overall per rolling day, and a 10-minute cap.',
          'Someone else’s crawl ID gets the same “Crawl not found” as one that doesn’t exist, so IDs can’t be probed.',
          'The account comes from the verified session, never from the browser, and email verification is checked server-side before every crawl.',
          'CSV exports prefix formula-like cells, so a hostile page title can’t run in a spreadsheet.',
        ],
      },
      {
        title: 'How it’s tested',
        points: [
          'A dependency-free test harness runs crawls against an in-process HTTP server and checks peak concurrency, pacing, page caps, retries and timeouts.',
          'Database tests run against real PostgreSQL 17. Account-isolation tests prove one account can’t run, list, export or stop another’s crawls.',
          'In CI, a Docker end-to-end test runs a crawl, restarts the web container and checks the results are still there.',
        ],
      },
    ],
    limits: [
      'Deliberately out of scope: a distributed queue, resuming crawls, full-text search, sitemaps, JavaScript rendering and refreshing robots.txt mid-run.',
      'The benchmark is a microbenchmark on 13 pages, and no automated browser testing has been done.',
      'Account deletion, retention rules, MFA and social sign-in aren’t built yet.',
    ],
    next: ['A custom email sender, account deletion and retention.', 'Distributed rate limits for sign-in, and egress rules at the infrastructure level.'],
    stack: ['Java 17', 'java.net.http', 'JDBC', 'PostgreSQL 17', 'Docker Compose', 'Node.js', 'Neon', 'Render', 'GitHub Actions'],
  },
  {
    slug: 'matchday-ml',
    name: 'Matchday ML',
    url: 'https://matchdayml.com',
    linkText: 'matchdayml.com',
    brand: { bg: '#16243c', accent: '#e8cc5a' },
    image: matchday,
    imageAlt: 'Matchday ML’s homepage, showing upcoming games with win, draw and loss probabilities.',
    oneLine: 'Win, draw and loss forecasts for the Premier League, La Liga, the NBA and the WNBA, each frozen at kickoff.',
    highlights: ['53.4% on 1,140 held-out Premier League games, against 43.2% for a baseline', 'Models chosen by log loss, with promotion rules written before fitting'],
    intro:
      'Matchday ML publishes pregame and live probabilities and keeps a permanent, timestamped record of what it said before every game, so anyone can check the model against what actually happened. It began in March 2026 as a different idea: an AI game narrator on Spring Boot and a language model. The version I shipped in September uses no language model at all. It’s a forecasting system that has to earn trust with its record.',
    facts: [
      { value: '53.4%', label: 'Premier League accuracy on 1,140 held-out games, against 43.2% for the prior baseline' },
      { value: '66.4%', label: 'NBA accuracy on 3,941 held-out games' },
      { value: '0.106', label: 'Premier League log-loss improvement over the baseline, 95% interval 0.083 to 0.130' },
      { value: '4', label: 'leagues with trained models, plus an exploratory Champions League view' },
    ],
    sections: [
      {
        title: 'How it works',
        points: [
          'Training happens offline in Python with scikit-learn. The chosen model’s parameters are exported, and the Next.js server evaluates them in Node, so serving needs no Python.',
          'A Python scheduler collects fixtures and results every five minutes and posts timestamped bundles to an authenticated endpoint. Live scoreboards are refreshed every 30 seconds by the Node server and the browser.',
          'Forecasts are saved at fixed checkpoints (a week ahead, the day before, confirmed lineups, and every 15 minutes near kickoff) and frozen once the game starts.',
          'It runs as Docker Compose (app, collector and Caddy) or as one Render service with a 1 GB disk and SQLite.',
        ],
      },
      {
        title: 'Modelling and evaluation',
        body: [
          'The Premier League model sees 39 features: Elo ratings, points per game over the last 5 and 10 matches, goals for and against, home and away form, the opponent’s strength, table position, rest days and whether a team was just promoted. Each date is scored before that day’s results are added, so nothing from the future leaks in.',
          'Candidates included logistic regression, random forests, gradient boosting, ensembles, time-weighted Poisson goal models and, for La Liga, CatBoost models on expected goals. Models are developed on the 2020/21 to 2022/23 seasons and judged once on 2023/24 to 2025/26, and they’re chosen by log loss, not accuracy, because a forecast should be honest about how sure it is.',
        ],
        table: {
          caption: 'Held-out results',
          head: ['League', 'Chosen model', 'Games', 'Accuracy', 'Log loss', 'Brier'],
          rows: [
            ['Premier League', 'Goals plus recent form', '1,140', '53.4%', '0.983', '0.586'],
            ['La Liga', 'Recent xG plus goals', '1,140', '53.6%', '0.968', '0.575'],
            ['NBA', 'Logistic plus boosting', '3,941', '66.4%', '0.608', '0.420'],
            ['WNBA', 'Logistic regression', '832', '66.8%', '0.613', '0.424'],
          ],
        },
        points: [
          'Results come with calibration, per-class scores and a paired bootstrap over blocks of dates (2,000 resamples), not just accuracy.',
          'A live model only replaces the old one if it beats it by at least 0.002 in log loss with a positive bootstrap lower bound, and that rule is written down before fitting. The Premier League and La Liga upgrades passed; the NBA and WNBA ones didn’t, so those leagues kept their models. The project notes that an earlier threshold wasn’t written down in advance.',
          'Exported models are checked against Python on 100 sample games per league, so Node and Python give the same numbers.',
        ],
      },
      {
        title: 'Running it for real',
        problems: [
          {
            title: 'The disk filled up',
            problem: 'On 19 September about 660 MB of context snapshots and 257 MB of checkpoints filled the 1 GB disk.',
            fix: 'Old records are compressed with gzip only when that saves at least 10%, each one checked byte for byte after a round trip, and nothing is deleted.',
          },
          {
            title: 'A data provider started refusing requests',
            problem: 'ESPN’s football date-range requests began returning HTTP 400.',
            fix: 'A bounded fallback asks one day at a time, and team-name aliases (Ipswich, Coventry, Deportivo) fail closed rather than guessing.',
          },
          {
            title: 'The same playoff game from two providers',
            problem: 'Duplicate games would have double-counted results.',
            fix: 'Games are de-duplicated across providers before they’re stored.',
          },
        ],
      },
    ],
    limits: [
      'The held-out seasons are a reused benchmark, and only a handful of games had genuine saved pregame forecasts at launch, so the live record is still short.',
      'Draws are almost never predicted (0 of 279 in the Premier League holdout), and 2025/26 Premier League accuracy so far is 48.7%.',
      'Injuries, lineups and trades aren’t in the models yet, and the Champions League model is exploratory, not a validated classifier.',
    ],
    next: ['Repair the historical data first, then try a Dixon–Coles model.', 'Player-impact and minutes features for basketball, and full play-by-play live models.', 'A forward test that judges the models only on games after they were frozen.'],
    stack: ['Python', 'scikit-learn', 'CatBoost', 'Next.js', 'React', 'TypeScript', 'Node.js', 'SQLite', 'Drizzle', 'Docker', 'Caddy', 'Render', 'GitHub Actions'],
  },
  {
    slug: 'reelrank',
    name: 'ReelRank',
    url: 'https://www.reelrank.dev',
    linkText: 'reelrank.dev',
    brand: { bg: '#15131f', accent: '#d4f05a' },
    image: reelrank,
    imageAlt: 'ReelRank’s home page: “What’s on tonight?” with a search for films you love and community favourites.',
    oneLine: 'Film recommendations from the films you love, computed entirely in your browser.',
    highlights: ['EASE beat popularity by 56.7% on NDCG@10 over MovieLens 32M', 'Browser and Python rankings match exactly on 12 reference cases'],
    intro:
      'ReelRank recommends films from the ones you already love. It compares three approaches (popularity, content similarity and EASE collaborative filtering) trained offline on 32 million MovieLens ratings, then runs the chosen model in your browser. There’s no server and no account; your lists stay on your device.',
    facts: [
      { value: '+56.7%', label: 'NDCG@10 for EASE over popularity: 0.1118 against 0.0713' },
      { value: '32M', label: 'MovieLens ratings, split by time rather than at random' },
      { value: '1.1e-16', label: 'largest score difference between the browser and Python on 12 reference cases' },
      { value: '0', label: 'servers. Ranking runs in your browser' },
    ],
    sections: [
      {
        title: 'Measuring it fairly',
        points: [
          'The split is chronological: train on ratings before 2022, validate on 2022, and test on January to October 2023, so the model never sees the future it’s judged on.',
          '500 test users (seed 42) are ranked against the full pool of 2,300 candidate films, with no negative sampling to flatter the numbers.',
          'EASE’s regularisation was chosen on the validation year (λ = 1000), and the gap to popularity comes with a paired bootstrap 95% interval of 0.026 to 0.055.',
        ],
        table: {
          caption: 'Test results, top 10 recommendations',
          head: ['Approach', 'Precision', 'Recall', 'NDCG', 'MRR', 'Coverage'],
          rows: [
            ['Popularity', '0.060', '0.039', '0.071', '0.143', '0.077'],
            ['Content similarity (TF-IDF)', '0.015', '0.011', '0.020', '0.055', '0.210'],
            ['EASE', '0.083', '0.077', '0.112', '0.233', '0.261'],
          ],
        },
      },
      {
        title: 'A result I didn’t keep',
        body: [
          'Using all of someone’s favourites instead of their latest 20 looked better (NDCG 0.1229 against 0.1118), but the 95% interval ran from slightly negative to positive, so I report it as not a reliable gain. The cap on favourites was removed anyway, because it wasn’t buying anything either.',
        ],
      },
      {
        title: 'Running a recommender in the browser',
        points: [
          'The browser downloads only the rows of the EASE matrix it needs, as Float32 files, and sums them in double precision. The content-similarity vectors stay sparse.',
          'Model files are split into parts with SHA-256 checksums and reassembled at build time.',
          'A parity check runs 12 reference profiles through both Python and JavaScript: identical top-10 lists, with the largest score difference about 1.1 × 10⁻¹⁶. Three of the twelve are empty-profile fallbacks.',
        ],
      },
      {
        title: 'Films newer than the dataset',
        points: [
          'MovieLens stops in 2023, so recent films come from a separate content model over genres, titles and TMDB synopses. A recent pick needs a cosine similarity of at least 0.08 and a shared genre.',
          'Metadata is joined on exact TMDB IDs with no fuzzy matching; the 23 that didn’t resolve were dropped rather than guessed, leaving 2,277 films.',
          'A daily job fetches and validates a fresh catalogue but only stages it; publishing is a deliberate step.',
        ],
      },
    ],
    limits: [
      'All results are offline: there’s no evaluation of brand-new users and no testing with real users yet.',
      'The recent-film blend hasn’t been benchmarked, and the trimmed catalogue favours established films.',
      'Lists live only in the browser’s local storage.',
    ],
    next: ['A held-out evaluation for recent films once later ratings exist.', 'A five-person usability round.', 'Publishing catalogue refreshes automatically.'],
    stack: ['Python', 'pandas', 'NumPy', 'SciPy', 'scikit-learn', 'JavaScript (ES modules)', 'Playwright', 'GitHub Actions', 'Vercel'],
  },
  {
    slug: 'quickread',
    name: 'QuickRead',
    url: 'https://usequickread.com',
    linkText: 'usequickread.com',
    brand: { bg: '#173d2e', accent: '#d6f36b' },
    image: quickread,
    imageAlt: 'QuickRead’s workspace: “Turn anything into understanding”, with an upload area for documents.',
    oneLine: 'Turns documents, web pages and recordings into summaries, cited answers and study cards you can check against the source.',
    highlights: ['One Python engine runs both a command-line tool and a browser worker', 'Every generated sentence must quote its source exactly'],
    intro:
      'QuickRead is a reading workspace. Bring in a document, a web page, pasted text or a recording, and it produces summaries, answers with citations, key concepts and study cards, each of which you can check against the original passage. Most of the work happens in your browser: extraction, OCR and speech transcription never leave your device.',
    facts: [
      { value: '244 → 25 ms', label: 'median for a repeated search over 8,001 passages, after caching the index' },
      { value: '1 GiB', label: 'upload limit, read in 16 MiB ranges so a tab doesn’t run out of memory' },
      { value: '4 h', label: 'recording limit, transcribed on your device one window at a time' },
      { value: '140', label: 'tests in the last release check: 114 JavaScript and 26 Python' },
    ],
    sections: [
      {
        title: 'How it works',
        points: [
          'Extraction runs in the browser with PDF.js, zip.js and Mammoth. Tesseract OCR runs only on pages with fewer than 12 words, which is how scanned pages give themselves away.',
          'Speech is transcribed on the device with a small Whisper model, after audio is decoded one window at a time and resampled to 16 kHz.',
          'Ranking and source mapping are a single Python engine with no third-party dependencies. The same file runs as a command-line tool and inside a Pyodide web worker.',
          'Summaries and answers are written by Qwen3-30B on Cloudflare Workers AI. Saved libraries use Supabase Auth with Cloudflare D1 for metadata and R2 for content.',
        ],
      },
      {
        title: 'Big files in a browser tab',
        problems: [
          {
            title: 'Running out of memory',
            problem: 'A 1 GB file can crash a tab if it’s read all at once, especially on phones.',
            fix: 'PDFs are read a page at a time in 16 MiB ranges, scans over 16 megapixels are refused, DOCX reads are capped, and the OCR canvas shrinks on low-memory devices.',
          },
          {
            title: 'Whisper inventing words',
            problem: 'On silence, speech models tend to “hear” filler text.',
            fix: 'Silent windows are detected and skipped before transcription.',
          },
          {
            title: 'Slow repeated searches',
            problem: 'Rebuilding the search index for every question was wasted work.',
            fix: 'Caching the index took a repeated query over 8,001 passages (about a million characters) from a 244 ms median to 25 ms, with identical results.',
          },
        ],
      },
      {
        title: 'Keeping the AI honest',
        points: [
          'Every generated sentence or study card must copy an exact quote from the passage it cites. If any citation doesn’t match, or the answer was cut off, the whole response is rejected.',
          'A quote proves where a claim came from, not that the claim is right, and the app says so.',
          'Selected passages are sent to Workers AI for writing; the app states plainly that writing isn’t done on the device.',
        ],
      },
      {
        title: 'Running on a free tier',
        points: [
          'Workers AI allows 10,000 units of compute a day. QuickRead reserves at most 8,000, with 20 requests per reader a minute and 80 a day.',
          'The limit is a global counter updated with a conditional SQL write, so every Worker instance agrees on what’s left.',
          'The counters store numbers, never content, and errors return fixed codes rather than echoing text.',
        ],
      },
      {
        title: 'Measuring retrieval, honestly',
        body: [
          'On a test set of 12 documents and 60 questions, QuickRead’s passage ranking scored 0.736 MRR@3 against 0.729 for a plain TF-IDF baseline. The 95% interval of the difference runs from −0.062 to 0.076, so that’s a tie, not a win. The question labels were drafted with AI help and still need a person to review them.',
        ],
        points: [
          'I rejected a rule that refused to answer when fewer than half the query words matched: it cut false answers from 6 to 3, but left 11 of 24 answerable questions empty.',
          'Fixing OCR line-wrapping, which had been turning wrapped lines into fake headings, raised MRR@3 from 0.736 to 0.767 on the regression set.',
          'I tried running embedding and drafting models in the browser and dropped them: one needed a 335 MB download and 1.6 GB of memory, another took over 100 seconds per answer on a CPU.',
        ],
      },
    ],
    limits: [
      'The 1 GB and 4-hour figures are enforced limits, not tested sizes: the largest tests so far were a 67,000-word text and short audio and video clips.',
      'OCR and reading rules are English-only for now.',
      'The retrieval labels need human review before the numbers mean much.',
    ],
    next: ['Review the labels, build a fresh held-out set, then test a small embedding model and a reranker.', 'Signed-in quality checks, longer recordings over HTTPS, and latency measurements.'],
    stack: ['TypeScript', 'React 19', 'Next.js 16', 'Python', 'Pyodide', 'Cloudflare Workers, D1, R2 and Workers AI', 'Supabase Auth', 'PDF.js', 'Tesseract.js', 'Transformers.js'],
  },
  {
    slug: 'hummle',
    name: 'Hummle',
    url: 'https://hummle.app',
    linkText: 'hummle.app',
    status: 'In progress',
    brand: { bg: '#1b1f2a', accent: '#f4d35e' },
    image: hummle,
    imageAlt: 'Hummle’s homepage: “Give every line a voice”, beside a page of text with one word highlighted.',
    oneLine: 'A private read-aloud app for your own PC, with expressive voices and no cloud. Right now, the work is proving the voice engine.',
    highlights: ['Every engine generates speech faster than real time on one GPU', 'Quality checked by code, not by ear: word accuracy, voice identity, accent'],
    intro:
      'Hummle will read your drafts, the web pages you choose and long web novels aloud on your own computer, in voices that stay consistent and work out their delivery from the prose, with no tags and nothing sent to a cloud. There’s no app yet. Before building one, I’m proving the voice engine can carry it, and most of that work has been measuring things that are easy to get wrong by ear.',
    facts: [
      { value: '0.21–0.35', label: 'real-time factor with GGUF models on Vulkan: a minute of speech in 13 to 21 seconds' },
      { value: '0.57 → 0.86', label: 'worst-case voice similarity before and after fixing how the reference audio was resampled' },
      { value: '24%', label: 'how often an emotion classifier agreed with my blind ratings, so it was dropped as a quality gate' },
      { value: '5', label: 'engine configurations across four open-source model families, benchmarked on one AMD GPU' },
    ],
    sections: [
      {
        title: 'What I’m building',
        points: [
          'One core service on 127.0.0.1 owns documents, jobs and a SQLite database. Speech, the director model and the checks each run as separate worker processes, so a crash in one can’t lose your work.',
          'One model sits on the GPU at a time, and the integrated GPU is refused outright.',
          'A browser extension pairs once and then calls the core directly. Native messaging was ruled out because it starts a process per connection and caps replies at 1 MB.',
          'A voice is defined by frozen reference clips, not by any one engine, so engines can change without voices changing.',
        ],
      },
      {
        title: 'Proving the engine first',
        body: [
          'I benchmarked five configurations of four open-source text-to-speech families (VoxCPM2, IndexTTS-2.5, Qwen3 TTS in its Base and VoiceDesign forms, and Chatterbox Turbo) on an AMD RX 7900 XTX. Quantised GGUF models on Vulkan were the only path where every engine ran faster than real time without fighting the ROCm drivers.',
        ],
        demo: 'rtf',
        points: [
          'The finalists ran at 0.75 to 1.0 on ROCm PyTorch, and Qwen3 at 1.8 to 2.4. Running under WSL2 hung on the first GPU kernel.',
          'I kept 8-bit (q8_0) over bf16: bf16 was slower (0.40 against 0.35), used 1.9 GB more memory and took 13 seconds to load against 4. Seed-for-seed runs matched bit for bit, which ruled quantisation out as the cause of any quality problem.',
          'Every take is checked automatically: whisper.cpp transcribes it, and a take only counts as clean with zero word errors, against a target of 95% clean over 20 passages read three times each. Chatterbox failed at 78% and 85% and was dropped.',
        ],
      },
      {
        title: 'Problems that only showed up when measured',
        problems: [
          {
            title: 'The voice changed on emotional lines',
            problem: 'Speaker similarity dropped whenever a line carried emotion.',
            fix: 'The Windows build of the engine had no high-quality resampler, so the 48 kHz reference was resampled linearly before a 16 kHz encoder. Pre-resampling it properly fixed it.',
            result: 'Worst-case similarity went from 0.57 to 0.86, and the average from 0.75 to 0.89.',
          },
          {
            title: 'American narrators sounding British',
            problem: 'The narrators drifted towards a British accent.',
            fix: 'An accent-ID model labelled the references “England” with zero probability of North America, and a Praat measure of the American r tripled once the prompt said “General American”. The cause was the wording of the voice-design prompt.',
          },
          {
            title: 'Hiss baked into the reference clips',
            problem: 'Background noise in the references was being copied into every take.',
            fix: 'DeepFilterNet3 noise reduction, capped at 12 dB, plus a soft gate kept the voices 0.95 to 0.98 similar to the originals.',
            result: 'All 72 later takes were free of static.',
          },
          {
            title: 'A judge that couldn’t judge',
            problem: 'I wanted an automatic check that emotion came through.',
            fix: 'An emotion classifier agreed with my blind ratings on only 4 of 17 clips, so it became advisory rather than a gate.',
          },
        ],
      },
    ],
    limits: [
      'The emotion target isn’t met yet: in a blind test I recognised the intended emotion in 3 of 14 clips, against a goal of 80%.',
      'One of the two voices passed a blind check (4.0 out of 5); the other scored about 3 and isn’t ready.',
      'There’s no app yet, and no offline, network-unplugged run has been recorded.',
    ],
    next: ['Fix the second voice, then finish the expression tests and the blind pass bar: emotion at least 80%, identity at least 0.80.', 'Then the Studio, the Reader and browser extension, the director, long-form reading and a desktop app in Tauri.'],
    stack: ['Python', 'audio.cpp (GGUF on Vulkan)', 'whisper.cpp', 'PyTorch on ROCm', 'CAM++', 'DeepFilterNet3', 'Praat', 'librosa'],
  },
  {
    slug: 'skyloom',
    name: 'Skyloom',
    url: 'https://skyloom.app',
    linkText: 'skyloom.app',
    brand: { bg: '#2f4257', accent: '#f59e42' },
    image: skyloom,
    imageAlt: 'Skyloom showing Toronto at 19 degrees with drizzle, under an animated cloudy sky with an hourly timeline.',
    oneLine: 'A weather app where a Three.js sky changes with the hourly forecast.',
    highlights: ['A ray-marched sky that lowers its own quality on slow devices', 'Daylight-saving and time-zone edge cases covered by tests'],
    intro:
      'Skyloom pairs the forecast with a sky that matches it: clouds, rain and light change as you move through the hours ahead. Alongside it are rain and wind charts, radar, daylight and moon phases, official warnings and saved places. It needs no account, and the sky is described as what it is, an artistic interpretation of the data.',
    facts: [
      { value: '28 ms', label: 'frame-time budget; above it, the sky drops to cheaper settings on its own' },
      { value: '800', label: 'rain and snow particles on desktop, 350 on phones' },
      { value: '80/min', label: 'self-imposed radar limit, under the provider’s 100 per minute' },
      { value: '78', label: 'tests, including daylight-saving and midnight edge cases' },
    ],
    sections: [
      {
        title: 'How it’s put together',
        points: [
          'React 19 and TypeScript, with React Three Fiber for the scene: a full-screen shader ray-marches the clouds, and wind drives rain and snow particles on the GPU.',
          'Forecasts and city search come from Open-Meteo, postcodes from Photon and OpenStreetMap, radar from RainViewer, and official warnings from the WMO alert feeds. Sun and moon positions are calculated locally.',
          'It runs on Cloudflare Workers, with API routes validated by Zod.',
        ],
      },
      {
        title: 'A 3D sky that stays cheap',
        points: [
          'Pixel ratio starts at 1 on small screens and 1.25 elsewhere. If the first 120 frames average more than 28 ms, it drops to 0.75 and the cloud ray-march takes 12 steps instead of 20.',
          'The render loop stops when the sky is off screen or the tab is hidden.',
          'The WebGL code only loads after the forecast arrives, and only if motion is allowed. Reduced motion, no WebGL, a shader error or a lost GPU context all fall back to a static sky.',
        ],
      },
      {
        title: 'Problems with other people’s APIs',
        problems: [
          {
            title: 'Rate-limited through a shared server',
            problem: 'Open-Meteo returned HTTP 429 to the shared Worker, so everyone was being limited together.',
            fix: 'The browser now calls Open-Meteo directly and only falls back to the server on network failures. It never retries 401, 403 or 429 through the server, and it honours Retry-After, with a one-hour cooldown by default.',
          },
          {
            title: 'Old answers arriving late',
            problem: 'Switching places quickly could show the previous place’s forecast.',
            fix: 'Switching cancels earlier requests, and identical requests in flight share one call to the provider.',
          },
          {
            title: 'Time is harder than it looks',
            problem: 'Hours repeat when the clocks go back, and a forecast must be read in the place’s own time zone.',
            fix: 'Times are kept as Unix timestamps with the place’s IANA time zone, so repeated daylight-saving hours stay distinct.',
          },
        ],
      },
      {
        title: 'Small decisions that keep it honest',
        points: [
          'Switching between °C and °F happens on the device, so it never makes a network request, and missing values stay missing instead of becoming zero.',
          'The next-hour rain card hides when rain is below 0.025 mm per quarter-hour or the forecast is more than 15 minutes old.',
          'No warnings, or an empty radar, is shown as “nothing reported”, not as an all-clear.',
          'Location is opt-in. Places, units and the motion setting stay in the browser, and the last forecast is kept for at most six hours.',
        ],
      },
      {
        title: 'How it’s tested',
        points: [
          'About 78 tests cover daylight-saving and midnight, malformed and missing data, request sharing, unit conversion, postcode search and radar.',
          'CI type-checks, runs the tests, compiles the shaders for both WebGL versions, builds, and smoke-tests the built Worker. Real-device GPU checks are still manual.',
        ],
      },
    ],
    limits: [
      'The cache lives in each Worker instance, so it isn’t a real rate limiter under heavy traffic.',
      'Open-Meteo’s and RainViewer’s terms need a review before any commercial use.',
    ],
    next: ['A shared edge cache and rate limit for high traffic.', 'A hosted geocoder, and testing on more real devices.'],
    stack: ['React 19', 'TypeScript', 'Three.js', 'React Three Fiber', 'GLSL', 'Tailwind 4', 'Recharts', 'Leaflet', 'Zod', 'Cloudflare Workers'],
  },
];

export const projectBySlug = (slug: string) => projects.find((project) => project.slug === slug);
