import './style.css';
import { Sculpture, WIDTH, HEIGHT, closedCurve, earPath, clamp } from './sculpture.js';
import { GestureFilter } from './gesture.js';
import { CameraTracker, CONNECTIONS } from './tracking.js';

const icons = {
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
  camera: '<path d="M14 4H9L7 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2-3Z"/><circle cx="12" cy="13" r="4"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  hand: '<path d="M8 13V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v9c0 5-3 7-7 7-3 0-5-2-7-4l-3-5a2 2 0 0 1 3-2l2 2Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  expand: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};
const icon = (name, extra = '') => `<svg ${extra} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

document.querySelector('#app').innerHTML = `
  <header class="site-header">
    <a class="brand" href="./" aria-label="未名生物收容所首页">
      <svg class="brand-symbol" viewBox="0 0 48 48" aria-hidden="true"><path d="M12 26C1-1 18-3 21 22M27 22C33-5 48 3 36 28" fill="#a9bb89" stroke="#343b2d" stroke-width="1.5"/><path d="M5 30c0-16 37-16 37 0 0 19-37 19-37 0Z" fill="#d8e3bd" stroke="#343b2d" stroke-width="1.5"/><circle cx="18" cy="30" r="1.8"/><circle cx="30" cy="30" r="1.8"/><path d="M22 35q2 2 4 0" fill="none" stroke="#343b2d" stroke-linecap="round"/></svg>
      <span><strong>未名生物收容所</strong><small>THE UNNAMED CREATURE SHELTER</small></span>
    </a>
    <nav aria-label="主导航"><span class="nav-active">塑形实验室 <i></i></span><button id="archive-button">物种档案 ${icon('arrow')}</button></nav>
    <div class="header-note"><span class="tiny-dot"></span> 一切可爱，尚未定义 <span class="edition">EST. 2026</span></div>
  </header>

  <main>
    <section class="intro">
      <div><div class="eyebrow"><span></span> 隔空捏塑计划 <b>EXPERIMENT 001</b></div><h1>捏一点，<em>不一样。</em><svg viewBox="0 0 56 56" aria-hidden="true"><path d="M28 4v48M4 28h48M11 11l34 34M11 45l34-34"/></svg></h1><p>伸出手，让想象有形状。这里的每一只小生物，都由你亲手定义。</p></div>
      <div class="intro-note"><span class="note-star">✳</span><p>不用触碰，也能靠近。<br/><strong>一双手，一点奇思妙想。</strong></p><span class="note-arrow">↙</span></div>
    </section>

    <div class="workspace">
      <section class="lab-panel" aria-label="生物塑形观察室">
        <div class="lab-toolbar"><div class="lab-title"><span class="tiny-dot"></span> 观察室 <span class="mono">LIVE CANVAS</span></div><div class="toolbar-right"><span id="stage-state" class="state-pill">等待手势</span><button id="help-button" class="icon-button" aria-label="查看手势指南" title="手势指南">${icon('info')}</button></div></div>
        <div class="stage" id="stage">
          <span class="stage-corner corner-tl"></span><span class="stage-corner corner-tr"></span><span class="stage-corner corner-bl"></span><span class="stage-corner corner-br"></span>
          <div class="specimen-label"><span>NO. 001</span><h2>糯糯 <small>NUO NUO</small></h2><p>未分类 · 软乎乎科</p></div>
          <div class="stage-tip" id="stage-tip">${icon('hand')} 打开摄像头，和糯糯打个招呼</div>
          <svg id="creature-stage" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="可通过真实手势拉伸耳朵和身体的绿色长耳生物糯糯">
            <defs>
              <linearGradient id="ear-gradient" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d4e5b1"/><stop offset=".5" stop-color="#b7cf94"/><stop offset="1" stop-color="#87a76e"/></linearGradient>
              <linearGradient id="body-gradient" x1=".1" y1="0" x2=".85" y2="1"><stop stop-color="#dbe8bc"/><stop offset=".53" stop-color="#bbd39b"/><stop offset="1" stop-color="#99b780"/></linearGradient>
              <radialGradient id="head-gradient" cx=".37" cy=".24" r=".84"><stop stop-color="#e1ebc7"/><stop offset=".52" stop-color="#c8dba8"/><stop offset="1" stop-color="#9eba82"/></radialGradient>
              <radialGradient id="belly-gradient"><stop stop-color="#ebefd5" stop-opacity=".95"/><stop offset="1" stop-color="#e4edca" stop-opacity=".25"/></radialGradient>
              <radialGradient id="cheek-gradient"><stop stop-color="#eca58e" stop-opacity=".8"/><stop offset="1" stop-color="#eca58e" stop-opacity="0"/></radialGradient>
              <radialGradient id="shadow-gradient"><stop stop-color="#667647" stop-opacity=".2"/><stop offset="1" stop-color="#667647" stop-opacity="0"/></radialGradient>
              <filter id="clay-shadow" x="-40%" y="-30%" width="180%" height="180%"><feDropShadow dx="1" dy="7" stdDeviation="7" flood-color="#54683a" flood-opacity=".12"/></filter>
            </defs>
            <ellipse id="ground-shadow" cx="480" cy="607" rx="159" ry="27" fill="url(#shadow-gradient)"/>
            <g id="creature" filter="url(#clay-shadow)">
              <path id="ear-0" fill="url(#ear-gradient)" stroke="#95af7b" stroke-width="1"/>
              <path id="ear-1" fill="url(#ear-gradient)" stroke="#95af7b" stroke-width="1"/>
              <path id="ear-inner-0" fill="#edf0ce" opacity=".65"/>
              <path id="ear-inner-1" fill="#edf0ce" opacity=".65"/>
              <ellipse id="foot-left" cx="423" cy="570" rx="42" ry="21" fill="#aac48f"/>
              <ellipse id="foot-right" cx="539" cy="570" rx="42" ry="21" fill="#a4c088"/>
              <path id="body" fill="url(#body-gradient)" stroke="#a1ba86" stroke-width="1"/>
              <ellipse id="belly" cx="480" cy="480" rx="67" ry="72" fill="url(#belly-gradient)"/>
              <path d="M351 312C347 256 396 224 466 230C534 214 600 252 609 310C627 373 574 406 484 408C399 412 342 381 351 312Z" fill="url(#head-gradient)" stroke="#a9bf8d" stroke-width="1"/>
              <path d="M384 278Q405 251 442 251" stroke="#f4f7e5" stroke-width="8" fill="none" opacity=".43" stroke-linecap="round"/>
              <g id="face">
                <ellipse cx="402" cy="347" rx="28" ry="19" fill="url(#cheek-gradient)"/>
                <ellipse cx="558" cy="347" rx="28" ry="19" fill="url(#cheek-gradient)"/>
                <g id="eyes"><ellipse cx="434" cy="323" rx="7" ry="10" fill="#3c4730"/><ellipse cx="527" cy="323" rx="7" ry="10" fill="#3c4730"/><circle cx="436" cy="320" r="2" fill="#fff"/><circle cx="529" cy="320" r="2" fill="#fff"/></g>
                <path id="mouth" d="M469 344Q480 356 491 344" stroke="#566145" stroke-width="3.5" stroke-linecap="round" fill="none"/>
                <path d="M477 333Q480 330 483 333" stroke="#6d7858" stroke-width="2.2" stroke-linecap="round" fill="none"/>
              </g>
              <path id="belly-mark" d="M476 478q4 5 8 0" fill="none" stroke="#8ca575" stroke-width="2.5" stroke-linecap="round" opacity=".6"/>
            </g>
            <g id="handles" fill="none" stroke="#7b9466" stroke-width="1.4" stroke-dasharray="3 5"><circle id="handle-ear-0" r="39"/><circle id="handle-ear-1" r="39"/><circle id="handle-body-left" r="25"/><circle id="handle-body-right" r="25"/><circle id="handle-body-bottom" r="25"/></g>
            <g id="hand-cursor" opacity="0"><circle class="cursor-halo" r="34" fill="#f1d36c" fill-opacity=".16"/><circle id="cursor-ring" r="21" fill="none" stroke="#506844" stroke-width="2.4"/><circle r="4" fill="#506844"/><path id="cursor-pinch" d="m-6 1 4 4 9-10" stroke="#506844" stroke-width="2.5" fill="none" opacity="0"/><text id="cursor-label" x="0" y="-42" text-anchor="middle" fill="#435337" font-size="17" font-family="sans-serif">靠近耳朵或身体</text></g>
            <g class="ear-hint"><path d="M278 177Q301 127 345 142" fill="none" stroke="#99a18b" stroke-width="1.3" stroke-dasharray="4 5"/><path d="m337 135 10 7-12 5" fill="none" stroke="#99a18b" stroke-width="1.3"/><text x="211" y="200" fill="#8d9581" font-size="16" font-family="sans-serif" transform="rotate(-8 211 200)">试着把耳朵拉长一点</text></g>
          </svg>
          <div class="stage-bottom"><span><i></i> <span id="mood-text">今天也有无限可能</span></span><span class="mono" id="edit-counter">00 次塑形</span></div>
          <div class="toast" id="toast" role="status"></div>
        </div>
        <div class="lab-footer"><div><span class="live-dot" id="live-dot"></span><span id="tracking-status" role="status" aria-live="polite">摄像头未开启</span></div><button id="reset-button">${icon('reset')} 重置形态</button></div>
      </section>

      <aside class="control-panel">
        <section class="camera-card"><div class="section-heading"><h2>你的手，就是工具</h2><span class="mono">01 / INPUT</span></div>
          <div class="camera-preview" id="camera-preview"><video id="camera-video" autoplay playsinline muted></video><canvas id="tracking-overlay" aria-label="镜像手部骨架追踪预览"></canvas><div class="camera-placeholder" id="camera-placeholder"><span class="camera-icon">${icon('camera')}</span><strong id="camera-placeholder-title">准备好伸出手了吗？</strong><p id="camera-placeholder-copy">开启摄像头，开始一场小小的创造</p></div><span class="preview-tag"><i></i> <span id="preview-label">CAMERA OFF</span></span><span class="mirror-tag">镜像预览</span><span id="fps-badge" class="fps-badge"></span></div>
          <button id="camera-button" class="primary-button">${icon('camera')}<span>开启摄像头</span>${icon('arrow')}</button>
          <p class="privacy-note">${icon('lock')} 画面仅在浏览器本地处理，不会上传</p>
          <p id="error-message" class="error-message" role="alert" hidden></p>
        </section>

        <section class="gesture-card"><div class="section-heading"><h2>手势感应</h2><span class="sensor-icon"><i></i><i></i><i></i></span></div><div class="gesture-status"><span id="gesture-symbol">${icon('hand')}</span><div><strong id="gesture-title">等待手势</strong><p id="gesture-description">开启摄像头后，将一只手放入画面</p></div></div><div class="pinch-meter"><div class="meter-label"><span>拇指与食指距离</span><strong id="pinch-value">—</strong></div><div class="meter-track"><span id="pinch-meter-fill"></span><i></i></div><div class="meter-legend"><span>捏合</span><span>张开</span></div></div><div class="sensitivity-control"><label for="sensitivity">捏合灵敏度</label><input id="sensitivity" type="range" min="20" max="44" value="32" aria-label="捏合灵敏度"/><output id="sensitivity-value" for="sensitivity">适中</output></div></section>

        <section class="little-note"><span>一份小小的提示</span><p>把手掌朝向镜头，<br/>让<span>拇指和食指</span>相遇。<br/>慢慢来，小生物会等你。</p><svg viewBox="0 0 76 70" aria-hidden="true"><path d="M18 53C-1 39 18 22 29 39L30 13C31 6 39 6 40 13L41 31L48 10C51 4 58 8 56 15L51 38C74 34 71 54 58 60C43 68 29 62 18 53Z" fill="#e7e8ca" stroke="#83906d" stroke-width="1.5"/><path d="m15 20-7-4M21 12l-1-8M8 30H1" stroke="#9aa57d" stroke-width="1.5" stroke-linecap="round"/></svg></section>
      </aside>
    </div>

    <section class="steps" aria-label="三步手势操作指南"><div class="steps-heading"><span>HOW TO PLAY</span><h2>把奇思妙想<br/>交给双手。</h2></div><article><span class="step-number">01</span><div><h3>靠近，找到它</h3><p>手掌面对镜头，让光标靠近<br/>耳朵或身体的虚线区域。</p></div><span class="step-sketch">◎</span></article><article><span class="step-number">02</span><div><h3>捏住，慢慢拉</h3><p>拇指与食指捏合，移动手部，<br/>拉出你喜欢的模样。</p></div><span class="step-sketch">↗</span></article><article><span class="step-number">03</span><div><h3>松开，就是新生</h3><p>张开手指，形状就会留下。<br/>每一点不同，都值得被收容。</p></div><span class="step-sketch sparkle">✧</span></article></section>
    <footer class="site-footer"><span>未名生物收容所 <i>© 2026</i></span><p>没有标准答案的形状，只有独一无二的你。</p><span class="mono">MADE OF A LITTLE IMAGINATION ${icon('arrow')}</span></footer>
  </main>

  <dialog id="guide-dialog"><button class="dialog-close icon-button" aria-label="关闭指南">${icon('close')}</button><span class="eyebrow">A SMALL FIELD GUIDE</span><h2>让我们隔空认识一下。</h2><p>在 Chrome 或 Edge 中开启摄像头，让一只手完整入镜。镜像画面中向右移动，观察室里的光标也会向右移动。</p><ol><li><strong>找位置：</strong>看着观察室的圆形光标，移动到耳朵或身体。光标显示“可以捏住”时即可抓取。</li><li><strong>捏合拉伸：</strong>拇指与食指靠拢并保持，缓慢移动。耳朵可以拉长、转向，身体可以向左右或下方拉伸。</li><li><strong>松手定型：</strong>分开两指，糯糯轻轻回弹后保留新形状。每次抓取都需要先张开，再捏合。</li></ol><p class="dialog-note">距离镜头约 40–80 cm、光线均匀，避免两根手指互相遮挡。若捏合难识别，可稍微提高灵敏度。手部丢失超过 350 ms 会自动松手定型。按 Esc 可随时结束当前抓取。</p><button class="primary-button dialog-done">明白了，开始创造 ${icon('arrow')}</button></dialog>
  <dialog id="archive-dialog"><button class="dialog-close icon-button" aria-label="关闭物种档案">${icon('close')}</button><span class="eyebrow">SPECIMEN ARCHIVE / 001</span><h2>糯糯，还没有被定义。</h2><p>软乎乎科的第一位住客。长长的耳朵负责接收奇思妙想，圆圆的身体负责装下所有不同。</p><dl class="specimen-facts"><div><dt>初始形态</dt><dd>双长耳 · 豆豆眼 · 橡皮泥身体</dd></div><div><dt>可塑区域</dt><dd>左右耳朵 / 身体两侧 / 身体下缘</dd></div><div><dt>当前塑形次数</dt><dd id="archive-count">0 次</dd></div><div><dt>档案状态</dt><dd>本次会话中持续生长，刷新后回到初始形态</dd></div></dl><p class="dialog-note">这是「未名生物收容所」毕业设计的交互可行性原型。真正的独一无二，从你伸出手的那一刻开始。</p><button class="primary-button dialog-done">回到观察室 ${icon('arrow')}</button></dialog>
`;

const $ = (id) => document.getElementById(id);
const sculpture = new Sculpture();
const gestures = new GestureFilter();
const video = $('camera-video');
const overlay = $('tracking-overlay');
const context = overlay.getContext('2d');
let cameraState = 'off';
let lastSeen = 0;
let cursor = null;
let currentGesture = null;
let hover = null;
let releasedAt = 0;
let toastTimeout;
let blinkUntil = 0;
let nextBlink = performance.now() + 2500;
let lastFpsTime = 0;
let previousFrames = 0;
let escapeLatch = false;

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $('toast').classList.remove('visible'), 2600);
}

function release(notify = true) {
  if (sculpture.release()) {
    releasedAt = performance.now();
    $('edit-counter').textContent = `${String(sculpture.changes).padStart(2, '0')} 次塑形`;
    $('archive-count').textContent = `${sculpture.changes} 次`;
    if (notify) toast('新形状已留下，糯糯很喜欢。');
  }
}

function clearHand() {
  release(false);
  gestures.reset();
  cursor = null;
  currentGesture = null;
  hover = null;
  escapeLatch = false;
  context.clearRect(0, 0, overlay.width, overlay.height);
  $('pinch-value').textContent = '—';
  $('pinch-meter-fill').style.width = '0%';
}

function setCameraState(state) {
  cameraState = state;
  const pending = state === 'requesting' || state === 'loading';
  const active = state === 'active';
  const button = $('camera-button');
  button.querySelector('span').textContent = active ? '关闭摄像头' : pending ? '取消开启' : state === 'error' ? '重新开启摄像头' : '开启摄像头';
  button.classList.toggle('is-active', active);
  button.classList.toggle('is-loading', pending);
  $('camera-preview').classList.toggle('is-active', active);
  $('camera-preview').classList.toggle('has-video', active || state === 'loading');
  $('camera-placeholder').hidden = active;
  $('camera-placeholder-title').textContent = state === 'requesting' ? '请允许摄像头访问' : state === 'loading' ? '正在唤醒手势感应…' : state === 'error' ? '我们需要一点帮助' : '准备好伸出手了吗？';
  $('camera-placeholder-copy').textContent = state === 'requesting' ? '在浏览器权限提示中点击「允许」' : state === 'loading' ? '首次启动需要几秒，请稍等' : state === 'error' ? '查看下方提示，处理后可以重新开启' : '开启摄像头，开始一场小小的创造';
  $('preview-label').textContent = active ? 'LIVE INPUT' : pending ? 'CONNECTING' : 'CAMERA OFF';
  $('live-dot').classList.toggle('active', active);
  if (!active) $('fps-badge').textContent = '';
  if (state !== 'error') $('error-message').hidden = true;
  if (!active) clearHand();
  lastFpsTime = performance.now();
  previousFrames = 0;
  updateStatus();
}

function updateStatus() {
  const active = cameraState === 'active';
  const tracking = active && cursor !== null;
  const pinched = tracking && currentGesture?.pinched;
  const sculpting = !!sculpture.grab;
  const title = sculpting ? '正在塑形' : pinched ? '已捏合' : '等待手势';
  $('stage-state').textContent = title;
  $('stage-state').classList.toggle('sculpting', sculpting);
  $('gesture-title').textContent = title;
  $('gesture-symbol').classList.toggle('engaged', !!pinched);
  $('gesture-description').textContent = sculpting ? `${sculpture.grab.kind === 'ears' ? '耳朵' : '身体'}已抓住，慢慢移动你的手` : pinched ? escapeLatch ? '已结束抓取，请先张开手指' : '请先松开，再靠近虚线区域捏合' : tracking ? hover ? '位置刚刚好，捏合拇指与食指' : '移动光标，靠近耳朵或身体' : active ? '将一只手完整放入摄像头画面' : '开启摄像头后，将一只手放入画面';
  $('tracking-status').textContent = cameraState === 'requesting' ? '等待摄像头授权…' : cameraState === 'loading' ? '正在加载本地手部模型…' : cameraState === 'error' ? '摄像头或追踪暂不可用' : active ? tracking ? '已识别 1 只手 · 追踪中' : '摄像头已连接 · 等待手部入镜' : '摄像头未开启';
  $('stage-tip').innerHTML = `${icon(sculpting ? 'expand' : 'hand')} ${sculpting ? '保持捏合移动，松开即可定型' : tracking ? '让光标靠近虚线区域，再轻轻捏住' : active ? '手掌面对镜头，让五根手指完整入镜' : '打开摄像头，和糯糯打个招呼'}`;
  $('stage').classList.toggle('is-sculpting', sculpting);
}

function drawTracking(landmarks, pinched) {
  if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
    overlay.width = video.videoWidth || 960;
    overlay.height = video.videoHeight || 540;
    $('camera-preview').style.aspectRatio = `${overlay.width} / ${overlay.height}`;
  }
  const w = overlay.width, h = overlay.height;
  context.clearRect(0, 0, w, h);
  if (!landmarks) return;
  const project = p => ({ x: (1 - p.x) * w, y: p.y * h });
  context.strokeStyle = pinched ? '#f6d66d' : '#cce9b8';
  context.lineWidth = Math.max(2, w / 320);
  for (const [a, b] of CONNECTIONS) {
    const p = project(landmarks[a]), q = project(landmarks[b]);
    context.beginPath(); context.moveTo(p.x, p.y); context.lineTo(q.x, q.y); context.stroke();
  }
  landmarks.forEach((p, index) => {
    const q = project(p);
    context.beginPath(); context.arc(q.x, q.y, index === 4 || index === 8 ? w / 100 : w / 180, 0, Math.PI * 2);
    context.fillStyle = index === 4 || index === 8 ? '#f6d66d' : '#fff9e6'; context.fill();
  });
  const a = project(landmarks[4]), b = project(landmarks[8]);
  context.setLineDash([6, 7]); context.strokeStyle = '#f6d66d';
  context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke(); context.setLineDash([]);
}

const tracker = new CameraTracker(video, {
  onState: setCameraState,
  onError(message) { setCameraState('error'); $('error-message').textContent = message; $('error-message').hidden = false; },
  onResults(results) {
    if (document.hidden || document.querySelector('dialog[open]')) { clearHand(); updateStatus(); return; }
    const landmarks = results.multiHandLandmarks?.[0];
    const now = performance.now();
    if (!landmarks) {
      drawTracking(null, false);
      if (now - lastSeen > 350) { clearHand(); updateStatus(); }
      return;
    }
    lastSeen = now;
    currentGesture = gestures.update(landmarks, now, Number($('sensitivity').value) / 100, (video.videoWidth || 960) / (video.videoHeight || 540));
    cursor = { x: currentGesture.point.x * WIDTH, y: currentGesture.point.y * HEIGHT };
    hover = sculpture.hitTest(cursor);
    if (!currentGesture.pinched) escapeLatch = false;
    if (currentGesture.started && !escapeLatch) {
      const hit = sculpture.begin(cursor);
      if (hit) { $('mood-text').textContent = '咦？我要变成什么样子啦'; blinkUntil = now + 130; }
      else toast('还差一点：先张开手指，靠近耳朵或身体再捏合。');
    }
    if (currentGesture.pinched && sculpture.grab) sculpture.move(cursor);
    if (currentGesture.ended) release();
    const meter = clamp(currentGesture.ratio / 1.5, 0, 1);
    $('pinch-meter-fill').style.width = `${meter * 100}%`;
    $('pinch-value').textContent = currentGesture.pinched ? '已捏合' : '张开中';
    $('pinch-meter-fill').classList.toggle('pinched', currentGesture.pinched);
    drawTracking(landmarks, currentGesture.pinched);
    updateStatus();
  },
});

$('camera-button').addEventListener('click', () => {
  if (['active', 'loading', 'requesting'].includes(cameraState)) { tracker.stop(); setCameraState('off'); toast('摄像头已关闭，你的创作还在。'); }
  else tracker.start();
});
$('reset-button').addEventListener('click', () => {
  sculpture.reset();
  escapeLatch = true;
  $('edit-counter').textContent = '00 次塑形'; $('archive-count').textContent = '0 次';
  $('mood-text').textContent = '今天也有无限可能';
  updateStatus(); toast('回到最初的软乎乎，重新想象吧。');
});
$('sensitivity').addEventListener('input', (event) => {
  const value = Number(event.target.value);
  $('sensitivity-value').textContent = value < 28 ? '较低' : value > 36 ? '较高' : '适中';
});
function openDialog(id) {
  release(false);
  escapeLatch = true;
  $(id).showModal();
  updateStatus();
}
$('help-button').addEventListener('click', () => openDialog('guide-dialog'));
$('archive-button').addEventListener('click', () => openDialog('archive-dialog'));
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.querySelectorAll('.dialog-close, .dialog-done').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') { release(); escapeLatch = true; updateStatus(); } });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearHand(); updateStatus(); }
});
window.addEventListener('pagehide', () => tracker.stop());

function render(now, previous = now) {
  sculpture.tick((now - previous) / 1000 || 1 / 60);
  const shape = sculpture.display;
  for (let i = 0; i < 2; i++) {
    $(`ear-${i}`).setAttribute('d', earPath(i, shape.ears[i]));
    $(`ear-inner-${i}`).setAttribute('d', earPath(i, shape.ears[i], true));
    $(`handle-ear-${i}`).setAttribute('cx', shape.ears[i].x);
    $(`handle-ear-${i}`).setAttribute('cy', shape.ears[i].y);
  }
  $('body').setAttribute('d', closedCurve(shape.body));
  for (const [name, index] of [['left', 6], ['right', 2], ['bottom', 4]]) {
    $(`handle-body-${name}`).setAttribute('cx', shape.body[index].x);
    $(`handle-body-${name}`).setAttribute('cy', shape.body[index].y);
  }
  const bodyCenter = { x: (shape.body[6].x + shape.body[2].x) / 2, y: (shape.body[0].y + shape.body[4].y) / 2 + 8 };
  $('belly').setAttribute('cx', bodyCenter.x); $('belly').setAttribute('cy', bodyCenter.y);
  $('belly').setAttribute('rx', (shape.body[2].x - shape.body[6].x) * 0.30);
  $('belly').setAttribute('ry', (shape.body[4].y - shape.body[0].y) * 0.34);
  $('belly-mark').setAttribute('transform', `translate(${bodyCenter.x - 480} ${bodyCenter.y - 480})`);
  $('foot-left').setAttribute('cx', shape.body[5].x + 10); $('foot-left').setAttribute('cy', shape.body[5].y + 11);
  $('foot-right').setAttribute('cx', shape.body[3].x - 10); $('foot-right').setAttribute('cy', shape.body[3].y + 11);
  $('ground-shadow').setAttribute('rx', clamp((shape.body[2].x - shape.body[6].x) * 0.7, 100, 260));
  $('ground-shadow').setAttribute('cy', Math.max(shape.body[3].y, shape.body[4].y, shape.body[5].y) + 30);
  const breathing = sculpture.grab ? 0 : Math.sin(now / 1100) * 1.7;
  $('creature').setAttribute('transform', `translate(0 ${breathing})`);
  if (now > nextBlink) { blinkUntil = now + 160; nextBlink = now + 2600 + Math.random() * 4000; }
  const blink = now < blinkUntil ? 0.12 : 1;
  $('eyes').setAttribute('transform', `translate(0 ${323 * (1 - blink)}) scale(1 ${blink})`);
  const expression = sculpture.grab ? 'M470 345Q480 364 490 345Z' : now - releasedAt < 1800 ? 'M467 343Q480 362 493 343' : 'M469 344Q480 356 491 344';
  $('mouth').setAttribute('d', expression);
  $('mouth').setAttribute('fill', sculpture.grab ? '#6a7755' : 'none');
  if (!sculpture.grab && releasedAt && now - releasedAt < 3000) $('mood-text').textContent = '嗯！这个样子，也很喜欢';
  // Pause interaction behind modal dialogs and if video stops producing frames.
  if (document.querySelector('dialog[open]') && sculpture.grab) { release(false); escapeLatch = true; updateStatus(); }
  if (cameraState === 'active' && cursor && now - lastSeen > 500) { clearHand(); updateStatus(); }
  $('hand-cursor').setAttribute('opacity', cursor ? 1 : 0);
  if (cursor) {
    $('hand-cursor').setAttribute('transform', `translate(${cursor.x} ${cursor.y})`);
    const engaged = currentGesture?.pinched;
    $('cursor-ring').setAttribute('r', engaged ? 15 : hover ? 24 : 21);
    $('cursor-ring').setAttribute('stroke', sculpture.grab ? '#bf9635' : '#506844');
    $('cursor-label').textContent = sculpture.grab ? '正在塑形 · 松开定型' : engaged ? '已捏合' : hover ? '可以捏住' : '靠近耳朵或身体';
    $('cursor-pinch').setAttribute('opacity', engaged ? 1 : 0);
  }
  if (cameraState === 'active' && now - lastFpsTime > 1000) {
    $('fps-badge').textContent = `${Math.round((tracker.frames - previousFrames) * 1000 / (now - lastFpsTime))} FPS`;
    previousFrames = tracker.frames; lastFpsTime = now;
  }
  requestAnimationFrame(time => render(time, now));
}
setCameraState('off');
requestAnimationFrame(time => render(time));
