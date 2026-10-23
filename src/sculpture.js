export const WIDTH = 960;
export const HEIGHT = 700;
const copy = value => structuredClone(value);
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mix = (a, b, t) => Object.fromEntries(Object.keys(a).map(key => [key, a[key] + (b[key] - a[key]) * t]));

// Uniform cubic B-splines stay in the local control hull, avoiding Catmull-Rom overshoot.
export function closedCurve(points) {
  const n = points.length;
  const first = { x: (points[n - 1].x + 4 * points[0].x + points[1].x) / 6, y: (points[n - 1].y + 4 * points[0].y + points[1].y) / 6 };
  let path = `M ${first.x} ${first.y}`;
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n], c = points[(i + 2) % n];
    path += ` C ${(2 * a.x + b.x) / 3} ${(2 * a.y + b.y) / 3}, ${(a.x + 2 * b.x) / 3} ${(a.y + 2 * b.y) / 3}, ${(a.x + 4 * b.x + c.x) / 6} ${(a.y + 4 * b.y + c.y) / 6}`;
  }
  return path + ' Z';
}

// Uniform sampling is used once for the rest mesh. Runtime deformation never adds material.
function remesh(points, companions = [], spacing = 6) {
  const lengths = points.map((p, i) => distance(p, points[(i + 1) % points.length]));
  const perimeter = lengths.reduce((a, b) => a + b, 0);
  const count = clamp(Math.ceil(perimeter / spacing), 80, 2400);
  const result = Array.from({ length: 1 + companions.length }, () => []);
  let index = 0, traversed = 0;
  for (let i = 0; i < count; i++) {
    const offset = perimeter * i / count;
    while (index < points.length - 1 && traversed + lengths[index] < offset) traversed += lengths[index++];
    const t = lengths[index] ? (offset - traversed) / lengths[index] : 0;
    [points, ...companions].forEach((array, n) => {
      const a = array[index], b = array[(index + 1) % array.length];
      const sample = mix(a, b, t);
      if (a.u !== undefined && b.u < a.u) sample.u = (a.u + (b.u + 44 - a.u) * t) % 44;
      result[n].push(sample);
    });
  }
  return result;
}

function initialContour() {
  const controls = [
    [480, 213], [548, 227], [588, 263], [606, 309],
    [619, 363], [645, 439], [643, 468], [631, 479], [615, 463],
    [593, 387], [582, 366], [566, 398], [537, 419],
    [565, 429], [589, 445], [596, 461], [585, 475], [563, 468],
    [569, 510], [558, 552], [536, 578], [510, 575], [485, 559],
    [460, 578], [432, 577], [407, 555], [395, 520], [402, 474],
    [382, 482], [366, 470], [368, 452], [397, 432], [424, 420],
    [390, 401], [373, 370], [354, 428], [339, 479], [326, 494],
    [313, 484], [315, 462], [333, 390], [341, 314], [354, 272], [399, 231],
  ].map(([x, y]) => ({ x, y }));
  const samples = [];
  for (let i = 0; i < controls.length; i++) {
    const a = controls[(i + controls.length - 1) % controls.length], b = controls[i], c = controls[(i + 1) % controls.length], d = controls[(i + 2) % controls.length];
    for (let j = 0; j < 10; j++) {
      const t = j / 10, t2 = t * t, t3 = t2 * t;
      const point = { u: i + t };
      for (const axis of ['x', 'y']) point[axis] = 0.5 * (2 * b[axis] + (-a[axis] + c[axis]) * t + (2 * a[axis] - 5 * b[axis] + 4 * c[axis] - d[axis]) * t2 + (-a[axis] + 3 * b[axis] - 3 * c[axis] + d[axis]) * t3);
      samples.push(point);
    }
  }
  return remesh(samples)[0].map(p => ({ ...p, rx: p.x, ry: p.y }));
}
const REST = initialContour();

