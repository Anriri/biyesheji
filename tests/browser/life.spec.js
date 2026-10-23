import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const entry = 'http://localhost:5173/life-prototype/standalone.html';
const html = readFileSync(new URL('../../life-prototype/standalone.html', import.meta.url), 'utf8');
const cornerFixture = JSON.parse(readFileSync(new URL('../fixtures/life-contour-corners.json', import.meta.url), 'utf8')).lowerLeftCorner;

// The managed Chromium blocks all file:// navigation. Deliver the exact portable HTML
// through a route fixture instead; no bundling, dev-client injection or network is used.
test.beforeEach(async ({ page }) => {
  await page.route(entry, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
});

test('单文件团子：保留纯白形象、自动动画及离线资源，新增肢体工具', async ({ page }) => {
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url()) && request.url() !== entry) external.push(request.url()); });
  await page.goto(entry);
  await expect(page.locator('#body')).toHaveAttribute('d', /^M /);
  await expect(page.locator('#body')).toHaveAttribute('fill', '#ffffff');
  await expect(page.locator('button')).toHaveCount(5);
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '重置', exact: true })).toBeDisabled();
  await expect(page.locator('nav, video, canvas')).toHaveCount(0);
  await expect(page.locator('#eyes ellipse')).toHaveCount(2);
  const samples = await page.evaluate(() => new Promise(resolve => {
    const start = performance.now();
    let frames = 0, minRy = Infinity, maxRy = 0, minCx = Infinity, maxCx = -Infinity;
    const paths = new Set();
    function sample(now) {
      frames++;
      const eye = document.getElementById('eye-left');
      const ry = Number(eye.getAttribute('ry')), cx = Number(eye.getAttribute('cx'));
      minRy = Math.min(minRy, ry); maxRy = Math.max(maxRy, ry);
      minCx = Math.min(minCx, cx); maxCx = Math.max(maxCx, cx);
      paths.add(document.getElementById('body').getAttribute('d'));
      if (now - start < 7500) requestAnimationFrame(sample);
      else resolve({ frames, minRy, maxRy, minCx, maxCx, paths: paths.size });
    }
    requestAnimationFrame(sample);
  }));
  expect(samples.frames).toBeGreaterThan(100);
  expect(samples.paths).toBeGreaterThan(80);
  expect(samples.minRy).toBeLessThan(3);
  expect(samples.maxRy).toBeGreaterThan(15);
  expect(samples.maxCx - samples.minCx).toBeGreaterThan(1);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  await page.screenshot({ path: 'test-results/life-desktop.png' });
});

test('初生动画移动端可见且没有横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(entry);
  await expect(page.locator('#body')).toHaveAttribute('d', /^M /);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  const eye = await page.locator('#eyes').boundingBox();
  expect(eye.x).toBeGreaterThan(0);
  expect(eye.x + eye.width).toBeLessThan(390);
  await page.screenshot({ path: 'test-results/life-mobile.png' });
});

