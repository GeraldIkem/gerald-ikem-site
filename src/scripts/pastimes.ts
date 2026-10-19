/**
 * The games on the Off the clock page: basketball, football, swimming and the
 * bookshelf, drawn by src/components/pastimes/. The physics and scoring live
 * in src/lib/pastimes.ts; this is the part that runs in the browser.
 */
import {
  COURT,
  PITCH,
  POOL,
  STEP,
  callFinish,
  callKick,
  callShot,
  clampAim,
  formatSeconds,
  keeperStart,
  kick,
  kickStopped,
  newRace,
  nextKickSpot,
  nextSpot,
  nudgeAim,
  parseBest,
  powerOf,
  restingBall,
  shoot,
  shotGone,
  stepKick,
  stepRace,
  stepShot,
  stroke,
  type Arm,
  type Ball,
  type Kick,
  type KickResult,
  type Race,
  type Shot,
  type Vec,
} from '~/lib/pastimes';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BEST_KEY = 'gerald-ikem:swim-best';
const motionOk = () => matchMedia('(prefers-reduced-motion: no-preference)').matches;
const fixed = (n: number) => n.toFixed(2);

/**
 * Calls `frame` on each animation frame, with the time since the last in seconds, for as long as it returns true.
 * The physics steps at a fixed rate, so a slow frame only means more steps; the cap stops a jump after a pause.
 */
function ticker(frame: (dt: number) => boolean) {
  let id = 0;
  let last = 0;
  const loop = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    id = frame(dt) ? requestAnimationFrame(loop) : 0;
  };
  return {
    start() {
      if (id) return;
      last = performance.now();
      id = requestAnimationFrame(loop);
    },
  };
}

/** A spray of process-ink dots: cyan, magenta and yellow, like the rest of the site. */
class Burst {
  readonly #group: SVGGElement | null;
  #dots: Array<{ el: SVGCircleElement; x: number; y: number; vx: number; vy: number; age: number; life: number }> =
    [];

  constructor(group: SVGGElement | null) {
    this.#group = group;
  }

  fire(x: number, y: number, angle: number, spread: number) {
    if (!this.#group || !motionOk()) return;
    for (let i = 0; i < 14; i++) {
      const el = document.createElementNS(SVG_NS, 'circle');
      el.setAttribute('r', (1.2 + Math.random() * 1.6).toFixed(1));
      el.setAttribute('class', `dot dot--${'cmy'[i % 3]}`);
      const a = angle + (Math.random() - 0.5) * spread;
      const speed = 50 + Math.random() * 110;
      this.#dots.push({ el, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, age: 0, life: 0.6 + Math.random() * 0.4 });
      this.#group.append(el);
    }
  }

  /** Move the dots on; true while any are left. */
  update(dt: number, gravity: number): boolean {
    this.#dots = this.#dots.filter((dot) => {
      dot.age += dt;
      dot.vy += gravity * dt;
      dot.x += dot.vx * dt;
      dot.y += dot.vy * dt;
      if (dot.age >= dot.life) {
        dot.el.remove();
        return false;
      }
      dot.el.setAttribute('cx', fixed(dot.x));
      dot.el.setAttribute('cy', fixed(dot.y));
      dot.el.setAttribute('opacity', fixed(1 - dot.age / dot.life));
      return true;
    });
    return this.#dots.length > 0;
  }
}

/** What every card shares: its stage, the big call over the drawing and the announcements. */
class Game {
  readonly card: HTMLElement;
  readonly stage: HTMLElement;
  readonly svg: SVGSVGElement;
  /** Set by any interaction, so the drawing stops playing by itself. */
  touched = false;
  readonly #live: HTMLElement | null;
  readonly #call: HTMLElement | null;
  #liveTimer = 0;
  #callTimer = 0;

  constructor(card: HTMLElement) {
    this.card = card;
    this.stage = card.querySelector<HTMLElement>('.pastime__stage')!;
    this.svg = this.stage.querySelector('svg')!;
    this.#live = card.querySelector('[data-live]');
    this.#call = card.querySelector('[data-call]');
  }

