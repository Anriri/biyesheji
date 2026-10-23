let loader;
const ASSET_ROOT = `${import.meta.env.BASE_URL}mediapipe/hands/`;

function loadHands() {
  if (window.Hands) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => fail(new Error('手部模型加载超时，请检查本地资源后重试。')), 30000);
    const fail = (error) => { clearTimeout(timer); script.remove(); loader = null; reject(error); };
    script.src = `${ASSET_ROOT}hands.js`;
    script.onload = () => {
      if (!window.Hands) return fail(new Error('手部追踪依赖不完整，请重新运行 npm ci。'));
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => fail(new Error('手部追踪依赖加载失败，请重新运行 npm ci 后刷新。'));
    document.head.append(script);
  });
  return loader;
}

export function cameraError(error) {
  const messages = {
    NotAllowedError: '摄像头权限被拒绝。请在地址栏的网站权限中允许摄像头，再点击重试。',
    NotFoundError: '未找到摄像头。请连接摄像头后重试。',
    NotReadableError: '摄像头暂时无法使用，可能被其他应用占用。请关闭占用后重试。',
    OverconstrainedError: '摄像头不支持当前画面设置，请更换摄像头后重试。',
    SecurityError: '浏览器限制了摄像头访问，请使用 localhost 或 HTTPS 打开。',
  };
  return messages[error.name] || error.message || '手部追踪启动失败，请刷新页面后重试。';
}

export class CameraTracker {
  constructor(video, callbacks) {
    this.video = video;
    this.callbacks = callbacks;
    this.generation = 0;
    this.active = false;
    this.frames = 0;
  }

  async start() {
    this.stop();
    const generation = this.generation;
    let engine;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('摄像头需要安全连接，请通过 localhost 或 HTTPS 打开本页面。');
      this.callbacks.onState('requesting');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: 'user' }, audio: false });
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (generation !== this.generation) return;
        this.stop();
        this.callbacks.onError('摄像头连接已断开或权限已撤回，请检查设备后重新开启。');
      });
      this.video.srcObject = stream;
      await this.video.play();
      if (generation !== this.generation) return;
      this.callbacks.onState('loading');
      await loadHands();
      if (generation !== this.generation) return;
      engine = new window.Hands({ locateFile: name => `${ASSET_ROOT}${name}` });
      engine.setOptions({ selfieMode: false, maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.65, minTrackingConfidence: 0.65 });
      engine.onResults(results => {
        if (generation === this.generation && this.active) {
          this.frames++;
          this.callbacks.onResults(results);
        }
      });
      let initializationTimer;
      const initialization = engine.initialize();
      try {
        await Promise.race([
          initialization,
          new Promise((_, reject) => {
            initializationTimer = setTimeout(() => reject(new Error('手部模型初始化超时，请检查浏览器 WebGL 支持，关闭其他占用 GPU 的页面后重试。')), 45000);
          }),
        ]);
      } finally { clearTimeout(initializationTimer); }
      if (generation !== this.generation) { await engine.close(); return; }
      this.engine = engine;
      this.active = true;
      this.frames = 0;
      this.callbacks.onState('active');
      this.lastFrame = 0;
      this.schedule(generation);
    } catch (error) {
      if (engine && engine !== this.engine) { try { Promise.resolve(engine.close()).catch(() => {}); } catch { /* Incomplete initialization. */ } }
      if (generation === this.generation) {
        this.stop();
        this.callbacks.onError(cameraError(error));
      }
    }
  }

  schedule(generation) {
    const callback = async (time) => {
      if (generation !== this.generation || !this.active) return;
      if (this.video.readyState >= 2 && time - this.lastFrame >= 32) {
        this.lastFrame = time;
        try { await this.engine.send({ image: this.video }); }
        catch (error) {
          if (generation !== this.generation) return;
          this.stop();
          this.callbacks.onError(`手部追踪中断：${cameraError(error)} 可关闭其他占用 GPU 的页面后重试。`);
          return;
        }
      }
      if (generation === this.generation && this.active) this.schedule(generation);
    };
    if (this.video.requestVideoFrameCallback) this.frame = this.video.requestVideoFrameCallback(callback);
    else this.frame = requestAnimationFrame(callback);
  }

  stop() {
    this.generation++;
    this.active = false;
    if (this.video.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this.frame);
    else cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
    if (this.engine) {
      this.engine.close().catch(() => {});
      this.engine = null;
    }
  }
}

export const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15],
  [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];
