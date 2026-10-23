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

  function makeContour(time, pose, amount = 1) {
    const points = [];
    for (let i = 0; i < 32; i++) {
      const angle = TAU * i / 32;
      const rest = 1 + .042 * Math.sin(3 * angle + .6) + .018 * Math.cos(2 * angle - .8);
      const ripple = amount * (.011 * Math.sin(2 * angle - time * 1.30) + .007 * Math.sin(3 * angle + time * .81 + .8));
      const x = Math.sin(angle) * 112 * (1 - .16 * Math.cos(angle)) * (rest + ripple);
      const y = -108 - Math.cos(angle) * 106 * (rest + ripple);
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

  // Also used by the small, dependency-free numerical regression test.
  globalThis.CreatureMotion = Object.freeze({ samplePose, makeContour, closedPath, blinkAt });
  if (typeof document === 'undefined') return;

  const body = document.getElementById('body');
  const creature = document.getElementById('creature');
  const floor = document.getElementById('floor');
  const eyeLeft = document.getElementById('eye-left');
  const eyeRight = document.getElementById('eye-right');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let amount = reduced.matches ? .45 : 1;
  reduced.addEventListener?.('change', event => { amount = event.matches ? .45 : 1; });

  let seed = 0x7193;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let time = 0;
  let lastFrame = null;
  let frameId;
  let blinkStart = 2.4;
  let doubleBlink = false;
  let gazeNext = 1.8;
  const gaze = { x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0 };
  const points = makeContour(0, samplePose(0, amount), amount);
  const velocities = points.map(() => ({ x: 0, y: 0 }));

  function integrate(dt, target) {
    const steps = Math.max(1, Math.ceil(dt * 120));
    const h = dt / steps;
    for (let step = 0; step < steps; step++) {
      points.forEach((point, i) => {
        // The perimeter lags the center of mass slightly, giving a soft delayed recoil.
        const stiffness = 90 + 9 * Math.sin(i * TAU / points.length);
        for (const axis of ['x', 'y']) {
          velocities[i][axis] += (stiffness * (target[i][axis] - point[axis]) - 13.5 * velocities[i][axis]) * h;
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
    body.setAttribute('d', closedPath(points));
    creature.setAttribute('transform', `translate(${320 + pose.drift} ${428 - pose.lift}) rotate(${pose.tilt})`);
    floor.setAttribute('cx', 320 + pose.drift * .3);
    floor.setAttribute('rx', 112 - pose.lift * .8);
    floor.setAttribute('opacity', .95 - pose.lift * .019);
    const blink = blinkAt(time - blinkStart);
    const faceY = -120 * pose.sy + gaze.y;
    const faceX = pose.bend * .32 + gaze.x;
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
    integrate(dt, makeContour(time, pose, amount));
    render(pose);
    frameId = requestAnimationFrame(frame);
  }

  // Pausing the simulation clock avoids a jump or fast-forward after a hidden tab resumes.
  document.addEventListener('visibilitychange', () => {
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
