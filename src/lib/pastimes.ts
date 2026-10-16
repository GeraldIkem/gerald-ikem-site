/**
 * The physics and scoring behind the playable sports drawings on the Off the
 * clock page. Distances are in the drawings' own SVG units (each scene is 320
 * by 170) and time is in seconds. Everything steps at a fixed rate, so a shot
 * lands the same way whatever the frame rate.
 */

export const STEP = 1 / 240;

export interface Vec {
  x: number;
  y: number;
}

export interface Ball extends Vec {
  vx: number;
  vy: number;
  /** How far the ball has turned, in degrees, for drawing its spin. */
  turn: number;
}

const DEG = 180 / Math.PI;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Limit an aim (the drag from the ball) to the longest pull. */
export function clampAim(aim: Vec, max: number): Vec {
  const length = Math.hypot(aim.x, aim.y);
  if (length <= max) return { x: aim.x, y: aim.y };
  return { x: (aim.x / length) * max, y: (aim.y / length) * max };
}

/** Move the aim with an arrow key, the way the keyboard aims in both ball games. */
export function nudgeAim(aim: Vec, key: string, max: number, by = 2): Vec | null {
  const moves: Record<string, Vec> = {
    ArrowUp: { x: 0, y: -by },
    ArrowDown: { x: 0, y: by },
    ArrowLeft: { x: -by, y: 0 },
    ArrowRight: { x: by, y: 0 },
  };
  const move = moves[key];
  if (!move) return null;
  return clampAim({ x: aim.x + move.x, y: aim.y + move.y }, max);
}

/** How full the power ring is for an aim, from 0 to 1. */
export function powerOf(aim: Vec, max: number): number {
  return Math.min(1, Math.hypot(aim.x, aim.y) / max);
}

/** Push a ball out of a round obstacle (a rim, a post) and bounce it. True if they touched. */
function bounceOffPoint(ball: Ball, radius: number, px: number, py: number, pr: number, restitution: number): boolean {
  const dx = ball.x - px;
  const dy = ball.y - py;
  const distance = Math.hypot(dx, dy);
  const min = radius + pr;
  if (distance >= min || distance === 0) return false;
  const nx = dx / distance;
  const ny = dy / distance;
  ball.x = px + nx * min;
  ball.y = py + ny * min;
  const along = ball.vx * nx + ball.vy * ny;
  if (along < 0) {
    ball.vx -= (1 + restitution) * along * nx;
    ball.vy -= (1 + restitution) * along * ny;
  }
  return true;
}

/** Bounce a ball off a thick line segment (the backboard, the pole, the keeper's arms). */
function bounceOffSegment(
  ball: Ball,
  radius: number,
  a: Vec,
  b: Vec,
  half: number,
  restitution: number,
): boolean {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const t = clamp(((ball.x - a.x) * abx + (ball.y - a.y) * aby) / (abx * abx + aby * aby), 0, 1);
  return bounceOffPoint(ball, radius, a.x + abx * t, a.y + aby * t, half, restitution);
}

/* ------------------------------------------------------------------ */
/* Basketball: a side view, the hoop on the left.                      */
/* ------------------------------------------------------------------ */

export const COURT = {
  width: 320,
  floor: 132,
  ball: 9,
  board: { x: 20, top: 28, bottom: 72, half: 2.5 },
  rim: { y: 64, back: 22, front: 54, r: 2 },
  pole: [
    { x: 8, y: 132 },
    { x: 8, y: 44 },
    { x: 18, y: 44 },
  ],
  /** Shots from beyond this line are worth three. */
  three: 200,
  gravity: 380,
  maxPull: 110,
  /** Launch speed per unit of pull. */
  power: 3.8,
  /** The keyboard's starting aim: up and toward the hoop, a touch long. */
  aim: { x: -44, y: -70 },
  /** The shot the drawing plays by itself when it first comes into view. */
  demo: { x: -44, y: -64 },
  /** Where the ball waits: the first shot is always from the first spot. */
  spots: [168, 236, 126, 268, 150, 214, 104, 252],
} as const;

export type Miss = 'rim' | 'glass' | 'air';

export type ShotResult = { made: true; swish: boolean } | { made: false; miss: Miss };