test('鼠标实时拉伸并保留形状，眼睛始终在身体内，撤销与重置不停止动画', async ({ page }) => {
  await page.goto(entry);
  const width = () => page.locator('#body').evaluate(p => p.getBBox().width);
  const original = await width();
  async function pull(dx, dy) {
    const from = await page.locator('#body').evaluate(p => {
      const b = p.getBBox(), q = new DOMPoint(b.x + b.width * .98, b.y + b.height * .55).matrixTransform(p.getScreenCTM());
      return { x: q.x, y: q.y };
    });
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 15 });
    await expect(page.locator('.scene')).toHaveClass(/is-sculpting/);
    await page.mouse.up();
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeEnabled();
  }
  await pull(76, -8);
  await expect.poll(width).toBeGreaterThan(original + 22);
  await page.waitForTimeout(1100);
  expect(await width()).toBeGreaterThan(original + 22);
  const allInside = await page.evaluate(() => new Promise(resolve => {
    const start = performance.now();
    function sample(now) {
      const body = document.getElementById('body');
      for (const eye of document.querySelectorAll('#eyes ellipse')) for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6;
        const x = Number(eye.getAttribute('cx')) + Number(eye.getAttribute('rx')) * Math.cos(angle);
        const y = Number(eye.getAttribute('cy')) + Number(eye.getAttribute('ry')) * Math.sin(angle);
        if (!body.isPointInFill(new DOMPoint(x, y))) return resolve(false);
      }
      if (now - start < 1000) requestAnimationFrame(sample); else resolve(true);
    }
    requestAnimationFrame(sample);
  }));
  expect(allInside).toBe(true);
  await page.keyboard.press('Control+z');
  await expect.poll(width).toBeLessThan(original + 12);
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
  await pull(66, 10);
  await expect.poll(width).toBeGreaterThan(original + 20);
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await expect.poll(width).toBeLessThan(original + 12);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect.poll(width).toBeGreaterThan(original + 20);
  const before = await page.locator('#body').getAttribute('d');
  await expect(page.locator('#body')).not.toHaveAttribute('d', before);
  await page.screenshot({ path: 'test-results/life-sculpted.png' });
});

test('增强塑形：大幅局部拉伸实时可见，保持后松手仍会回弹并保留', async ({ page }) => {
  await page.goto(entry);
  const initial = await page.locator('#body').evaluate(p => p.getBBox().width);
  const from = await page.locator('#body').evaluate(p => {
    const b = p.getBBox(), q = new DOMPoint(b.x + b.width * .98, b.y + b.height * .55).matrixTransform(p.getScreenCTM());
    return { x: q.x, y: q.y };
  });
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(from.x + 300, from.y - 6, { steps: 30 });
  await expect.poll(() => page.locator('#body').evaluate(p => p.getBBox().width)).toBeGreaterThan(initial + 160);
  await page.waitForTimeout(750); // Let the held shape settle: release must still recoil.
  await page.mouse.up();
  const samples = await page.evaluate(() => new Promise(resolve => {
    const start = performance.now(), result = [];
    function sample(now) {
      const body = document.getElementById('body');
      for (const eye of document.querySelectorAll('#eyes ellipse')) for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6;
        const point = new DOMPoint(Number(eye.getAttribute('cx')) + Number(eye.getAttribute('rx')) * Math.cos(angle), Number(eye.getAttribute('cy')) + Number(eye.getAttribute('ry')) * Math.sin(angle));
        if (!body.isPointInFill(point)) return resolve({ outside: true });
      }
      result.push({ t: now - start, width: body.getBBox().width });
      if (now - start < 1200) requestAnimationFrame(sample); else resolve({ result });
    }
    requestAnimationFrame(sample);
  }));
  expect(samples.outside).not.toBe(true);
  const values = samples.result, first = values[0], last = values.at(-1);
  const recoil = values.map(v => v.width - (first.width + (last.width - first.width) * (v.t - first.t) / (last.t - first.t)));
  // Remove slow breathing drift; the remaining non-linear release motion must be visible.
  expect(Math.max(...recoil) - Math.min(...recoil)).toBeGreaterThan(5);
  expect(last.width).toBeGreaterThan(initial + 150);
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeEnabled();
  await page.screenshot({ path: 'test-results/life-large-stretch.png' });
});

