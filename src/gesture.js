import { clamp } from './sculpture.js';

export function measurePinch(landmarks, aspect = 16 / 9) {
  const length = (a, b) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  return length(landmarks[4], landmarks[8]) / Math.max(length(landmarks[5], landmarks[17]), 0.035);
}

export function pinchPoint(landmarks) {
  return { x: 1 - (landmarks[4].x + landmarks[8].x) / 2, y: (landmarks[4].y + landmarks[8].y) / 2 };
}

export class GestureFilter {
  constructor() { this.reset(); }
  reset() { this.pinched = false; this.point = null; this.candidate = null; this.candidateSince = 0; }
  update(landmarks, now, threshold = 0.32, aspect = 16 / 9) {
    const ratio = measurePinch(landmarks, aspect);
    const rawPoint = pinchPoint(landmarks);
    if (!this.point) this.point = rawPoint;
    const movement = Math.hypot(rawPoint.x - this.point.x, rawPoint.y - this.point.y);
    const alpha = clamp(0.24 + movement * 4, 0.24, 0.78);
    this.point = { x: this.point.x + (rawPoint.x - this.point.x) * alpha, y: this.point.y + (rawPoint.y - this.point.y) * alpha };
    const desired = this.pinched ? ratio < threshold + 0.16 : ratio < threshold;
    let started = false;
    let ended = false;
    if (desired !== this.pinched) {
      if (this.candidate !== desired) { this.candidate = desired; this.candidateSince = now; }
      if (now - this.candidateSince >= 65) {
        started = desired;
        ended = !desired;
        this.pinched = desired;
        this.candidate = null;
      }
    } else this.candidate = null;
    return { point: this.point, ratio, pinched: this.pinched, started, ended };
  }
}