export interface Shot {
  ball: Ball;
  time: number;
  points: 2 | 3;
  rim: boolean;
  glass: boolean;
  /** Set once the shot is decided: in, or past going in. */
  result: ShotResult | null;
  /** Seconds since the result, so the ball can finish its bounce before resetting. */
  since: number;
}

export function pointsFrom(x: number): 2 | 3 {
  return x > COURT.three ? 3 : 2;
}

export function restingBall(x: number): Ball {
  return { x, y: COURT.floor - COURT.ball, vx: 0, vy: 0, turn: 0 };
}

export function shoot(spotX: number, aim: Vec): Shot {
  const pull = clampAim(aim, COURT.maxPull);
  return {
    ball: { ...restingBall(spotX), vx: pull.x * COURT.power, vy: pull.y * COURT.power },
    time: 0,
    points: pointsFrom(spotX),
    rim: false,
    glass: false,
    result: null,
    since: 0,
  };
}

function miss(shot: Shot): ShotResult {
  return { made: false, miss: shot.rim ? 'rim' : shot.glass ? 'glass' : 'air' };
}

export function stepShot(shot: Shot, dt = STEP): void {
  const { ball } = shot;
  const r = COURT.ball;
  const { rim, board } = COURT;
  const before = ball.y;

  ball.vy += COURT.gravity * dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.turn += ((ball.vx * dt) / r) * DEG;
  shot.time += dt;
  if (shot.result) shot.since += dt;

  const top = { x: board.x, y: board.top };
  const bottom = { x: board.x, y: board.bottom };
  if (bounceOffSegment(ball, r, top, bottom, board.half, 0.62)) shot.glass = true;
  if (bounceOffPoint(ball, r, rim.front, rim.y, rim.r, 0.45)) shot.rim = true;
  if (bounceOffPoint(ball, r, rim.back, rim.y, rim.r, 0.45)) shot.rim = true;
  const [p0, p1, p2] = COURT.pole;
  bounceOffSegment(ball, r, p0, p1, 2, 0.4);
  bounceOffSegment(ball, r, p1, p2, 2, 0.4);

  const inside = ball.x > rim.back && ball.x < rim.front;
  if (inside && before < rim.y && ball.y >= rim.y && ball.vy > 0 && !shot.result) {
    shot.result = { made: true, swish: !shot.rim && !shot.glass };
  } else if (inside && before > rim.y && ball.y <= rim.y && ball.vy < 0) {
    // Up through the net from below: the net stops it.
    ball.y = before;
    ball.vy = Math.abs(ball.vy) * 0.2;
  }

  if (ball.y > COURT.floor - r) {
    ball.y = COURT.floor - r;
    if (ball.vy > 40) {
      ball.vy = -ball.vy * 0.58;
      ball.vx *= 0.82;
    } else {
      // Rolling now: no more bounce, and the floor slows it down.
      ball.vy = 0;
      ball.vx *= Math.exp(-2.5 * dt);
    }
    if (!shot.result) shot.result = miss(shot);
  }

  if ((ball.x < -r || ball.x > COURT.width + r || shot.time > 5) && !shot.result) shot.result = miss(shot);
}

/** Whether the ball has left the frame, so there is nothing left to watch. */
export function shotGone(shot: Shot): boolean {
  return shot.ball.x < -COURT.ball * 2 || shot.ball.x > COURT.width + COURT.ball * 2;
}

/** Run a shot to its result, for reduced motion and for tests. */
export function settleShot(shot: Shot): Shot {
  while (!shot.result) stepShot(shot);
  return shot;
}

/** The next spot after a make: anywhere but here. */
export function nextSpot(current: number, random: () => number = Math.random): number {
  const others = COURT.spots.filter((x) => x !== current);
  return others[Math.floor(random() * others.length)] ?? COURT.spots[0];
}

export interface Tally {
  score: number;
  streak: number;
}

export function callShot(result: ShotResult, points: 2 | 3, tally: Tally): string {
  if (result.made) {
    const how = result.swish ? 'Swish. ' : '';
    const run = tally.streak > 1 ? ` ${tally.streak} in a row.` : '';
    return `${how}${points} points. Score ${tally.score}.${run}`;
  }
  const what = { rim: 'Off the rim.', glass: 'Off the glass.', air: 'Air ball.' }[result.miss];
  return `${what} Score ${tally.score}.`;
}