test('增强塑形：从顶部明显压扁且横向摊开，动画持续运行', async ({ page }) => {
  await page.goto(entry);
  const initial = await page.locator('#body').evaluate(p => {
    const b = p.getBBox(), q = new DOMPoint(b.x + b.width * .5, b.y + 2).matrixTransform(p.getScreenCTM());
    return { width: b.width, height: b.height, x: q.x, y: q.y };
  });
  await page.mouse.move(initial.x, initial.y); await page.mouse.down();
  await page.mouse.move(initial.x, initial.y + 180, { steps: 30 }); await page.mouse.up();
  await expect.poll(() => page.locator('#body').evaluate(p => p.getBBox().height)).toBeLessThan(initial.height * .58);
  await page.waitForTimeout(1500);
  const flat = await page.locator('#body').evaluate(p => ({ width: p.getBBox().width, height: p.getBBox().height }));
  expect(flat.width).toBeGreaterThan(initial.width + 35);
  expect(flat.height).toBeLessThan(initial.height * .58);
  expect(flat.width / flat.height).toBeGreaterThan(2.7);
  const path = await page.locator('#body').getAttribute('d');
  await expect(page.locator('#body')).not.toHaveAttribute('d', path);
  await page.screenshot({ path: 'test-results/life-pancake.png' });
});

test('连续鼠标塑形：先向两边拉宽，再抓顶部向上拉，保留宽度且可单独撤销', async ({ page }) => {
  await page.goto(entry);
  async function edge(which) {
    return page.locator('#body').evaluate((path, side) => {
      const length = path.getTotalLength();
      let best = path.getPointAtLength(0);
      for (let i = 1; i < 320; i++) {
        const p = path.getPointAtLength(length * i / 320);
        if ((side === 'top' && p.y < best.y) || (side === 'left' && p.x < best.x) || (side === 'right' && p.x > best.x)) best = p;
      }
      const point = new DOMPoint(best.x, best.y + (side === 'top' ? 2 : 0)).matrixTransform(path.getScreenCTM());
      return { x: point.x, y: point.y };
    }, which);
  }
  async function pull(which, dx, dy) {
    const from = await edge(which);
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await expect(page.locator('.scene')).toHaveClass(/is-sculpting/);
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 30 });
    await page.waitForTimeout(350);
    await page.mouse.up();
    await page.waitForTimeout(1600);
  }
  const dimensions = () => page.locator('#body').evaluate(p => ({ width: p.getBBox().width, height: p.getBBox().height }));
  await pull('right', 310, 0);
  await pull('left', -260, 0);
  const wide = await dimensions();
  expect(wide.width).toBeGreaterThan(560);
  await page.screenshot({ path: 'test-results/life-wide-before-up.png' });
  await pull('top', 20, -170);
  const tall = await dimensions();
  expect(tall.height).toBeGreaterThan(wide.height + 100);
  expect(tall.width).toBeGreaterThan(wide.width - 55);
  const inside = await page.evaluate(() => {
    const body = document.getElementById('body');
    return [...document.querySelectorAll('#eyes ellipse')].every(eye => Array.from({ length: 16 }, (_, i) => {
      const t = i * Math.PI / 8;
      return body.isPointInFill(new DOMPoint(+eye.getAttribute('cx') + +eye.getAttribute('rx') * Math.cos(t), +eye.getAttribute('cy') + +eye.getAttribute('ry') * Math.sin(t)));
    }).every(Boolean));
  });
  expect(inside).toBe(true);
  await page.screenshot({ path: 'test-results/life-wide-then-up.png' });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await dimensions()).height).toBeLessThan(wide.height + 25);
  expect((await dimensions()).width).toBeGreaterThan(wide.width - 55);
});

