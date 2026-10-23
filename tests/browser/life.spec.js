import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const entry = 'http://localhost:5173/life-prototype/standalone.html';
const html = readFileSync(new URL('../../life-prototype/standalone.html', import.meta.url), 'utf8');

// The managed Chromium blocks all file:// navigation. Deliver the exact portable HTML
// through a route fixture instead; no bundling, dev-client injection or network is used.
test.beforeEach(async ({ page }) => {
  await page.route(entry, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
});

test('单文件初生动画：无界面文字、按钮、外部资源请求，自动活动和眨眼', async ({ page }) => {
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url()) && request.url() !== entry) external.push(request.url()); });
  await page.goto(entry);
  await expect(page.locator('#body')).toHaveAttribute('d', /^M /);
  await expect(page.locator('#body')).toHaveAttribute('fill', '#ffffff');
  expect(await page.locator('body').innerText()).toBe('');
  await expect(page.locator('button, input, nav, video, canvas')).toHaveCount(0);
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
