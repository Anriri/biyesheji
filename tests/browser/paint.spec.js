import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const entry = 'http://localhost:5173/life-prototype/standalone.html';
const html = readFileSync(new URL('../../life-prototype/standalone.html', import.meta.url), 'utf8');
async function routePage(page) { await page.route(entry, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html })); await page.goto(entry); }
test.beforeEach(async ({ page }) => routePage(page));
async function color(page, value) { await page.locator('#paint-color').evaluate((p, value) => { p.value = value; p.dispatchEvent(new Event('input', { bubbles: true })); }, value); }
async function belly(page) { return page.locator('#body').evaluate(p => { const b = p.getBBox(), q = new DOMPoint(b.x + b.width * .5, b.y + b.height * .76).matrixTransform(p.getScreenCTM()); return { x: q.x, y: q.y }; }); }
async function strokePoint(page, selector = '.paint-stroke') {
  return page.locator(selector).first().evaluate(p => { const n = p.getAttribute('d').match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number), q = new DOMPoint(n[0], n[1]).matrixTransform(p.getScreenCTM()); return { x: q.x, y: q.y }; });
}
async function samplePixel(page) {
  return page.evaluate(async () => {
    const svg = document.querySelector('.scene'), paint = document.querySelector('.paint-stroke');
    const values = paint.getAttribute('d').match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
    const matrix = document.getElementById('creature').transform.baseVal.consolidate().matrix;
    const point = new DOMPoint(values[0], values[1]).matrixTransform(matrix), box = svg.viewBox.baseVal;
    const clone = svg.cloneNode(true); clone.setAttribute('width', '640'); clone.setAttribute('height', '480');
    const image = new Image(); image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone)); await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(Math.round((point.x - box.x) * 640 / box.width), Math.round((point.y - box.y) * 480 / box.height), 1, 1).data);
  });
}
async function expectPixel(page, expected) { await expect.poll(async () => { const p = await samplePixel(page); return Math.max(...expected.map((v, i) => Math.abs(v - p[i]))); }).toBeLessThan(18); }
async function save(page) {
  const wait = page.waitForEvent('download'); await page.getByRole('button', { name: '保存作品', exact: true }).click();
  const download = await wait, path = await download.path(); return { path, data: JSON.parse(readFileSync(path, 'utf8')) };
}

test('绘画与擦除：真实点画、独立底色、擦后重画、撤销重做、文件和浏览器恢复', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('button', { name: '自由涂色', exact: true }).click();
  await expect(page.locator('.swatch')).toHaveCount(18);
  await color(page, '#ff477e'); const point = await belly(page); await page.mouse.click(point.x, point.y);
  await expect(page.locator('.paint-stroke')).toHaveCount(1); await expectPixel(page, [255, 71, 126]);
  await color(page, '#bce8d4'); await page.getByRole('button', { name: '身体底色', exact: true }).click();
  await expect(page.locator('#body')).toHaveAttribute('fill', '#bce8d4'); await expectPixel(page, [255, 71, 126]);
  await page.getByRole('button', { name: '橡皮擦', exact: true }).click();
  await page.locator('#brush-size').focus(); await page.keyboard.press('End');
  let p = await strokePoint(page); await page.mouse.click(p.x, p.y);
  await expect(page.locator('.eraser-path')).toHaveCount(1); await expectPixel(page, [188, 232, 212]);
  await color(page, '#338aff'); await page.getByRole('button', { name: '画笔', exact: true }).click();
  p = await strokePoint(page); await page.mouse.click(p.x, p.y);
  await expect(page.locator('.paint-stroke')).toHaveCount(2); await expectPixel(page, [51, 138, 255]);
  await page.keyboard.press('Control+z'); await expectPixel(page, [188, 232, 212]);
  await page.keyboard.press('Control+z'); await expectPixel(page, [255, 71, 126]);
  await page.keyboard.press('Control+Shift+z'); await expectPixel(page, [188, 232, 212]);
  await page.keyboard.press('Control+y'); await expectPixel(page, [51, 138, 255]);
  const saved = await save(page);
  expect(saved.data.format).toBe('unnamed-creature-art'); expect(saved.data.state.paint.strokes.map(s => s.erase)).toEqual([false, true, false]);
  await page.getByRole('button', { name: '重置', exact: true }).click(); await expect(page.locator('.paint-stroke')).toHaveCount(0);
  await expect(page.locator('#body')).toHaveAttribute('fill', '#ffffff');
  const chooserWait = page.waitForEvent('filechooser'); await page.getByRole('button', { name: '打开作品', exact: true }).click(); await (await chooserWait).setFiles(saved.path);
  await expect(page.locator('.paint-stroke')).toHaveCount(2); await expectPixel(page, [51, 138, 255]);
  await page.locator('#art-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{bad json') });
  await expect(page.locator('#art-status')).toContainText('当前作品未更改'); await expectPixel(page, [51, 138, 255]);
  await page.waitForTimeout(550); await page.reload(); await expect(page.locator('.paint-stroke')).toHaveCount(2);
  await expect(page.locator('#body')).toHaveAttribute('fill', '#bce8d4'); await expectPixel(page, [51, 138, 255]);
  expect(errors).toEqual([]); await page.screenshot({ path: 'test-results/life-paint.png' });
});

