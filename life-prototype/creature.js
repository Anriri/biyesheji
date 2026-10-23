/* Classic script by design: no imports, fetches, dependencies, camera, or local server. */
(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const ease = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };

  function samplePose(time, amount = 1) {
    const phase = time * 1.04;
    // Squash and lift share one phase: the low pose is wider, the rising pose taller.
    // Incommensurate secondary rhythms keep the idle motion from feeling like a pendulum.
    const lift = (6.8 * (1 - Math.cos(phase)) + .7 * Math.sin(time * .37)) * amount;
    const sy = 1 + (-.039 * Math.cos(phase) + .006 * Math.sin(2 * phase - .6)) * amount;
    return {
      lift,
      sy,
      sx: 1 / sy,
      drift: (3.5 * Math.sin(time * .64 + .7) + 1.3 * Math.sin(time * 1.17)) * amount,
      tilt: (1.35 * Math.sin(time * .71) + .45 * Math.sin(time * 1.09 + .9)) * amount,
      bend: (2.0 * Math.sin(time * .71 - .55) + .8 * Math.sin(time * 1.04 - .8)) * amount,
    };
  }

  function makeContour(time, pose, amount = 1, shape = null) {
    const points = [];
    for (let i = 0; i < 32; i++) {
      const angle = TAU * i / 32;
      const rest = 1 + .042 * Math.sin(3 * angle + .6) + .018 * Math.cos(2 * angle - .8);
      const ripple = amount * (.011 * Math.sin(2 * angle - time * 1.30) + .007 * Math.sin(3 * angle + time * .81 + .8));
      const x = (shape ? shape[i].x : Math.sin(angle) * 112 * (1 - .16 * Math.cos(angle)) * rest) + Math.sin(angle) * 112 * (1 - .16 * Math.cos(angle)) * ripple;
      const y = (shape ? shape[i].y : -108 - Math.cos(angle) * 106 * rest) - Math.cos(angle) * 106 * ripple;
      const topWeight = clamp(-y / 215, 0, 1);
      points.push({ x: x * pose.sx + pose.bend * topWeight * topWeight, y: y * pose.sy });
    }
    return points;
  }

  // C2-continuous cubic B-spline: every segment stays inside its local control hull.
  function closedPath(points) {
    const n = points.length;
    const a = points[n - 1], b = points[0], c = points[1];
    let d = `M ${(a.x + 4 * b.x + c.x) / 6} ${(a.y + 4 * b.y + c.y) / 6}`;
    for (let i = 0; i < n; i++) {
      const p = points[i], q = points[(i + 1) % n], r = points[(i + 2) % n];
      d += ` C ${(2 * p.x + q.x) / 3} ${(2 * p.y + q.y) / 3}, ${(p.x + 2 * q.x) / 3} ${(p.y + 2 * q.y) / 3}, ${(p.x + 4 * q.x + r.x) / 6} ${(p.y + 4 * q.y + r.y) / 6}`;
    }
    return d + ' Z';
  }

  function blinkAt(elapsed) {
    if (elapsed < 0 || elapsed > .27) return 1;
    if (elapsed < .095) return 1 - .94 * ease(elapsed / .095);
    if (elapsed < .125) return .06;
    return .06 + .94 * ease((elapsed - .125) / .145);
  }

  const identityPose = { sx: 1, sy: 1, bend: 0 };
  const REST = makeContour(0, identityPose, 0);
  const clone = points => points.map(p => ({ x: p.x, y: p.y }));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function area(points) {
    return Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.y - p.y * q.x; }, 0)) / 2;
  }
  function inside(point, points) {
    let result = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
  }
  function renderedOutline(points) {
    const outline = [];
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const a = points[(i + n - 1) % n], b = points[i], c = points[(i + 1) % n], d = points[(i + 2) % n];
      for (let j = 0; j < 3; j++) {
        const t = j / 3, m = 1 - t;
        outline.push({
          x: (m ** 3 * a.x + (3 * t ** 3 - 6 * t * t + 4) * b.x + (-3 * t ** 3 + 3 * t * t + 3 * t + 1) * c.x + t ** 3 * d.x) / 6,
          y: (m ** 3 * a.y + (3 * t ** 3 - 6 * t * t + 4) * b.y + (-3 * t ** 3 + 3 * t * t + 3 * t + 1) * c.y + t ** 3 * d.y) / 6,
        });
      }
    }
    return outline;
  }
  // A local material binding moves the eyes with the dough, while keeping both eyes rigid.
  const faceWeights = REST.map(p => 1 / ((p.x * p.x + (p.y + 120) ** 2 + 700) ** 2));
  const weightSum = faceWeights.reduce((a, b) => a + b, 0);
  function faceAnchor(points) {
    return points.reduce((anchor, p, i) => {
      const weight = faceWeights[i] / weightSum;
      anchor.x += (p.x - REST[i].x) * weight;
      anchor.y += (p.y - REST[i].y) * weight;
      return anchor;
    }, { x: 0, y: -120 });
  }
  function safeFace(points, desired = faceAnchor(points), extraPadding = 0) {
    const outline = renderedOutline(points);
    const center = points.reduce((a, p) => ({ x: a.x + p.x / points.length, y: a.y + p.y / points.length }), { x: 0, y: 0 });
    function fits(p) {
      // Full, open eyes plus padding must fit the actual B-spline, not only its control hull.
      for (const side of [-29, 29]) for (let i = 0; i < 8; i++) {
        const angle = i * TAU / 8;
        if (!inside({ x: p.x + side + (15 + extraPadding) * Math.cos(angle), y: p.y + (21 + extraPadding) * Math.sin(angle) }, outline)) return false;
      }
      return true;
    }
    if (fits(desired)) return desired;
    for (let i = 1; i <= 10; i++) {
      const t = i / 10, candidate = { x: desired.x + (center.x - desired.x) * t, y: desired.y + (center.y - desired.y) * t };
      if (fits(candidate)) return candidate;
    }
    const offsets = [];
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const stepX = Math.max(12, (Math.max(...xs) - Math.min(...xs)) * .10);
    const stepY = Math.max(12, (Math.max(...ys) - Math.min(...ys)) * .09);
    for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) offsets.push({ x: x * stepX, y: y * stepY });
    offsets.sort((a, b) => a.x * a.x + a.y * a.y - b.x * b.x - b.y * b.y);
    for (const offset of offsets) {
      const candidate = { x: center.x + offset.x, y: center.y + offset.y };
      if (fits(candidate)) return candidate;
    }
    return null;
  }
  const REST_AREA = area(REST);
  const restEdges = REST.map((p, i) => distance(p, REST[(i + 1) % REST.length]));
  const SCULPT_LIMITS = Object.freeze({ travel: 300, width: 620, height: 435, minWidth: 110, minHeight: 88 });
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  function validShape(points) {
    if (points.length !== REST.length || points.some(p => !Number.isFinite(p.x + p.y) || Math.abs(p.x) > 365 || p.y < -410 || p.y > 85)) return false;
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
    if (width < SCULPT_LIMITS.minWidth || width > SCULPT_LIMITS.width || height < SCULPT_LIMITS.minHeight || height > SCULPT_LIMITS.height) return false;
    const ratio = area(points) / REST_AREA;
    // Size is bounded per axis, not by a shared area budget. A wide custom shape
    // still needs room to grow upwards without undoing its previous sculpting.
    if (ratio < .38) return false;
    let perimeter = 0;
    for (let i = 0; i < points.length; i++) {
      const prev = points[(i + points.length - 1) % points.length], a = points[i], b = points[(i + 1) % points.length];
      const edge = distance(a, b), strain = edge / restEdges[i]; perimeter += edge;
      if (strain < .30 || strain > 3.8) return false;
      const cosine = ((a.x - prev.x) * (b.x - a.x) + (a.y - prev.y) * (b.y - a.y)) / (distance(prev, a) * edge || 1);
      if (Math.acos(clamp(cosine, -1, 1)) > .86) return false;
      for (let j = i + 2; j < points.length; j++) {
        if (i === 0 && j === points.length - 1) continue;
        const c = points[j], d = points[(j + 1) % points.length];
        if (cross(a, b, c) * cross(a, b, d) < -1e-8 && cross(c, d, a) * cross(c, d, b) < -1e-8) return false;
      }
    }
    // Reserve extra clearance for breathing, contour recoil and independent gaze motion.
    return perimeter < 2 * (width + height) * 1.15 && safeFace(points, faceAnchor(points), 3) !== null;
  }

  function axisTravel(before, changes, axis, low, high, maxSpan, minSpan) {
    // Project only the blocked component of a pull. At the right/width boundary,
    // a tiny horizontal pointer drift must not cancel a valid vertical edit.
    let fraction = 1;
    before.forEach((p, i) => {
      const delta = changes[i][axis];
      if (delta > 0) fraction = Math.min(fraction, (high - p[axis]) / delta);
      if (delta < 0) fraction = Math.min(fraction, (low - p[axis]) / delta);
      before.forEach((q, j) => {
        const relative = delta - changes[j][axis];
        if (relative > 0) fraction = Math.min(fraction, (maxSpan - p[axis] + q[axis]) / relative);
      });
    });
    fraction = clamp(fraction, 0, 1);
    const span = t => {
      const values = before.map((p, i) => p[axis] + changes[i][axis] * t);
      return Math.max(...values) - Math.min(...values);
    };
    if (span(fraction) < minSpan) {
      let a = 0, b = fraction;
      for (let i = 0; i < 12; i++) {
        const mid = (a + b) / 2;
        if (span(mid) >= minSpan) a = mid; else b = mid;
      }
      fraction = a;
    }
    return fraction;
  }

  function relaxContour(candidate) {
    const points = clone(candidate);
    // Repair the few material edges/corners that reached a limit, rather than
    // cancelling the entire grab because one vertex cannot move as requested.
    for (let pass = 0; pass < 24; pass++) {
      let repaired = false;
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        const edge = distance(a, b), target = clamp(edge, restEdges[i] * .305, restEdges[i] * 3.79);
        if (Math.abs(target - edge) > 1e-6 && edge > 1e-8) {
          const scale = (edge - target) / edge * .5;
          const dx = (b.x - a.x) * scale, dy = (b.y - a.y) * scale;
          a.x += dx; a.y += dy; b.x -= dx; b.y -= dy;
          repaired = true;
        }
      }
      const next = clone(points);
      for (let i = 0; i < points.length; i++) {
        const a = points[(i + points.length - 1) % points.length], p = points[i], b = points[(i + 1) % points.length];
        const cosine = ((p.x - a.x) * (b.x - p.x) + (p.y - a.y) * (b.y - p.y)) / (distance(a, p) * distance(p, b) || 1);
        if (Math.acos(clamp(cosine, -1, 1)) > .85) {
          next[i].x += ((a.x + b.x) / 2 - p.x) * .22;
          next[i].y += ((a.y + b.y) / 2 - p.y) * .22;
          repaired = true;
        }
      }
      points.forEach((p, i) => { p.x = next[i].x; p.y = next[i].y; });
      if (!repaired) break;
    }
    return points;
  }
  class SoftSculpt {
    constructor() { this.shape = clone(REST); this.history = []; this.grab = null; }
    hitTest(point) {
      let nearest = { distance: Infinity };
      this.shape.forEach((a, i) => {
        const b = this.shape[(i + 1) % this.shape.length];
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        const p = { x: a.x + dx * t, y: a.y + dy * t };
        if (distance(point, p) < nearest.distance) nearest = { index: i, t, distance: distance(point, p) };
      });
      return nearest.distance <= 22 || inside(point, this.shape) ? nearest : null;
    }
    begin(point) {
      const hit = this.hitTest(point); if (!hit) return false;
      const arcs = [0];
      for (let i = 0; i < this.shape.length; i++) arcs.push(arcs[i] + distance(this.shape[i], this.shape[(i + 1) % this.shape.length]));
      const total = arcs.at(-1), contact = arcs[hit.index] + (arcs[hit.index + 1] - arcs[hit.index]) * hit.t;
      const materialDistance = arcs.slice(0, -1).map(a => {
        const d = Math.abs(a - contact), arc = Math.min(d, total - d);
        return arc;
      });
      const a = this.shape[hit.index], b = this.shape[(hit.index + 1) % this.shape.length];
      const edge = distance(a, b);
      const normal = { x: (b.y - a.y) / edge, y: -(b.x - a.x) / edge };
      const xs = this.shape.map(p => p.x), ys = this.shape.map(p => p.y);
      const bounds = { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2 };
      this.grab = { origin: { x: point.x, y: point.y }, before: clone(this.shape), materialDistance, normal, bounds, radius: clamp(total * .12, 82, 120) };
      return true;
    }
    move(point) {
      if (!this.grab || !Number.isFinite(point.x + point.y)) return;
      const { origin, before, materialDistance, normal, bounds, radius } = this.grab;
      let dx = point.x - origin.x, dy = point.y - origin.y;
      const length = Math.hypot(dx, dy), limit = length > SCULPT_LIMITS.travel ? SCULPT_LIMITS.travel / length : 1;
      dx *= limit; dy *= limit;
      // Long pulls recruit more neighboring material instead of turning a narrow patch
      // into a spike. All changes are relative to this grab's custom starting shape.
      const reach = radius + Math.min(Math.hypot(dx, dy) * .20, 58);
      const weights = materialDistance.map(arc => Math.exp(-.5 * (arc / reach) ** 2));
      const pressure = Math.max(0, -(dx * normal.x + dy * normal.y));
      const verticalPress = clamp((Math.abs(normal.y) - .60) / .40, 0, 1);
      const horizontalPress = clamp((Math.abs(normal.x) - .60) / .40, 0, 1);
      // Inward pressure lets the dough flow across the other axis: a top press makes
      // a pancake, while a sideways squeeze makes a taller, narrower form.
      const spreadX = clamp(pressure / bounds.height, 0, .75) * verticalPress * .65;
      const spreadY = clamp(pressure / bounds.width, 0, .75) * horizontalPress * .45;
      const changes = before.map((p, i) => ({ x: dx * weights[i], y: dy * weights[i] }));
      const tx = axisTravel(before, changes, 'x', -365, 365, SCULPT_LIMITS.width, SCULPT_LIMITS.minWidth);
      const ty = axisTravel(before, changes, 'y', -410, 85, SCULPT_LIMITS.height, SCULPT_LIMITS.minHeight);
      const primary = before.map((p, i) => ({
        x: p.x + changes[i].x * tx,
        y: p.y + changes[i].y * ty,
      }));
      const flow = before.map((p, i) => {
        // Fade pressure redistribution to zero outside this neighborhood. A small
        // corner push must not inflate a distant tip or reshape the whole body.
        const local = 1 - ease((materialDistance[i] / reach - 1.5) / 1.5);
        return { x: (p.x - bounds.cx) * spreadX * local, y: (p.y - bounds.cy) * spreadY * local };
      });
      // Pressure flow is secondary: reaching a distant boundary must not suppress
      // the user's inward handle motion. Fit flow into space left AFTER that move.
      const fx = axisTravel(primary, flow, 'x', -365, 365, SCULPT_LIMITS.width, SCULPT_LIMITS.minWidth);
      const fy = axisTravel(primary, flow, 'y', -410, 85, SCULPT_LIMITS.height, SCULPT_LIMITS.minHeight);
      const at = (t, pressureFlow = 1) => before.map((p, i) => ({
        x: p.x + (changes[i].x * tx + flow[i].x * fx * pressureFlow) * t,
        y: p.y + (changes[i].y * ty + flow[i].y * fy * pressureFlow) * t,
      }));
      const candidate = at(1);
      if (validShape(candidate)) { this.shape = candidate; return; }
      const relaxed = relaxContour(candidate);
      if (validShape(relaxed)) { this.shape = relaxed; return; }
      const withoutFlow = relaxContour(at(1, 0));
      if (validShape(withoutFlow)) { this.shape = withoutFlow; return; }
      let low = 0, high = 1, accepted = clone(before);
      for (let i = 0; i < 10; i++) {
        const t = (low + high) / 2;
        let shape = at(t);
        if (!validShape(shape)) shape = relaxContour(shape);
        if (validShape(shape)) { low = t; accepted = shape; } else high = t;
      }
      this.shape = accepted;
    }
    release() {
      if (!this.grab) return false;
      const changed = this.shape.some((p, i) => distance(p, this.grab.before[i]) > .6);
      if (changed) this.remember(this.grab.before);
      else this.shape = clone(this.grab.before);
      this.grab = null;
      return changed;
    }
    remember(shape) { this.history.push(clone(shape)); if (this.history.length > 40) this.history.shift(); }
    undo() {
      if (this.grab) this.release();
      const shape = this.history.pop(); if (!shape) return false;
      this.shape = clone(shape); return true;
    }
    get changed() { return this.shape.some((p, i) => distance(p, REST[i]) > .6); }
    reset() {
      if (this.grab) this.release();
      if (!this.changed) return false;
      this.remember(this.shape); this.shape = clone(REST); return true;
    }
  }

  // Also used by the small, dependency-free numerical regression test.
  globalThis.CreatureMotion = Object.freeze({ samplePose, makeContour, closedPath, blinkAt, SoftSculpt, validShape, safeFace, renderedOutline, SCULPT_LIMITS });
  if (typeof document === 'undefined') return;

  const body = document.getElementById('body');
  const creature = document.getElementById('creature');
  const floor = document.getElementById('floor');
  const eyeLeft = document.getElementById('eye-left');
  const eyeRight = document.getElementById('eye-right');
  const scene = document.querySelector('.scene');
  const undoButton = document.getElementById('undo');
  const resetButton = document.getElementById('reset');
  const sculpt = new SoftSculpt();
  let livePose = samplePose(0);
  let drag = null;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let amount = reduced.matches ? .45 : 1;
  reduced.addEventListener?.('change', event => { amount = event.matches ? .45 : 1; });

  let seed = 0x7193;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let time = 0;
  let recoilUntil = -Infinity;
  let lastFrame = null;
  let frameId;
  let blinkStart = 2.4;
  let doubleBlink = false;
  let gazeNext = 1.8;
  const gaze = { x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0 };
  const points = makeContour(0, samplePose(0, amount), amount);
  const velocities = points.map(() => ({ x: 0, y: 0 }));
  let lastSafePoints = clone(points);
  let lastSafeFace = { x: 0, y: -120 };

  function integrate(dt, target) {
    const steps = Math.max(1, Math.ceil(dt * 120));
    const h = dt / steps;
    for (let step = 0; step < steps; step++) {
      points.forEach((point, i) => {
        // The perimeter lags the center of mass slightly, giving a soft delayed recoil.
        const recoiling = time < recoilUntil;
        const stiffness = (sculpt.grab ? 360 : recoiling ? 100 : 90) + 9 * Math.sin(i * TAU / points.length);
        for (const axis of ['x', 'y']) {
          velocities[i][axis] += (stiffness * (target[i][axis] - point[axis]) - (sculpt.grab ? 28 : recoiling ? 10.5 : 13.5) * velocities[i][axis]) * h;
          point[axis] += velocities[i][axis] * h;
        }
      });
      for (const axis of ['x', 'y']) {
        const velocity = axis === 'x' ? 'vx' : 'vy';
        const desired = axis === 'x' ? gaze.targetX : gaze.targetY;
        gaze[velocity] += (24 * (desired - gaze[axis]) - 10 * gaze[velocity]) * h;
        gaze[axis] += gaze[velocity] * h;
      }
    }
  }

  function render(pose) {
    const anchor = faceAnchor(points);
    let face = safeFace(points, { x: anchor.x + gaze.x, y: anchor.y + gaze.y }) || safeFace(points);
    if (face) {
      lastSafePoints = clone(points); lastSafeFace = face;
    } else {
      // Guard rare spring overshoots without changing the user's saved sculpt target.
      // Keep the most recent safe custom contour; never expose eyes outside the skin.
      points.forEach((p, i) => { p.x = lastSafePoints[i].x; p.y = lastSafePoints[i].y; velocities[i].x = 0; velocities[i].y = 0; });
      face = lastSafeFace;
    }
    body.setAttribute('d', closedPath(points));
    creature.setAttribute('transform', `translate(${320 + pose.drift} ${428 - pose.lift}) rotate(${pose.tilt})`);
    floor.setAttribute('cx', 320 + pose.drift * .3);
    floor.setAttribute('rx', (Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x))) * .47 - pose.lift * .8);
    floor.setAttribute('opacity', .95 - pose.lift * .019);
    const blink = blinkAt(time - blinkStart);
    const faceY = face.y;
    const faceX = face.x;
    eyeLeft.setAttribute('cx', -29 + faceX);
    eyeRight.setAttribute('cx', 29 + faceX);
    for (const eye of [eyeLeft, eyeRight]) {
      eye.setAttribute('cy', faceY);
      eye.setAttribute('ry', 15.5 * blink);
    }
  }

  function frame(timestamp) {
    const dt = lastFrame === null ? 0 : clamp((timestamp - lastFrame) / 1000, 0, .04);
    lastFrame = timestamp;
    time += dt;
    if (time > blinkStart + .27) {
      if (!doubleBlink && random() < .11) { blinkStart = time + .16; doubleBlink = true; }
      else { blinkStart = time + 2.8 + random() * 3.4; doubleBlink = false; }
    }
    if (time >= gazeNext) {
      const centered = random() < .38;
      gaze.targetX = centered ? 0 : (random() - .5) * 9;
      gaze.targetY = centered ? 0 : (random() - .5) * 4;
      gazeNext = time + 2.7 + random() * 3.2;
    }
    const pose = samplePose(time, amount);
    livePose = pose;
    if (drag?.moved) sculpt.move(modelPoint(drag.clientX, drag.clientY, pose));
    integrate(dt, makeContour(time, pose, amount, sculpt.shape));
    render(pose);
    frameId = requestAnimationFrame(frame);
  }

  function updateControls() {
    undoButton.disabled = sculpt.history.length === 0 && !sculpt.grab;
    resetButton.disabled = !sculpt.changed;
  }
  function modelPoint(clientX, clientY, pose = livePose) {
    const stage = new DOMPoint(clientX, clientY).matrixTransform(scene.getScreenCTM().inverse());
    const dx = stage.x - 320 - pose.drift, dy = stage.y - 428 + pose.lift;
    const radians = pose.tilt * Math.PI / 180;
    const x = dx * Math.cos(radians) + dy * Math.sin(radians);
    const y = (-dx * Math.sin(radians) + dy * Math.cos(radians)) / pose.sy;
    const topWeight = clamp(-y / 215, 0, 1);
    return { x: (x - pose.bend * topWeight * topWeight) / pose.sx, y };
  }
  scene.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag) return;
    if (!sculpt.begin(modelPoint(event.clientX, event.clientY))) return;
    event.preventDefault();
    drag = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    scene.setPointerCapture(event.pointerId); scene.classList.add('is-sculpting');
  });
  scene.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    drag.clientX = event.clientX; drag.clientY = event.clientY;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 3) drag.moved = true;
    if (drag.moved) sculpt.move(modelPoint(event.clientX, event.clientY));
  });
  function finishDrag(event, recoil = true) {
    if (!drag || (event && event.pointerId !== drag.id)) return;
    const id = drag.id;
    if (drag.moved) sculpt.move(modelPoint(drag.clientX, drag.clientY));
    const before = sculpt.grab?.before;
    const changed = sculpt.release();
    if (changed && recoil && amount > 0) {
      recoilUntil = time + 1.4;
      points.forEach((p, i) => {
        // A small release impulse is tied to material displacement, so even a held,
        // settled stretch recoils. The saved sculpt target is never moved back.
        velocities[i].x -= clamp((sculpt.shape[i].x - before[i].x) * 1.15, -165, 165) * amount;
        velocities[i].y -= clamp((sculpt.shape[i].y - before[i].y) * 1.15, -165, 165) * amount;
      });
    }
    drag = null;
    scene.classList.remove('is-sculpting');
    if (scene.hasPointerCapture(id)) scene.releasePointerCapture(id);
    updateControls();
  }
  scene.addEventListener('pointerup', finishDrag);
  scene.addEventListener('pointercancel', finishDrag);
  scene.addEventListener('lostpointercapture', finishDrag);
  function softenMomentum() { recoilUntil = -Infinity; velocities.forEach(v => { v.x *= .2; v.y *= .2; }); }
  function undo() { finishDrag(null, false); sculpt.undo(); softenMomentum(); updateControls(); }
  function reset() { finishDrag(null, false); sculpt.reset(); softenMomentum(); updateControls(); }
  undoButton.addEventListener('click', undo);
  resetButton.addEventListener('click', reset);
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
    if (event.key === 'Escape') finishDrag();
  });
  updateControls();

  // Pausing the simulation clock avoids a jump or fast-forward after a hidden tab resumes.
  document.addEventListener('visibilitychange', () => {
    finishDrag(null, false);
    cancelAnimationFrame(frameId);
    lastFrame = null;
    if (!document.hidden) frameId = requestAnimationFrame(frame);
  });
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frameId); lastFrame = null; });
  window.addEventListener('pageshow', event => {
    if (event.persisted && !document.hidden) { cancelAnimationFrame(frameId); lastFrame = null; frameId = requestAnimationFrame(frame); }
  });
  render(samplePose(0, amount));
  frameId = requestAnimationFrame(frame);
})();