/* ------------------------------------------------------------------ */
/* Football: from above, attacking the goal on the right.              */
/* ------------------------------------------------------------------ */

export const PITCH = {
  width: 320,
  height: 170,
  left: 10,
  right: 310,
  top: 10,
  bottom: 160,
  goal: { top: 62, bottom: 108, depth: 8, post: 1.5 },
  ball: 5,
  keeper: { x: 303, half: 4, r: 2, speed: 14, delay: 0.3 },
  maxPull: 90,
  power: 4.2,
  /** Rolling resistance: a steady slowdown plus drag that grows with speed. */
  friction: 70,
  drag: 0.8,
  /** The keyboard's starting aim: straight at the middle of the goal. */
  aim: { x: 70, y: 10 },
  /** The kick the drawing plays by itself when it first comes into view. */
  demo: { x: 70, y: -2 },
  /** Where the ball is placed: the first kick from just outside the box, later ones from around it. */
  spots: [
    { x: 232, y: 74 },
    { x: 250, y: 40 },
    { x: 214, y: 112 },
    { x: 196, y: 85 },
    { x: 262, y: 128 },
    { x: 228, y: 100 },
    { x: 178, y: 58 },
  ],
} as const;

export type KickResult = 'goal' | 'saved' | 'post' | 'wide' | 'out' | 'short';

export interface Kick {
  ball: Ball;
  /** The keeper's centre, up and down the goal line. */
  keeper: number;
  /** Where the keeper is heading. */
  dive: number;
  time: number;
  post: boolean;
  result: KickResult | null;
  since: number;
}

export function kick(spot: Vec, aim: Vec, keeper: number): Kick {
  const pull = clampAim(aim, PITCH.maxPull);
  const ball: Ball = { x: spot.x, y: spot.y, vx: pull.x * PITCH.power, vy: pull.y * PITCH.power, turn: 0 };
  const { goal, keeper: k } = PITCH;
  // The keeper reads the line of the kick and goes for where it crosses his line.
  const crossing = ball.vx > 0 ? ball.y + (ball.vy / ball.vx) * (k.x - ball.x) : keeper;
  const dive = clamp(crossing, goal.top + k.half, goal.bottom - k.half);
  return { ball, keeper, dive, time: 0, post: false, result: null, since: 0 };
}

export function stepKick(state: Kick, dt = STEP): void {
  const { ball } = state;
  const r = PITCH.ball;
  const { goal, keeper: k } = PITCH;
  const wasIn = ball.x > PITCH.right;

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > 0) {
    const slower = Math.max(0, speed - (PITCH.friction + PITCH.drag * speed) * dt);
    ball.vx *= slower / speed;
    ball.vy *= slower / speed;
    ball.turn += ((speed * dt) / r) * DEG;
  }
  state.time += dt;
  if (state.result) state.since += dt;

  if (state.time > k.delay && !state.result) {
    const gap = state.dive - state.keeper;
    state.keeper += clamp(gap, -k.speed * dt, k.speed * dt);
  }

  if (!wasIn) {
    const arms = [
      { x: k.x, y: state.keeper - k.half },
      { x: k.x, y: state.keeper + k.half },
    ] as const;
    if (bounceOffSegment(ball, r, arms[0], arms[1], k.r, 0.45) && !state.result) state.result = 'saved';
  }
  if (bounceOffPoint(ball, r, PITCH.right, goal.top, goal.post, 0.6)) state.post = true;
  if (bounceOffPoint(ball, r, PITCH.right, goal.bottom, goal.post, 0.6)) state.post = true;

  const between = ball.y > goal.top && ball.y < goal.bottom;
  if (!wasIn && ball.x > PITCH.right && between && !state.result) state.result = 'goal';
  if (wasIn && state.result === 'goal') {
    // The net: the ball dies in the back and side of the goal.
    const back = PITCH.right + goal.depth - r * 0.6;
    if (ball.x > back) {
      ball.x = back;
      ball.vx = -Math.abs(ball.vx) * 0.15;
      ball.vy *= 0.5;
    }
    ball.y = clamp(ball.y, goal.top + r, goal.bottom - r);
  }

  if (!state.result) {
    if (ball.x > PITCH.right + r * 0.5 && !between) state.result = state.post ? 'post' : 'wide';
    else if (ball.x < PITCH.left - r * 0.5 || ball.y < PITCH.top - r * 0.5 || ball.y > PITCH.bottom + r * 0.5) {
      state.result = state.post ? 'post' : 'out';
    } else if (Math.hypot(ball.vx, ball.vy) < 3) state.result = state.post ? 'post' : 'short';
  }
}