test('连续绘画严格裁剪：越过身体边缘仍不染背景，回到身体不跨空白连笔', async ({ page }) => {
  await page.getByRole('button', { name: '自由涂色', exact: true }).click(); await color(page, '#ff00b8');
  await page.locator('#brush-size').focus(); await page.keyboard.press('End');
  const from = await belly(page);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(from.x - 190, from.y - 10, { steps: 20 }); await page.mouse.move(from.x - 190, from.y - 75, { steps: 8 });
  await page.mouse.move(from.x + 15, from.y - 65, { steps: 25 }); await page.mouse.up();
  await expect.poll(() => page.locator('.paint-stroke').count()).toBeGreaterThan(1);
  const result = await page.evaluate(async () => {
    const svg = document.querySelector('.scene'), body = document.getElementById('body'), inverse = document.getElementById('creature').transform.baseVal.consolidate().matrix.inverse(), box = svg.viewBox.baseVal;
    const clone = svg.cloneNode(true); clone.setAttribute('width', '640'); clone.setAttribute('height', '480');
    const image = new Image(); image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone)); await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480; const c = canvas.getContext('2d'); c.drawImage(image, 0, 0);
    const pixels = c.getImageData(0, 0, 640, 480).data; let colored = 0, outside = 0;
    for (let y = 0; y < 480; y += 2) for (let x = 0; x < 640; x += 2) {
      const i = (y * 640 + x) * 4;
      if (pixels[i] > 220 && pixels[i + 1] < 60 && pixels[i + 2] > 140 && pixels[i + 3] > 200) {
        colored++;
        const p = new DOMPoint(box.x + x / 640 * box.width, box.y + y / 480 * box.height).matrixTransform(inverse);
        if (![-1, 0, 1].some(dx => [-1, 0, 1].some(dy => body.isPointInFill(new DOMPoint(p.x + dx, p.y + dy))))) outside++;
      }
    }
    return { colored, outside, clip: document.querySelector('.paint-layer').getAttribute('clip-path') };
  });
  expect(result.colored).toBeGreaterThan(200); expect(result.outside).toBe(0); expect(result.clip).toBe('url(#clip-body)');
  await page.screenshot({ path: 'test-results/life-paint-clipped.png' });
});

test('触屏涂画：触摸连续轨迹生成笔迹，不触发身体塑形', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } }); const page = await context.newPage(); await routePage(page);
  await page.getByRole('button', { name: '自由涂色', exact: true }).tap();
  const point = await belly(page), before = await page.locator('#body').evaluate(p => p.getBBox().width);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x - 30, y: point.y, id: 1 }] });
  for (let i = 1; i <= 15; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x - 30 + i * 4, y: point.y + Math.sin(i / 3) * 12, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.paint-stroke')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await save(page)).data.state.paint.strokes[0].points.length).toBeGreaterThan(10);
  expect(Math.abs(await page.locator('#body').evaluate(p => p.getBBox().width) - before)).toBeLessThan(20);
  await context.close();
});

