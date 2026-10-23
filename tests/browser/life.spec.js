import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const entry = 'http://localhost:5173/life-prototype/standalone.html';
const html = readFileSync(new URL('../../life-prototype/standalone.html', import.meta.url), 'utf8');

// The managed Chromium blocks all file:// navigation. Deliver the exact portable HTML
// through a route fixture instead; no bundling, dev-client injection or network is used.
test.beforeEach(async ({ page }) => {
  await page.route(entry, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
});

test('单文件团子：只增加撤销和重置，保持纯白形象、自动动画及离线资源', async ({ page }) => {
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url()) && request.url() !== entry) external.push(request.url()); });
  await page.goto(entry);
  await expect(page.locator('#body')).toHaveAttribute('d', /^M /);
  await expect(page.locator('#body')).toHaveAttribute('fill', '#ffffff');
  await expect(page.locator('button')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '重置', exact: true })).toBeDisabled();
  await expect(page.locator('input, nav, video, canvas')).toHaveCount(0);
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