export function kickStopped(state: Kick): boolean {
  return Math.hypot(state.ball.vx, state.ball.vy) < 1;
}

export function settleKick(state: Kick): Kick {
  while (!state.result) stepKick(state);
  return state;
}

/** Where the keeper sets up for the next kick: in the middle first, then guessing. */
export function keeperStart(attempt: number, random: () => number = Math.random): number {
  const middle = (PITCH.goal.top + PITCH.goal.bottom) / 2;
  return attempt === 0 ? middle : middle + (random() * 2 - 1) * 9;
}

export function nextKickSpot(current: number, random: () => number = Math.random): number {
  const choices = PITCH.spots.map((_, i) => i).filter((i) => i !== current && i !== 0);
  return choices[Math.floor(random() * choices.length)] ?? 1;
}

export function callKick(result: KickResult, goals: number, shots: number): string {
  const tally = `${goals} of ${shots}.`;
  switch (result) {
    case 'goal':
      return `Goal! ${tally}`;
    case 'saved':
      return `Saved. ${tally}`;
    case 'post':
      return `Off the post. ${tally}`;
    case 'wide':
      return `Wide. ${tally}`;
    case 'out':
      return `Out of play. ${tally}`;
    case 'short':
      return `Not enough on it. ${tally}`;
  }
}

/* ------------------------------------------------------------------ */
/* Swimming: one length, stroking left and right in turn.              */
/* ------------------------------------------------------------------ */

export const POOL = {
  start: 52,
  finish: 306,
  lane: 106,
  /** Speed added by each stroke taken in turn, and the top speed. */
  stroke: 15,
  top: 78,
  /** How quickly the swimmer slows between strokes. */
  drag: 1.5,
} as const;

export type Arm = 'left' | 'right';

export interface Race {
  x: number;
  speed: number;
  /** Seconds since the first stroke; null before it. */
  time: number | null;
  last: Arm | null;
  strokes: number;
  finished: boolean;
}

export function newRace(): Race {
  return { x: POOL.start, speed: 0, time: null, last: null, strokes: 0, finished: false };
}

/** Take a stroke. Only strokes in turn push the swimmer on; true if this one did. */
export function stroke(race: Race, arm: Arm): boolean {
  if (race.finished || arm === race.last) return false;
  race.last = arm;
  race.strokes += 1;
  race.time ??= 0;
  race.speed = Math.min(POOL.top, race.speed + POOL.stroke);
  return true;
}

export function stepRace(race: Race, dt = STEP): void {
  if (race.finished || race.time === null) return;
  race.time += dt;
  race.x += race.speed * dt;
  race.speed *= Math.exp(-POOL.drag * dt);
  if (race.x >= POOL.finish) {
    // Count the touch at the wall, not the end of the step.
    const over = (race.x - POOL.finish) / Math.max(race.speed, 1e-6);
    race.time = Math.max(0, race.time - Math.min(over, dt));
    race.x = POOL.finish;
    race.finished = true;
  }
}

export function formatSeconds(seconds: number): string {
  return seconds.toFixed(2);
}

/** Read a stored best time, ignoring anything that isn't a sensible number. */
export function parseBest(raw: string | null): number | null {
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 && value < 3600 ? value : null;
}

export function callFinish(time: number, best: number | null): string {
  const said = `Finished in ${formatSeconds(time)} seconds.`;
  if (best === null || time < best) return `${said} New best.`;
  return `${said} Best ${formatSeconds(best)}.`;
}