test('左下凸角：从旧版卡住的有效轮廓开始，用真实鼠标向内收，再向外拉', async ({ page }) => {
  // Start from a captured valid user-shaped contour; only this test fixture sets
  // initial state. All subsequent edits use the application's real pointer path.
  const fixtureHTML = html.replace('const sculpt = new SoftSculpt();', `const sculpt = new SoftSculpt(); sculpt.shape = ${JSON.stringify(cornerFixture.shape)};`)
    .replace('const points = makeContour(0, samplePose(0, amount), amount);', 'const points = makeContour(0, samplePose(0, amount), amount, sculpt.shape);');
  await page.route(entry, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixtureHTML }));
  await page.goto(entry);
  async function contact() {
    return page.locator('#body').evaluate((p, index) => {
      const values = p.getAttribute('d').match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
      const offset = index === 0 ? 0 : 2 + (index - 1) * 6 + 4;
      const point = new DOMPoint(values[offset], values[offset + 1]);
      const matrix = p.getScreenCTM(), screen = point.matrixTransform(matrix);
      return { x: point.x, y: point.y, clientX: screen.x, clientY: screen.y, scale: Math.hypot(matrix.a, matrix.b) };
    }, cornerFixture.index);
  }
  const initial = await contact();
  await page.screenshot({ path: 'test-results/life-corner-before.png' });
  async function pull(sign) {
    const from = await contact();
    await page.mouse.move(from.clientX, from.clientY); await page.mouse.down();
    await expect(page.locator('.scene')).toHaveClass(/is-sculpting/);
    await page.mouse.move(from.clientX + cornerFixture.delta.x * from.scale * sign, from.clientY + cornerFixture.delta.y * from.scale * sign, { steps: 30 });
    await page.waitForTimeout(350); await page.mouse.up();
    await page.waitForTimeout(1400);
  }
  await pull(1);
  const inward = await contact();
  expect(((inward.x - initial.x) * cornerFixture.delta.x + (inward.y - initial.y) * cornerFixture.delta.y) / 65).toBeGreaterThan(35);
  await page.screenshot({ path: 'test-results/life-corner-inward.png' });
  await pull(-.7);
  const outward = await contact();
  expect(Math.hypot(outward.x - inward.x, outward.y - inward.y)).toBeGreaterThan(20);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => { const p = await contact(); return Math.hypot(p.x - inward.x, p.y - inward.y); }).toBeLessThan(12);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => { const p = await contact(); return Math.hypot(p.x - initial.x, p.y - initial.y); }).toBeLessThan(12);
});