function project(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  const position = { x: a.x + dx * t, y: a.y + dy * t };
  return { point: position, t, distance: distance(point, position) };
}
function inside(point, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

// Bind painted facial features to the original material, even as the contour is remeshed.
export function skinPoint(point, contour) {
  let sum = 0, dx = 0, dy = 0;
  contour.forEach((p, i) => {
    const next = contour[(i + 1) % contour.length], prev = contour[(i + contour.length - 1) % contour.length];
    const material = (Math.hypot(next.rx - p.rx, next.ry - p.ry) + Math.hypot(prev.rx - p.rx, prev.ry - p.ry)) / 2;
    const squared = (p.rx - point.x) ** 2 + (p.ry - point.y) ** 2 + 500;
    const weight = material / (squared * squared);
    sum += weight; dx += (p.x - p.rx) * weight; dy += (p.y - p.ry) * weight;
  });
  return { x: point.x + dx / (sum || 1), y: point.y + dy / (sum || 1) };
}

const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const windowWeight = (u, start, end, fade = 1) => smooth((u - start) / fade) * smooth((end - u) / fade);
export const LIMITS = {
  bodyWidth: [.80, 1.28], bodyHeight: [.82, 1.20], bodyLean: [-17, 17], headScale: [.96, 1.07],
  rightEarLength: [.67, 1.36], rightEarWidth: [.92, 1.65], rightEarLean: [-12, 25],
  leftEarLength: [.67, 1.36], leftEarWidth: [.92, 1.65], leftEarLean: [-25, 12],
  rightArmLength: [.85, 1.28], rightArmWidth: [.94, 1.30],
  leftArmLength: [.85, 1.28], leftArmWidth: [.94, 1.30],
  rightFootLength: [.90, 1.22], rightFootWidth: [.94, 1.22],
  leftFootLength: [.90, 1.22], leftFootWidth: [.94, 1.22],
};
const defaults = () => Object.fromEntries(Object.keys(LIMITS).map(key => [key, key.endsWith('Lean') ? 0 : 1]));
function constrain(params) {
  const result = {};
  for (const [key, [min, max]] of Object.entries(LIMITS)) result[key] = clamp(Number.isFinite(params[key]) ? params[key] : defaults()[key], min, max);
  for (const side of ['left', 'right']) {
    // Longer ears must retain enough material; repeated grabs cannot accumulate a needle.
    result[`${side}EarWidth`] = Math.max(result[`${side}EarWidth`], result[`${side}EarLength`] * .88);
  }
  return result;
}
function weights(u) {
  return {
    rightEar: windowWeight(u, 3, 10.7, .95), leftEar: windowWeight(u, 33.4, 42.0, 1.0),
    rightArm: windowWeight(u, 12.5, 17.8, 1.15), leftArm: windowWeight(u, 26.7, 32.1, 1.1),
    rightFoot: windowWeight(u, 18.8, 22.3, .8), leftFoot: windowWeight(u, 22.2, 26.1, .8),
  };
}
export function deformContour(parameters) {
  const params = constrain(parameters);
  const headDy = (1 - params.bodyHeight) * 26;
  return REST.map(point => {
    const { rx, ry, u } = point;
    const w = weights(u);
    const ear = Math.max(w.leftEar, w.rightEar);
    const torso = smooth((ry - 387) / 65) * (1 - ear);
    let x = rx + (rx - 480) * (params.bodyWidth - 1) * torso + params.bodyLean * torso * clamp((ry - 410) / 170, 0, 1);
    let y = ry + (ry - 415) * (params.bodyHeight - 1) * torso + headDy * (1 - torso);
    x += (rx - 480) * (params.headScale - 1) * (1 - torso);
    y += (ry - 320) * (params.headScale - 1) * (1 - torso);
    for (const side of ['left', 'right']) {
      const sign = side === 'left' ? -1 : 1;
      const rootX = side === 'left' ? 353 : 598;
      const rootY = 318;
      const earWeight = w[`${side}Ear`];
      const length = params[`${side}EarLength`], width = params[`${side}EarWidth`];
      const axisX = rootX + sign * (ry - rootY) * .22;
      x += ((rx - axisX) * (width - 1) + sign * (ry - rootY) * .22 * (length - 1) + params[`${side}EarLean`] * clamp((ry - rootY) / 175, 0, 1)) * earWeight;
      y += (ry - rootY) * (length - 1) * earWeight;
      const armWeight = w[`${side}Arm`];
      x += (rx - (side === 'left' ? 412 : 549)) * (params[`${side}ArmLength`] - 1) * armWeight;
      y += (ry - 456) * (params[`${side}ArmWidth`] - 1) * armWeight;
      const footWeight = w[`${side}Foot`];
      x += (rx - (side === 'left' ? 444 : 529)) * (params[`${side}FootWidth`] - 1) * footWeight;
      y += (ry - 540) * (params[`${side}FootLength`] - 1) * footWeight;
    }
    return { ...point, x, y };
  });
}
export const INITIAL = { params: defaults(), body: deformContour(defaults()) };
export function facePose(params) {
  return { x: 480, y: 340 + (1 - params.bodyHeight) * 26, scale: 1 };
}
function area(points) {
  return Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.y - p.y * q.x; }, 0)) / 2;
}
const INITIAL_AREA = area(INITIAL.body);
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
export function isValidShape(points, params) {
  if (points.some(p => !Number.isFinite(p.x + p.y) || p.x < 125 || p.x > 835 || p.y < 165 || p.y > 642)) return false;
  if (area(points) < INITIAL_AREA * .67) return false;
  const face = facePose(params);
  for (const [dx, dy] of [[-85, -44], [85, -44], [-85, 42], [85, 42], [0, 0]]) if (!inside({ x: face.x + dx, y: face.y + dy }, points)) return false;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    const strain = distance(a, b) / distance(REST[i], REST[(i + 1) % n]);
    if (strain < .5 || strain > 2.35) return false;
    const prev = points[(i + n - 1) % n];
    const turn = Math.acos(clamp(((a.x - prev.x) * (b.x - a.x) + (a.y - prev.y) * (b.y - a.y)) / (distance(a, prev) * distance(a, b) || 1), -1, 1));
    const restPrev = REST[(i + n - 1) % n], restA = REST[i], restB = REST[(i + 1) % n];
    const restTurn = Math.acos(clamp(((restA.x - restPrev.x) * (restB.x - restA.x) + (restA.y - restPrev.y) * (restB.y - restA.y)) / (distance(restA, restPrev) * distance(restA, restB) || 1), -1, 1));
    if (turn > Math.max(.8, restTurn + .32)) return false;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = points[j], d = points[(j + 1) % n];
      if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.max(c.x, d.x) < Math.min(a.x, b.x) || Math.max(a.y, b.y) < Math.min(c.y, d.y) || Math.max(c.y, d.y) < Math.min(a.y, b.y)) continue;
      if (cross(a, b, c) * cross(a, b, d) < -1e-8 && cross(c, d, a) * cross(c, d, b) < -1e-8) return false;
    }
  }
  return true;
}
function safeShape(desired, previous) {
  const params = constrain(desired);
  const body = deformContour(params);
  if (isValidShape(body, params)) return { params, body };
  // Backtrack toward the last accepted user shape, never toward a default template.
  let lo = 0, hi = 1, accepted = previous;
  for (let i = 0; i < 9; i++) {
    const t = (lo + hi) / 2;
    const p = Object.fromEntries(Object.keys(params).map(key => [key, previous.params[key] + (params[key] - previous.params[key]) * t]));
    const candidate = deformContour(p);
    if (isValidShape(candidate, p)) { lo = t; accepted = { params: p, body: candidate }; } else hi = t;
  }
  return accepted;
}