  /** Say it to screen readers. Cleared first, so the same result twice is still read out. */
  announce(text: string) {
    const live = this.#live;
    if (!live) return;
    clearTimeout(this.#liveTimer);
    live.textContent = '';
    this.#liveTimer = window.setTimeout(() => (live.textContent = text), 60);
  }

  /** Print a big call over the drawing for a moment; quiet calls are smaller and plain. */
  call(text: string, quiet = false) {
    const call = this.#call;
    if (!call) return;
    for (const span of call.children) span.textContent = text;
    call.classList.toggle('call--quiet', quiet);
    call.classList.remove('is-on');
    void call.getBoundingClientRect();
    call.classList.add('is-on');
    clearTimeout(this.#callTimer);
    this.#callTimer = window.setTimeout(() => call.classList.remove('is-on'), 1400);
  }

  /** A pointer position in the drawing's own units. */
  point(event: PointerEvent): Vec {
    const box = this.svg.getBoundingClientRect();
    return { x: ((event.clientX - box.left) / box.width) * 320, y: ((event.clientY - box.top) / box.height) * 170 };
  }

  restart(el: Element | null, name: string) {
    if (!el) return;
    el.classList.remove(name);
    void el.getBoundingClientRect();
    el.classList.add(name);
  }

  /** Called once when the card first scrolls into view. */
  invite() {}
}

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/**
 * The two ball games: drag from the ball to aim (direction and power) and let
 * go, or aim with the arrow keys and shoot with Space or Enter.
 */
abstract class BallGame extends Game {
  readonly ball: SVGGElement;
  readonly spin: SVGGElement | null;
  readonly burst: Burst;
  readonly #aim: SVGGElement | null;
  readonly #line: SVGPathElement | null;
  readonly #head: SVGPathElement | null;
  readonly #ring: SVGCircleElement | null;
  readonly maxPull: number;
  readonly radius: number;
  /** The current aim, kept between shots so the keyboard picks up where it left off. */
  aim: Vec;
  state: 'ready' | 'aiming' | 'flying' | 'resetting' = 'ready';
  demo = false;
  acc = 0;
  #pointer: number | null = null;
  #down: Vec = { x: 0, y: 0 };
  #moved = false;
  readonly tick = ticker((dt) => this.frame(dt));

  constructor(card: HTMLElement, maxPull: number, aim: Vec, radius: number) {
    super(card);
    this.maxPull = maxPull;
    this.aim = { ...aim };
    this.radius = radius;
    this.ball = this.svg.querySelector('[data-ball]')!;
    this.spin = this.svg.querySelector('[data-spin]');
    this.burst = new Burst(this.svg.querySelector('[data-burst]'));
    this.#aim = this.svg.querySelector('[data-aim]');
    this.#line = this.svg.querySelector('[data-aim-line]');
    this.#head = this.svg.querySelector('[data-aim-head]');
    this.#ring = this.svg.querySelector('[data-ring]');

    const hit = this.svg.querySelector('[data-hit]');
    hit?.addEventListener('pointerdown', (event) => this.#grab(event as PointerEvent));
    // Only a touch that starts on the ball is held; anywhere else the page scrolls as usual.
    hit?.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });
    // Pressing anywhere on the drawing while it plays by itself hands the ball over.
    this.stage.addEventListener('pointerdown', () => {
      this.touched = true;
      this.stopDemo();
    });
    this.stage.addEventListener('pointermove', (event) => this.#drag(event));
    this.stage.addEventListener('pointerup', (event) => this.#release(event));
    this.stage.addEventListener('pointercancel', (event) => this.#cancel(event));
    this.stage.addEventListener('keydown', (event) => this.#key(event));
    this.stage.addEventListener('focus', () => {
      this.touched = true;
      this.stopDemo();
      if (this.state === 'ready' && this.stage.matches(':focus-visible')) this.showAim();
    });
    this.stage.addEventListener('blur', () => {
      if (this.state === 'ready') this.hideAim();
    });
  }

  /** Where the ball sits waiting. */
  abstract get origin(): Vec;
  /** Set the ball off with this aim. */
  abstract launch(aim: Vec): void;
  /** Advance one frame; true while there's still something moving. */
  abstract frame(dt: number): boolean;
  /** Run the current attempt straight to its result (reduced motion). */
  abstract settle(): void;
  /** Drop the attempt in flight and put everything back where it waits. */
  abstract place(): void;

  override invite() {
    if (this.touched || this.state !== 'ready' || !motionOk()) return;
    this.fire(this.demoAim, true);
  }

  abstract get demoAim(): Vec;

  fire(aim: Vec, demo = false) {
    if (this.state !== 'ready' && this.state !== 'aiming') return;
    this.hideAim();
    this.state = 'flying';
    this.demo = demo;
    this.acc = 0;
    this.stage.classList.add('is-busy');
    this.launch(aim);
    if (motionOk()) this.tick.start();
    else this.settle();
  }

  /** The ball leaves, and comes back at its spot. */
  reset(instant = false) {
    this.state = 'resetting';
    const back = () => {
      this.place();
      this.ball.classList.remove('is-gone');
      this.state = 'ready';
      this.demo = false;
      this.stage.classList.remove('is-busy');
      if (document.activeElement === this.stage && this.stage.matches(':focus-visible')) this.showAim();
    };
    if (instant || !motionOk()) {
      back();
      return;
    }
    this.ball.classList.add('is-gone');
    window.setTimeout(back, 180);
  }

  stopDemo() {
    if (!this.demo) return;
    this.reset(true);
  }

  drawBall(ball: Ball) {
    this.ball.setAttribute('transform', `translate(${fixed(ball.x)} ${fixed(ball.y)})`);
    this.spin?.setAttribute('transform', `rotate(${ball.turn.toFixed(1)})`);
  }

  showAim(aim = this.aim) {
    const { x: ox, y: oy } = this.origin;
    const length = Math.hypot(aim.x, aim.y);
    const ux = length ? aim.x / length : 0;
    const uy = length ? aim.y / length : 0;
    const from = this.radius + 6;
    const tx = ox + aim.x;
    const ty = oy + aim.y;
    this.#line?.setAttribute('d', length > from ? `M${fixed(ox + ux * from)} ${fixed(oy + uy * from)}L${fixed(tx)} ${fixed(ty)}` : '');
    // A chevron at the tip.
    const bx = tx - ux * 6;
    const by = ty - uy * 6;
    this.#head?.setAttribute(
      'd',
      length > from ? `M${fixed(bx - uy * 4.5)} ${fixed(by + ux * 4.5)}L${fixed(tx)} ${fixed(ty)}L${fixed(bx + uy * 4.5)} ${fixed(by - ux * 4.5)}` : '',
    );
    this.#ring?.setAttribute('stroke-dasharray', `${(powerOf(aim, this.maxPull) * 100).toFixed(1)} 100`);
    this.#aim?.classList.add('is-on');
    this.ball.classList.add('is-aiming');
  }

  hideAim() {
    this.#aim?.classList.remove('is-on');
    this.ball.classList.remove('is-aiming');
  }

  #grab(event: PointerEvent) {
    this.touched = true;
    this.stopDemo();
    if (this.state !== 'ready' || event.button !== 0) return;
    this.#pointer = event.pointerId;
    this.#down = this.point(event);
    this.#moved = false;
    this.state = 'aiming';
    this.stage.setPointerCapture(event.pointerId);
    this.stage.classList.add('is-grabbing');
  }

  #drag(event: PointerEvent) {
    if (event.pointerId !== this.#pointer) return;
    const p = this.point(event);
    if (!this.#moved && Math.hypot(p.x - this.#down.x, p.y - this.#down.y) < 4) return;
    this.#moved = true;
    const { x, y } = this.origin;
    this.aim = clampAim({ x: p.x - x, y: p.y - y }, this.maxPull);
    this.showAim();
  }

  #release(event: PointerEvent) {
    if (event.pointerId !== this.#pointer) return;
    this.#drag(event);
    this.#pointer = null;
    this.stage.classList.remove('is-grabbing');
    // A tap, or barely a pull: nothing happens.
    if (!this.#moved || Math.hypot(this.aim.x, this.aim.y) < 14) {
      this.state = 'ready';
      this.hideAim();
      return;
    }
    this.fire(this.aim);
  }

  #cancel(event: PointerEvent) {
    if (event.pointerId !== this.#pointer) return;
    this.#pointer = null;
    this.stage.classList.remove('is-grabbing');
    this.state = 'ready';
    this.hideAim();
  }

  #key(event: KeyboardEvent) {
    const shootKey = event.key === ' ' || event.key === 'Enter';
    if (!shootKey && !ARROWS.includes(event.key)) return;
    event.preventDefault();
    this.touched = true;
    this.stopDemo();
    if (this.state !== 'ready') return;
    if (shootKey) {
      if (!event.repeat) this.fire(this.aim);
      return;
    }
    const next = nudgeAim(this.aim, event.key, this.maxPull, event.shiftKey ? 6 : 2);
    if (next) this.aim = next;
    this.showAim();
  }
}

class Hoops extends BallGame {
  spot: number = COURT.spots[0];
  shot: Shot | null = null;
  score = 0;
  streak = 0;
  readonly #shadow = this.svg.querySelector('[data-shadow]');
  readonly #net = this.svg.querySelector('[data-net]');
  readonly #score = this.card.querySelector('[data-score]');
  readonly #streak = this.card.querySelector('[data-streak]');

  constructor(card: HTMLElement) {
    super(card, COURT.maxPull, COURT.aim, COURT.ball);
  }

  override get origin() {
    return { x: this.spot, y: COURT.floor - COURT.ball };
  }

  override get demoAim() {
    return COURT.demo;
  }

  override launch(aim: Vec) {
    this.shot = shoot(this.spot, aim);
  }

  override frame(dt: number) {
    const shot = this.shot;
    let moving = false;
    if (shot && this.state === 'flying') {
      this.acc += dt;
      while (this.acc >= STEP) {
        const before = shot.result;
        stepShot(shot);
        if (!before && shot.result) this.decided(shot);
        this.acc -= STEP;
      }
      this.drawBall(shot.ball);
      const wait = shot.result?.made ? 1.2 : 0.9;
      if (shot.result && (shot.since > wait || shotGone(shot))) this.reset();
      else moving = true;
    }
    return this.burst.update(dt, 160) || moving;
  }

  override settle() {
    const shot = this.shot;
    if (!shot) return;
    while (!shot.result) stepShot(shot);
    this.decided(shot);
    this.drawBall(shot.ball);
    window.setTimeout(() => this.reset(), 1300);
  }

  override place() {
    this.shot = null;
    this.drawBall(restingBall(this.spot));
  }

  override drawBall(ball: Ball) {
    super.drawBall(ball);
    if (!this.#shadow) return;
    const height = COURT.floor - COURT.ball - ball.y;
    this.#shadow.setAttribute('cx', fixed(ball.x));
    this.#shadow.setAttribute('opacity', fixed(Math.max(0.15, 1 - height / 110)));
  }

  decided(shot: Shot) {
    const result = shot.result;
    if (!result || this.demo) return;
    if (result.made) {
      this.score += shot.points;
      this.streak += 1;
      this.spot = nextSpot(this.spot);
      this.call(`${shot.points} points`);
      this.restart(this.#net, 'is-swish');
      this.burst.fire(COURT.rim.back + 16, COURT.rim.y, -Math.PI / 2, Math.PI * 0.9);
    } else {
      this.streak = 0;
      this.call({ rim: 'Off the rim', glass: 'Off the glass', air: 'Air ball' }[result.miss], true);
    }
    if (this.#score) this.#score.textContent = String(this.score);
    if (this.#streak) this.#streak.textContent = String(this.streak);
    this.announce(callShot(result, shot.points, { score: this.score, streak: this.streak }));
  }
}

const KICK_CALLS: Record<KickResult, string> = {
  goal: 'Goal!',
  saved: 'Saved',
  post: 'Off the post',
  wide: 'Wide',
  out: 'Out',
  short: 'Not enough on it',
};

class Pitch extends BallGame {
  spot = 0;
  attempt = 0;
  keeper = keeperStart(0);
  play: Kick | null = null;
  goals = 0;
  shots = 0;
  readonly #keeper = this.svg.querySelector('[data-keeper]');
  readonly #net = this.svg.querySelector('[data-net]');
  readonly #goals = this.card.querySelector('[data-goals]');
  readonly #shots = this.card.querySelector('[data-shots]');

  constructor(card: HTMLElement) {
    super(card, PITCH.maxPull, PITCH.aim, PITCH.ball);
  }

  override get origin() {
    return PITCH.spots[this.spot] ?? PITCH.spots[0];
  }

  override get demoAim() {
    return PITCH.demo;
  }

  override launch(aim: Vec) {
    this.play = kick(this.origin, aim, this.keeper);
  }

  #drawKeeper(y: number) {
    this.#keeper?.setAttribute('transform', `translate(0 ${fixed(y - keeperStart(0))})`);
  }

  override frame(dt: number) {
    const play = this.play;
    let moving = false;
    if (play && this.state === 'flying') {
      this.acc += dt;
      while (this.acc >= STEP) {
        const before = play.result;
        stepKick(play);
        if (!before && play.result) this.decided(play);
        this.acc -= STEP;
      }
      this.drawBall(play.ball);
      this.#drawKeeper(play.keeper);
      const { x, y } = play.ball;
      const gone = x < -10 || x > 330 || y < -10 || y > 180;
      if (play.result && (gone || play.since > 1.4 || (play.since > 0.6 && kickStopped(play)))) this.reset();
      else moving = true;
    }
    return this.burst.update(dt, 0) || moving;
  }

  override settle() {
    const play = this.play;
    if (!play) return;
    while (!play.result) stepKick(play);
    this.decided(play);
    this.drawBall(play.ball);
    this.#drawKeeper(play.keeper);
    window.setTimeout(() => this.reset(), 1300);
  }

  override place() {
    if (!this.demo && this.play) {
      // After a goal the ball moves somewhere new; the keeper sets up again for every kick.
      if (this.play.result === 'goal') this.spot = nextKickSpot(this.spot);
      this.attempt += 1;
      this.keeper = keeperStart(this.attempt);
    }
    this.play = null;
    const { x, y } = this.origin;
    this.drawBall({ x, y, vx: 0, vy: 0, turn: 0 });
    this.#drawKeeper(this.keeper);
  }

  decided(play: Kick) {
    const result = play.result;
    if (!result || this.demo) return;
    this.shots += 1;
    if (result === 'goal') {
      this.goals += 1;
      this.call(KICK_CALLS.goal);
      this.restart(this.#net, 'is-ripple');
      this.burst.fire(PITCH.right + 2, play.ball.y, Math.PI, Math.PI * 1.1);
    } else {
      this.call(KICK_CALLS[result], true);
    }
    if (this.#goals) this.#goals.textContent = String(this.goals);
    if (this.#shots) this.#shots.textContent = String(this.shots);
    this.announce(callKick(result, this.goals, this.shots));
  }
}

function readBest(): number | null {
  try {
    return parseBest(localStorage.getItem(BEST_KEY));
  } catch {
    return null;
  }
}

function saveBest(time: number) {
  try {
    localStorage.setItem(BEST_KEY, String(time));
  } catch {
    // Private browsing or storage turned off: the best time lasts until the page closes.
  }
}

class Pool extends Game {
  race: Race = newRace();
  best = readBest();
  cooling = false;
  acc = 0;
  #idle = 0;
  readonly #swimmer = this.svg.querySelector<SVGGElement>('[data-swimmer]');
  readonly #wake = this.svg.querySelector('[data-wake]');
  readonly #time = this.card.querySelector('[data-time]');
  readonly #best = this.card.querySelector('[data-best]');
  readonly tick = ticker((dt) => this.frame(dt));

  constructor(card: HTMLElement) {
    super(card);
    this.#showBest();
    this.draw();
    const arms: Record<string, Arm> = { ArrowLeft: 'left', ArrowRight: 'right' };
    this.stage.addEventListener('keydown', (event) => {
      const arm = arms[event.key];
      if (!arm) return;
      event.preventDefault();
      if (!event.repeat) this.stroke(arm);
    });
    for (const pad of card.querySelectorAll<HTMLButtonElement>('[data-pad]')) {
      pad.addEventListener('click', () => this.stroke(pad.dataset['pad'] === 'right' ? 'right' : 'left'));
    }
  }

  stroke(arm: Arm) {
    this.touched = true;
    if (this.cooling) return;
    const starting = this.race.time === null;
    if (!stroke(this.race, arm)) return;
    if (starting) this.acc = 0;
    if (this.#swimmer) this.#swimmer.dataset['stroke'] = arm;
    this.restart(this.svg.querySelector(`[data-arm="${arm}"]`), 'is-pulling');
    this.restart(this.card.querySelector(`[data-pad="${arm}"]`), 'is-hit');
    clearTimeout(this.#idle);
    // Stop for long enough and the race is called off.
    this.#idle = window.setTimeout(() => this.#back(), 8000);
    this.tick.start();
  }

  frame(dt: number) {
    const race = this.race;
    if (race.finished || race.time === null) return false;
    this.acc += dt;
    while (this.acc >= STEP && !race.finished) {
      stepRace(race);
      this.acc -= STEP;
    }
    this.draw();
    if (race.finished) this.#finish();
    return !race.finished;
  }

  draw() {
    const race = this.race;
    this.#swimmer?.setAttribute('transform', `translate(${fixed(race.x)} ${POOL.lane})`);
    this.#wake?.setAttribute('opacity', fixed(Math.min(1, 0.25 + race.speed / 60)));
    if (this.#time) this.#time.textContent = formatSeconds(race.time ?? 0);
  }

  #showBest() {
    if (this.#best) this.#best.textContent = this.best === null ? '–' : formatSeconds(this.best);
  }

  #finish() {
    const time = this.race.time ?? 0;
    const before = this.best;
    clearTimeout(this.#idle);
    if (before === null || time < before) {
      this.best = time;
      saveBest(time);
      this.#showBest();
    }
    this.call(`${formatSeconds(time)} s`, before !== null && time >= before);
    this.announce(callFinish(time, before));
    this.cooling = true;
    this.#idle = window.setTimeout(() => this.#back(), 2000);
  }

  /** Back to the start wall for another go. */
  #back() {
    clearTimeout(this.#idle);
    const swimmer = this.#swimmer;
    const again = () => {
      this.race = newRace();
      this.cooling = false;
      this.draw();
      swimmer?.classList.remove('is-gone');
    };
    if (!swimmer || !motionOk()) {
      again();
      return;
    }
    this.cooling = true;
    swimmer.classList.add('is-gone');
    window.setTimeout(again, 220);
  }
}

class Books extends Game {
  readonly books: SVGRectElement[];
  current = 3;
  out: number | null = null;

  constructor(card: HTMLElement) {
    super(card);
    this.books = [...this.svg.querySelectorAll<SVGRectElement>('[data-book]')];
    this.books.forEach((book, i) => {
      book.addEventListener('click', () => {
        this.touched = true;
        this.#mark(i);
        this.toggle(i);
      });
    });
    this.#mark(this.current);
    this.stage.addEventListener('keydown', (event) => {
      const step = ({ ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 } as Record<string, number>)[event.key];
      const pull = event.key === ' ' || event.key === 'Enter';
      if (!step && !pull) return;
      event.preventDefault();
      this.touched = true;
      if (step) this.#mark(Math.min(this.books.length - 1, Math.max(0, this.current + step)));
      else this.toggle(this.current);
    });
  }

  #mark(i: number) {
    this.books[this.current]?.classList.remove('is-current');
    this.current = i;
    this.books[i]?.classList.add('is-current');
  }

  toggle(i: number, quiet = false) {
    const n = this.books.length;
    if (this.out === i) {
      this.books[i]?.classList.remove('is-out');
      this.out = null;
      if (!quiet) this.announce(`Book ${i + 1} is back on the shelf.`);
      return;
    }
    if (this.out !== null) this.books[this.out]?.classList.remove('is-out');
    this.out = i;
    this.books[i]?.classList.add('is-out');
    if (!quiet) this.announce(`Pulled out book ${i + 1} of ${n}.`);
  }

  override invite() {
    if (this.touched || !motionOk()) return;
    this.toggle(3, true);
    window.setTimeout(() => {
      if (!this.touched && this.out === 3) this.toggle(3, true);
    }, 1100);
  }
}

class PastimeCards extends HTMLElement {
  connectedCallback() {
    const games: Game[] = [];
    const make = (game: string, build: (card: HTMLElement) => Game) => {
      const card = this.querySelector<HTMLElement>(`[data-game="${game}"]`);
      if (card) games.push(build(card));
    };
    make('court', (card) => new Hoops(card));
    make('pitch', (card) => new Pitch(card));
    make('pool', (card) => new Pool(card));
    make('books', (card) => new Books(card));

    // Each drawing plays itself once as it scrolls into view, unless you got there first.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          games.find((game) => game.card === entry.target)?.invite();
        }
      },
      { threshold: 0.7 },
    );
    for (const game of games) observer.observe(game.card);
  }
}
customElements.define('pastime-cards', PastimeCards);