test('自由肢体：边缘生成多个面状肢体，末端和弯曲可拖动、粗细可改、删除可撤销', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(entry);
  const bodySize = () => page.locator('#body').evaluate(p => ({ w: p.getBBox().width, h: p.getBBox().height }));
  const initial = await bodySize();
  await page.getByRole('button', { name: '长出肢体', exact: true }).click();
  async function create(side, dx, dy) {
    const from = await page.locator('#body').evaluate((p, side) => {
      const length = p.getTotalLength(); let best = p.getPointAtLength(0);
      for (let i = 1; i < 300; i++) {
        const q = p.getPointAtLength(length * i / 300);
        if ((side === 'right' && q.x > best.x) || (side === 'left' && q.x < best.x) || (side === 'bottom' && q.y > best.y)) best = q;
      }
      const q = new DOMPoint(best.x, best.y).matrixTransform(p.getScreenCTM()); return { x: q.x, y: q.y };
    }, side);
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 25 });
    await page.waitForTimeout(400); await page.mouse.up(); await page.waitForTimeout(850);
  }
  await create('right', 130, -35);
  await expect(page.locator('#limbs path')).toHaveCount(1);
  await create('left', -100, -30);
  await create('bottom', 40, 95);
  await expect(page.locator('#limbs path')).toHaveCount(3);
  expect(Math.abs((await bodySize()).w - initial.w)).toBeLessThan(22);
  expect(Math.abs((await bodySize()).h - initial.h)).toBeLessThan(22);
  await expect(page.locator('#skin')).toHaveAttribute('filter', 'url(#soft-edge)');
  expect(await page.locator('#limbs path').evaluateAll(paths => paths.every(p => !p.hasAttribute('filter') && getComputedStyle(p).fill === 'rgb(255, 255, 255)' && p.getAttribute('d').includes(' C ')))).toBe(true);
  async function handle(kind) {
    return page.locator(`.limb-handle.${kind}`).evaluate(p => {
      const point = new DOMPoint(+p.getAttribute('cx'), +p.getAttribute('cy')), q = point.matrixTransform(p.getScreenCTM());
      return { x: q.x, y: q.y, localX: point.x, localY: point.y };
    });
  }
  const beforeTip = await handle('tip');
  await page.mouse.move(beforeTip.x, beforeTip.y); await page.mouse.down();
  await expect(page.locator('.scene')).toHaveClass(/is-sculpting/);
  await page.mouse.move(beforeTip.x + 42, beforeTip.y + 40, { steps: 20 });
  await page.waitForTimeout(450); await page.mouse.up(); await page.waitForTimeout(1000);
  const afterTip = await handle('tip');
  expect(Math.hypot(afterTip.localX - beforeTip.localX, afterTip.localY - beforeTip.localY)).toBeGreaterThan(35);
  const beforeBend = await handle('bend');
  await page.mouse.move(beforeBend.x, beforeBend.y); await page.mouse.down();
  await expect(page.locator('.scene')).toHaveClass(/is-sculpting/);
  await page.mouse.move(beforeBend.x - 35, beforeBend.y, { steps: 20 }); await page.mouse.up();
  await page.waitForTimeout(1000);
  const afterBend = await handle('bend');
  expect(Math.hypot(afterBend.localX - beforeBend.localX, afterBend.localY - beforeBend.localY)).toBeGreaterThan(15);
  const prior = await page.locator('#limbs path').last().getAttribute('d');
  await page.getByRole('slider', { name: '肢体粗细' }).focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('slider', { name: '肢体粗细' })).toHaveValue('42');
  await expect(page.locator('#limbs path').last()).not.toHaveAttribute('d', prior);
  await page.screenshot({ path: 'test-results/life-free-limbs.png' });
  await page.getByRole('button', { name: '删除肢体', exact: true }).click();
  await expect(page.locator('#limbs path')).toHaveCount(2);
  await page.keyboard.press('Control+z'); await expect(page.locator('#limbs path')).toHaveCount(3);
  await page.getByRole('button', { name: '重置', exact: true }).click(); await expect(page.locator('#limbs path')).toHaveCount(0);
  await page.keyboard.press('Control+z'); await expect(page.locator('#limbs path')).toHaveCount(3);
  await page.getByRole('button', { name: '揉捏身体', exact: true }).click();
  const top = await page.locator('#body').evaluate(p => {
    const b = p.getBBox(), q = new DOMPoint(b.x + b.width * .5, b.y + 2).matrixTransform(p.getScreenCTM()); return { x: q.x, y: q.y };
  });
  const beforeBody = await bodySize();
  await page.mouse.move(top.x, top.y); await page.mouse.down(); await page.mouse.move(top.x, top.y - 60, { steps: 15 }); await page.mouse.up();
  await expect.poll(async () => (await bodySize()).h).toBeGreaterThan(beforeBody.h + 25);
  await expect(page.locator('#limbs path')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('长肢体：松手有可见回弹，自动留出编辑空间，根部连续且可重新选中', async ({ page }) => {
  await page.goto(entry);
  await page.getByRole('button', { name: '长出肢体', exact: true }).click();
  const from = await page.locator('#body').evaluate(p => {
    const length = p.getTotalLength(); let best = p.getPointAtLength(0);
    for (let i = 1; i < 300; i++) { const q = p.getPointAtLength(length * i / 300); if (q.y > best.y) best = q; }
    const screen = new DOMPoint(best.x, best.y).matrixTransform(p.getScreenCTM()); return { x: screen.x, y: screen.y };
  });
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(from.x, from.y + 245, { steps: 30 }); await page.waitForTimeout(650);
  await page.mouse.up();
  const samples = await page.evaluate(() => new Promise(resolve => {
    const start = performance.now(), values = [];
    function sample(now) {
      const tip = document.querySelector('.limb-handle.tip'), body = document.getElementById('body').getBBox();
      values.push({ t: now - start, y: +tip.getAttribute('cy') - body.y - body.height });
      if (now - start < 1400) requestAnimationFrame(sample); else resolve(values);
    }
    requestAnimationFrame(sample);
  }));
  const first = samples[0], last = samples.at(-1);
  const recoil = samples.map(v => v.y - first.y - (last.y - first.y) * (v.t - first.t) / (last.t - first.t));
  expect(Math.max(...recoil) - Math.min(...recoil)).toBeGreaterThan(1.5);
  expect(last.y).toBeGreaterThan(150);
  const handle = await page.locator('.limb-handle.tip').boundingBox();
  expect(handle.y + handle.height).toBeLessThan(650);
  const connected = await page.evaluate(() => {
    const body = document.getElementById('body'), limb = document.querySelector('#limbs path');
    const length = body.getTotalLength(); let root = body.getPointAtLength(0);
    for (let i = 1; i < 300; i++) { const p = body.getPointAtLength(length * i / 300); if (p.y > root.y) root = p; }
    for (let y = -12; y <= 38; y += 2) if (!body.isPointInFill(new DOMPoint(root.x, root.y + y)) && !limb.isPointInFill(new DOMPoint(root.x, root.y + y))) return false;
    return true;
  });
  expect(connected).toBe(true);
  await page.getByRole('button', { name: '揉捏身体', exact: true }).click();
  await expect(page.locator('.limb-handle')).toHaveCount(0);
  const tip = await page.locator('#limbs path').evaluate(p => {
    const box = p.getBBox();
    const q = new DOMPoint(box.x + box.width / 2, box.y + box.height - 12).matrixTransform(p.getScreenCTM());
    return { x: q.x, y: q.y };
  });
  await page.mouse.click(tip.x, tip.y);
  await expect(page.locator('.limb-handle.tip')).toHaveCount(1);
  await page.keyboard.press('Delete'); await expect(page.locator('#limbs path')).toHaveCount(0);
  await page.keyboard.press('Control+z'); await expect(page.locator('#limbs path')).toHaveCount(1);
});

test('节外生枝：肢体上再长分支，三级连接随父段移动，子树删除和撤销正确', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(entry);
  await page.getByRole('button', { name: '长出肢体', exact: true }).click();
  const root = await page.locator('#body').evaluate(p => {
    let best = p.getPointAtLength(0);
    for (let i = 1; i < 400; i++) { const q = p.getPointAtLength(p.getTotalLength() * i / 400); if (q.x > best.x) best = q; }
    const q = new DOMPoint(best.x, best.y).matrixTransform(p.getScreenCTM()); return { x: q.x, y: q.y };
  });
  async function pull(from, dx, dy) {
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await expect(page.locator('.scene')).toHaveClass(/is-sculpting/);
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 24 });
    await page.mouse.up(); await page.waitForTimeout(1200);
  }
  async function edge(id, side) {
    return page.locator(`#limbs path[data-limb="${id}"]`).evaluate((p, side) => {
      const b = p.getBBox(), length = p.getTotalLength();
      const target = side === 'top' ? { x: b.x + b.width * .73, y: b.y } : side === 'right' ? { x: b.x + b.width, y: b.y + b.height * .28 } : { x: b.x + b.width * .75, y: b.y + b.height };
      let best, bestT, nearest = Infinity;
      for (let i = 0; i < 600; i++) {
        const t = length * i / 600, q = p.getPointAtLength(t), d = Math.hypot(q.x - target.x, q.y - target.y);
        if (d < nearest) { best = q; bestT = t; nearest = d; }
      }
      const a = p.getPointAtLength(Math.max(0, bestT - .5)), c = p.getPointAtLength(Math.min(length, bestT + .5));
      const norm = Math.hypot(c.x - a.x, c.y - a.y) || 1;
      // Tube contours have negative winding; move two units INTO the skin.
      const q = new DOMPoint(best.x + (c.y - a.y) / norm * 2, best.y - (c.x - a.x) / norm * 2).matrixTransform(p.getScreenCTM());
      return { x: q.x, y: q.y };
    }, side);
  }
  await pull(root, 175, 0);
  const parent = await page.locator('#limbs path').first().getAttribute('data-limb');
  const select = await edge(parent, 'top');
  await page.mouse.click(select.x, select.y);
  await expect(page.locator('#limbs path')).toHaveCount(1);
  await expect(page.locator('.limb-handle.tip')).toHaveAttribute('data-limb', parent);
  await pull(await edge(parent, 'top'), 5, -115);
  await expect(page.locator('#limbs path')).toHaveCount(2);
  const child = await page.locator('#limbs path').last().getAttribute('data-limb');
  await pull(await edge(child, 'right'), 85, -10);
  await expect(page.locator('#limbs path')).toHaveCount(3);
  const grandchild = await page.locator('#limbs path').last().getAttribute('data-limb');
  await page.screenshot({ path: 'test-results/life-branches.png' });
  await page.getByRole('button', { name: '揉捏身体', exact: true }).click();
  const from = await edge(parent, 'bottom'); await page.mouse.click(from.x, from.y);
  await expect(page.locator('.limb-handle.tip')).toHaveAttribute('data-limb', parent);
  const before = await page.locator(`#limbs path[data-limb="${grandchild}"]`).getAttribute('d');
  const handle = await page.locator('.limb-handle.tip').evaluate(p => {
    const q = new DOMPoint(+p.getAttribute('cx'), +p.getAttribute('cy')).matrixTransform(p.getScreenCTM()); return { x: q.x, y: q.y };
  });
  await pull(handle, 35, 45);
  await expect(page.locator(`#limbs path[data-limb="${grandchild}"]`)).not.toHaveAttribute('d', before);
  const connected = await page.evaluate(([parent, child, grandchild]) => {
    function overlap(a, b) {
      const p = document.querySelector(`#limbs path[data-limb="${a}"]`), q = document.querySelector(`#limbs path[data-limb="${b}"]`);
      const x = p.getBBox(), y = q.getBBox();
      for (let i = Math.max(x.x, y.x); i <= Math.min(x.x + x.width, y.x + y.width); i += 1.5) for (let j = Math.max(x.y, y.y); j <= Math.min(x.y + x.height, y.y + y.height); j += 1.5) {
        if (p.isPointInFill(new DOMPoint(i, j)) && q.isPointInFill(new DOMPoint(i, j))) return true;
      }
      return false;
    }
    return overlap(parent, child) && overlap(child, grandchild);
  }, [parent, child, grandchild]);
  expect(connected).toBe(true);
  const childEnd = await page.locator(`#limbs path[data-limb="${child}"]`).evaluate(p => {
    const t = p.getTotalLength() * .5, a = p.getPointAtLength(t - .5), b = p.getPointAtLength(t + .5), c = p.getPointAtLength(t), d = Math.hypot(b.x - a.x, b.y - a.y);
    const q = new DOMPoint(c.x + (b.y - a.y) / d * 2, c.y - (b.x - a.x) / d * 2).matrixTransform(p.getScreenCTM()); return { x: q.x, y: q.y };
  });
  await page.mouse.click(childEnd.x, childEnd.y);
  await expect(page.locator('.limb-handle.tip')).toHaveAttribute('data-limb', child);
  await page.getByRole('button', { name: '删除肢体', exact: true }).click();
  await expect(page.locator('#limbs path')).toHaveCount(1);
  await expect(page.locator('#limbs path').first()).toHaveAttribute('data-limb', parent);
  await page.keyboard.press('Control+z'); await expect(page.locator('#limbs path')).toHaveCount(3);
  const parentEdge = await edge(parent, 'bottom'); await page.mouse.click(parentEdge.x, parentEdge.y);
  await expect(page.locator('.limb-handle.tip')).toHaveAttribute('data-limb', parent);
  await page.getByRole('button', { name: '删除肢体', exact: true }).click(); await expect(page.locator('#limbs path')).toHaveCount(0);
  await page.keyboard.press('Control+z'); await expect(page.locator('#limbs path')).toHaveCount(3);
  expect(errors).toEqual([]);
});
