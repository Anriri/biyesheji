import { test, expect } from '@playwright/test';

test('桌面页面、指南、档案和重置可用；鼠标不会改变生物轮廓', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '捏一点，不一样。' })).toBeVisible();
  await expect(page.locator('#body')).toHaveAttribute('d', /^M /);
  const before = await page.locator('#body').getAttribute('d');
  await page.mouse.move(500, 450); await page.mouse.down();
  await page.mouse.move(650, 500); await page.mouse.up();
  await expect(page.locator('#body')).toHaveAttribute('d', before);
  await page.getByRole('button', { name: '查看手势指南' }).click();
  await expect(page.locator('#guide-dialog')).toBeVisible();
  await page.getByRole('button', { name: '明白了，开始创造' }).click();
  await expect(page.locator('#guide-dialog')).not.toBeVisible();
  await page.getByRole('button', { name: '物种档案' }).click();
  await expect(page.locator('#archive-count')).toHaveText('0 次');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '重置形态' }).click();
  await expect(page.locator('#toast')).toContainText('回到最初');
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
});

test('移动端布局无水平溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#camera-button')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});

test('摄像头拒绝授权后显示可恢复提示，允许再次尝试', async ({ page }) => {
  // Test only the browser permission failure, never fabricate hand landmarks.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '开启摄像头' }).click();
  await expect(page.getByRole('alert')).toContainText('摄像头权限被拒绝');
  await expect(page.getByRole('button', { name: '重新开启摄像头' })).toBeEnabled();
  await expect(page.locator('#stage-state')).toHaveText('等待手势');
});

test('本地 MediaPipe 模型可初始化、处理视频帧并在关闭后重新启动', async ({ baseURL }) => {
  // Chromium's blank test video only validates the camera → model pipeline.
  // This is NOT a real-hand gesture acceptance test and is not a UI fallback.
  const { chromium } = await import('@playwright/test');
  const instance = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await instance.newPage();
  try {
    await page.goto(baseURL);
    await page.getByRole('button', { name: '开启摄像头' }).click();
    await expect(page.locator('#preview-label')).toHaveText('LIVE INPUT', { timeout: 45000 });
    await expect(page.locator('#fps-badge')).toHaveText(/[1-9][0-9]* FPS/, { timeout: 20000 });
    await expect(page.locator('#error-message')).not.toBeVisible();
    await page.getByRole('button', { name: '关闭摄像头' }).click();
    await expect(page.locator('#preview-label')).toHaveText('CAMERA OFF');
    expect(await page.locator('#camera-video').evaluate(v => v.srcObject === null)).toBe(true);
    await page.getByRole('button', { name: '开启摄像头' }).click();
    await expect(page.locator('#preview-label')).toHaveText('LIVE INPUT', { timeout: 45000 });
    await expect(page.locator('#fps-badge')).toHaveText(/[1-9][0-9]* FPS/, { timeout: 20000 });
    await page.getByRole('button', { name: '关闭摄像头' }).click();
  } finally { await instance.close(); }
});

test('依赖加载失败会释放摄像头并显示恢复说明', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 240;
      const ctx = canvas.getContext('2d');
      const stream = canvas.captureStream(15);
      window.testStream = stream;
      const draw = () => { ctx.fillRect(0, 0, 320, 240); if (stream.active) requestAnimationFrame(draw); };
      draw();
      return stream;
    };
  });
  await page.route('**/mediapipe/hands/hands.js', route => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: '开启摄像头' }).click();
  await expect(page.getByRole('alert')).toContainText('依赖加载失败');
  expect(await page.evaluate(() => window.testStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  await expect(page.getByRole('button', { name: '重新开启摄像头' })).toBeEnabled();
});

test('取消等待授权后，延迟获得的摄像头也会被释放', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => {
      window.resolveTestPermission = () => {
        const canvas = document.createElement('canvas');
        const stream = canvas.captureStream(15);
        window.testStream = stream;
        resolve(stream);
      };
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '开启摄像头' }).click();
  await page.getByRole('button', { name: '取消开启' }).click();
  await page.evaluate(() => window.resolveTestPermission());
  await expect(page.locator('#preview-label')).toHaveText('CAMERA OFF');
  await expect.poll(() => page.evaluate(() => window.testStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
});
