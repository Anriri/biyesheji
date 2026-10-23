import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = {};
vm.runInNewContext(readFileSync(new URL('../life-prototype/creature.js', import.meta.url), 'utf8'), context);
const { samplePose, makeContour, closedPath, blinkAt } = context.CreatureMotion;
const area = points => Math.abs(points.reduce((sum, p, i) => {
  const q = points[(i + 1) % points.length];
  return sum + p.x * q.y - p.y * q.x;
}, 0)) / 2;

test('初生动画：浮动、摇晃和挤压幅度始终柔和，横纵比例保持面积感', () => {
  let lowest = Infinity, highest = -Infinity;
  for (let time = 0; time < 90; time += .05) {
    const pose = samplePose(time);
    assert.ok(pose.sy > .95 && pose.sy < 1.05);
    assert.ok(Math.abs(pose.sx * pose.sy - 1) < 1e-12);
    assert.ok(Math.abs(pose.tilt) < 1.81);
    assert.ok(Math.abs(pose.drift) < 4.81);
    assert.ok(pose.lift > -.71 && pose.lift < 14.31);
    lowest = Math.min(lowest, pose.lift); highest = Math.max(highest, pose.lift);
  }
  assert.ok(highest - lowest > 12);
  assert.ok(samplePose(0).sy < 1);
  assert.ok(samplePose(Math.PI / 1.04).sy > 1);
});

test('初生动画：连续 90 秒的轮廓保持圆润闭合，无尖点或面积突变', () => {
  const baseline = area(makeContour(0, samplePose(0)));
  for (let time = 0; time < 90; time += .15) {
    const points = makeContour(time, samplePose(time));
    assert.equal(points.length, 32);
    assert.ok(points.every(p => Number.isFinite(p.x + p.y) && Math.abs(p.x) < 155 && p.y > -235 && p.y < 12));
    assert.ok(Math.abs(area(points) / baseline - 1) < .04);
    for (let i = 0; i < points.length; i++) {
      const a = points[(i + 31) % 32], b = points[i], c = points[(i + 1) % 32];
      const cosine = ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / (Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y));
      assert.ok(Math.acos(Math.min(1, Math.max(-1, cosine))) < .65);
    }
    assert.match(closedPath(points), /^M .* Z$/);
    assert.doesNotMatch(closedPath(points), /NaN|Infinity/);
    const next = makeContour(time + 1 / 60, samplePose(time + 1 / 60));
    assert.ok(points.every((p, i) => Math.hypot(p.x - next[i].x, p.y - next[i].y) < 1));
  }
});

test('初生动画：眨眼平滑闭合并重新睁开，不会一直闭眼', () => {
  assert.equal(blinkAt(-1), 1);
  assert.equal(blinkAt(0), 1);
  assert.ok(blinkAt(.11) <= .061);
  assert.ok(blinkAt(.20) > blinkAt(.13));
  assert.equal(blinkAt(.28), 1);
  assert.equal(blinkAt(12), 1);
});

test('初生动画：减少动态效果偏好只降低幅度，不停止生命感', () => {
  const normal = samplePose(2), gentle = samplePose(2, .45);
  assert.ok(gentle.lift > 0 && gentle.lift < normal.lift);
  assert.ok(Math.abs(gentle.sy - 1) < Math.abs(normal.sy - 1));
});