test('涂色兼容塑形分枝：各部位独立，父段编辑后笔迹随动，删除/撤销恢复颜色与图案', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const fixture = await page.evaluate(() => {
    const { SoftSculpt, SculptSession, attachment, limbGeometries } = CreatureMotion;
    const s = new SculptSession(new SoftSculpt()), root = attachment(s.body.shape, 8);
    s.limbs.beginCreate(root, s.body.shape); s.limbs.move({ x: root.x + 150, y: root.y }, s.body.shape); s.limbs.release();
    const parent = s.limbs.active, surface = limbGeometries(s.limbs.items, s.body.shape).get(parent.id).surface, branchRoot = attachment(surface, 14);
    s.limbs.beginCreate(branchRoot, s.body.shape, parent.id); s.limbs.move({ x: branchRoot.x + branchRoot.nx * 90, y: branchRoot.y + branchRoot.ny * 90 }, s.body.shape); s.limbs.release();
    return s.export();
  });
  await page.locator('#art-file').setInputFiles({ name: 'branched.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.locator('#limbs .limb-skin')).toHaveCount(2);
  await page.getByRole('button', { name: '自由涂色', exact: true }).click();
  await page.getByRole('combobox', { name: '绘画部位' }).selectOption('limb:2');
  await color(page, '#fff0ad'); await page.getByRole('button', { name: '所选肢体底色', exact: true }).click();
  await expect(page.locator('#limbs .limb-skin[data-limb="2"]')).toHaveAttribute('fill', '#fff0ad');
  await expect(page.locator('#limbs .limb-skin[data-limb="1"]')).toHaveAttribute('fill', '#ffffff');
  await color(page, '#ff477e');
  const spot = await page.locator('#limbs .limb-skin[data-limb="2"]').evaluate(p => {
    const t = p.getTotalLength() * .25, a = p.getPointAtLength(t - .5), b = p.getPointAtLength(t + .5), q = p.getPointAtLength(t), n = Math.hypot(b.x - a.x, b.y - a.y);
    const point = new DOMPoint(q.x + (b.y - a.y) / n * 3, q.y - (b.x - a.x) / n * 3).matrixTransform(p.getScreenCTM()); return { x: point.x, y: point.y };
  });
  await page.mouse.move(spot.x, spot.y); await page.mouse.down(); await page.mouse.move(spot.x + 2, spot.y - 22, { steps: 12 }); await page.mouse.up();
  const painted = '[data-painted-part="limb:2"] .paint-stroke';
  await expect(page.locator(painted)).toHaveCount(1);
  const saved = await save(page); const anchorData = JSON.stringify(saved.data.state.paint.strokes);
  await color(page, '#c1dcfa'); await page.getByRole('button', { name: '身体底色', exact: true }).click();
  await expect(page.locator('#body')).toHaveAttribute('fill', '#c1dcfa'); await expect(page.locator('#limbs .limb-skin[data-limb="2"]')).toHaveAttribute('fill', '#fff0ad');
  await page.getByRole('button', { name: '揉捏身体', exact: true }).click();
  const parentEdge = await page.locator('#limbs .limb-skin[data-limb="1"]').evaluate(p => {
    const t = p.getTotalLength() * .2, a = p.getPointAtLength(t - .5), b = p.getPointAtLength(t + .5), q = p.getPointAtLength(t), n = Math.hypot(b.x - a.x, b.y - a.y);
    const point = new DOMPoint(q.x + (b.y - a.y) / n * 2, q.y - (b.x - a.x) / n * 2).matrixTransform(p.getScreenCTM()); return { x: point.x, y: point.y };
  });
  await page.mouse.click(parentEdge.x, parentEdge.y);
  await expect(page.locator('.limb-handle.tip')).toHaveAttribute('data-limb', '1');
  const before = await page.locator(painted).getAttribute('d');
  const tip = await page.locator('.limb-handle.tip').evaluate(p => { const q = new DOMPoint(+p.getAttribute('cx'), +p.getAttribute('cy')).matrixTransform(p.getScreenCTM()); return { x: q.x, y: q.y }; });
  await page.mouse.move(tip.x, tip.y); await page.mouse.down(); await page.mouse.move(tip.x - 25, tip.y + 65, { steps: 24 }); await page.mouse.up();
  await expect(page.locator(painted)).not.toHaveAttribute('d', before); await page.waitForTimeout(1200);
  expect(JSON.stringify((await save(page)).data.state.paint.strokes)).toBe(anchorData);
  await expect(page.locator('[data-painted-part="limb:2"]')).toHaveAttribute('clip-path', 'url(#clip-limb-2)');
  const top = await page.locator('#body').evaluate(p => { const b = p.getBBox(), q = new DOMPoint(b.x + b.width / 2, b.y + 2).matrixTransform(p.getScreenCTM()); return { x: q.x, y: q.y }; });
  await page.mouse.move(top.x, top.y); await page.mouse.down(); await page.mouse.move(top.x, top.y - 60, { steps: 18 }); await page.mouse.up();
  expect(JSON.stringify((await save(page)).data.state.paint.strokes)).toBe(anchorData);
  await expect(page.locator('#limbs .limb-skin')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/life-painted-branches.png' });
  // Re-select the parent after body editing, then remove the painted subtree.
  const point = await page.locator('#limbs .limb-skin[data-limb="1"]').evaluate(p => {
    const t = p.getTotalLength() * .2, a = p.getPointAtLength(t - .5), b = p.getPointAtLength(t + .5), q = p.getPointAtLength(t), n = Math.hypot(b.x - a.x, b.y - a.y);
    const s = new DOMPoint(q.x + (b.y - a.y) / n * 2, q.y - (b.x - a.x) / n * 2).matrixTransform(p.getScreenCTM()); return { x: s.x, y: s.y };
  });
  await page.mouse.click(point.x, point.y); await page.getByRole('button', { name: '删除肢体', exact: true }).click();
  await expect(page.locator('#limbs .limb-skin')).toHaveCount(0); await expect(page.locator(painted)).toHaveCount(0);
  await page.keyboard.press('Control+z'); await expect(page.locator('#limbs .limb-skin')).toHaveCount(2); await expect(page.locator(painted)).toHaveCount(1);
  await expect(page.locator('#limbs .limb-skin[data-limb="2"]')).toHaveAttribute('fill', '#fff0ad');
  await page.keyboard.press('Control+Shift+z'); await expect(page.locator('#limbs .limb-skin')).toHaveCount(0);
  expect(errors).toEqual([]);
});