export class Sculpture {
  constructor() { this.radius = 76; this.reset(); }
  reset() {
    this.target = copy(INITIAL); this.display = copy(INITIAL);
    this.velocity = Object.fromEntries(Object.keys(LIMITS).map(key => [key, 0]));
    this.grab = null; this.changes = 0; this.history = [];
  }
  hitTest(point) {
    let nearest = { distance: Infinity };
    this.target.body.forEach((p, index) => {
      const hit = project(point, p, this.target.body[(index + 1) % this.target.body.length]);
      if (hit.distance < nearest.distance) nearest = { ...hit, index };
    });
    if (nearest.distance >= 38 && !inside(point, this.target.body)) return null;
    const material = this.target.body[nearest.index];
    const w = weights(material.u);
    const part = Object.entries(w).sort((a, b) => b[1] - a[1])[0];
    return { ...nearest, kind: part[1] > .48 ? part[0] : material.ry < 405 ? 'head' : 'body' };
  }
  begin(point) {
    const hit = this.hitTest(point);
    if (!hit) return null;
    this.grab = { ...hit, origin: { x: point.x, y: point.y }, snapshot: copy(this.target), moved: false };
    return hit;
  }
  move(point) {
    if (!this.grab || !Number.isFinite(point.x + point.y)) return;
    const { origin, snapshot, kind, index } = this.grab;
    const gain = .75 + .35 * clamp((this.radius - 45) / 65, 0, 1);
    // Bounded hand travel also keeps sudden tracking jumps from saturating every parameter.
    const dx = clamp(point.x - origin.x, -220, 220) * gain;
    const dy = clamp(point.y - origin.y, -220, 220) * gain;
    if (Math.hypot(dx, dy) < .001) { this.target = copy(snapshot); return; }
    const p = copy(snapshot.params), anchor = snapshot.body[index];
    if (kind.endsWith('Ear')) {
      const side = kind.startsWith('left') ? -1 : 1;
      const rootX = side < 0 ? 353 : 598;
      const axisX = rootX + side * (anchor.ry - 318) * .22;
      const outer = Math.sign(anchor.rx - axisX) || side;
      p[`${kind}Length`] += (dy + dx * side * .2) / 175;
      p[`${kind}Width`] += dx * outer / 95;
      p[`${kind}Lean`] += dx * .10;
    } else if (kind.endsWith('Arm')) {
      const side = kind.startsWith('left') ? -1 : 1;
      p[`${kind}Length`] += dx * side / 115;
      p[`${kind}Width`] += dy * Math.sign(anchor.ry - 456 || 1) / 100;
    } else if (kind.endsWith('Foot')) {
      const side = kind.startsWith('left') ? -1 : 1;
      p[`${kind}Length`] += dy / 110;
      p[`${kind}Width`] += dx * side / 125;
    } else if (kind === 'head') {
      p.headScale += (dx * Math.sign(anchor.rx - 480 || 1) - dy * .4) / 420;
    } else {
      p.bodyWidth += dx * Math.sign(anchor.rx - 480 || 1) / 260;
      p.bodyHeight += dy * (anchor.ry > 490 ? 1 : -.4) / 240;
      p.bodyLean += dx * .035;
    }
    this.target = safeShape(p, this.target);
    this.grab.moved = Object.keys(p).some(key => Math.abs(this.target.params[key] - snapshot.params[key]) > (key.endsWith('Lean') ? .5 : .004));
  }
  release() {
    if (!this.grab) return false;
    const changed = this.grab.moved;
    if (changed) { this.history.push(this.grab.snapshot); if (this.history.length > 40) this.history.shift(); this.changes++; }
    this.grab = null;
    return changed;
  }
  undo() {
    if (this.grab) this.release();
    const previous = this.history.pop();
    if (!previous) return false;
    this.target = copy(previous); this.display = copy(previous);
    for (const key of Object.keys(this.velocity)) this.velocity[key] = 0;
    this.changes = Math.max(0, this.changes - 1);
    return true;
  }
  tick(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const duration = Math.min(dt, .05), steps = Math.ceil(duration * 120), step = duration / steps;
    const params = { ...this.display.params };
    let moving = false;
    for (let i = 0; i < steps; i++) for (const key of Object.keys(LIMITS)) {
      const delta = this.target.params[key] - params[key];
      const damping = this.grab ? 21 : 17;
      this.velocity[key] += (210 * delta - damping * this.velocity[key]) * step;
      params[key] += this.velocity[key] * step;
      if (Math.abs(delta) > .00001 || Math.abs(this.velocity[key]) > .00001) moving = true;
    }
    if (moving) this.display = safeShape(params, this.display);
  }
}
