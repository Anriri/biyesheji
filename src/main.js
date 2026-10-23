import './style.css';
import { Sculpture, WIDTH, HEIGHT, closedCurve, skinPoint, clamp } from './sculpture.js';
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
      <svg class="brand-symbol" viewBox="0 0 48 48" aria-hidden="true"><path d="M10 17C4 21 3 39 8 40L14 28M36 17C43 22 45 38 40 40L34 28" fill="#c1a9d4" stroke="#8d719c" stroke-width="1"/><path d="M9 23C8 4 39 4 39 23C39 38 9 39 9 23Z" fill="#eadfea" stroke="#9e82ae"/><ellipse cx="17" cy="24" rx="3.5" ry="4" fill="#59405f"/><ellipse cx="31" cy="24" rx="3.5" ry="4" fill="#59405f"/><circle cx="16" cy="22" r="1" fill="#fff5e9"/><circle cx="30" cy="22" r="1" fill="#fff5e9"/><path d="m24 12 1.5 4 3 1-3 1-1.5 4-1-4-3-1 3-1Z" fill="#e4b77f"/><path d="M22 31q2 2 4 0" fill="none" stroke="#ab859b" stroke-linecap="round"/></svg>
      <span><strong>未名生物收容所</strong><small>THE UNNAMED CREATURE SHELTER</small></span>
    </a>
    <nav aria-label="主导航"><span class="nav-active">塑形实验室 <i></i></span><button id="archive-button">物种档案 ${icon('arrow')}</button></nav>
    <div class="header-note"><span class="tiny-dot"></span> 一切可爱，尚未定义 <span class="edition">EST. 2026</span></div>
  </header>

  <main>
    <section class="intro">
      <div><div class="eyebrow"><span></span> 隔空捏塑计划 <b>EXPERIMENT 002</b></div><h1>捏一点，<em>不一样。</em><svg viewBox="0 0 56 56" aria-hidden="true"><path d="M28 4v48M4 28h48M11 11l34 34M11 45l34-34"/></svg></h1><p>伸出手，让想象有形状。这里的每一只小生物，都由你亲手定义。</p></div>
      <div class="intro-note"><span class="note-star">✳</span><p>不用触碰，也能靠近。<br/><strong>一双手，一点奇思妙想。</strong></p><span class="note-arrow">↙</span></div>
    </section>

    <div class="workspace">
      <section class="lab-panel" aria-label="生物塑形观察室">
        <div class="lab-toolbar"><div class="lab-title"><span class="tiny-dot"></span> 观察室 <span class="mono">LIVE CANVAS</span></div><div class="toolbar-right"><span id="stage-state" class="state-pill">等待手势</span><button id="help-button" class="icon-button" aria-label="查看手势指南" title="手势指南">${icon('info')}</button></div></div>
        <div class="stage" id="stage">
          <span class="stage-corner corner-tl"></span><span class="stage-corner corner-tr"></span><span class="stage-corner corner-bl"></span><span class="stage-corner corner-br"></span>
          <div class="specimen-label"><span>NO. 002</span><h2>弥弥 <small>MIMI</small></h2><p>未分类 · 月光软体科</p></div>
          <div class="stage-tip" id="stage-tip">${icon('hand')} 打开摄像头，和弥弥打个招呼</div>
          <svg id="creature-stage" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="可通过真实手势拉伸耳朵和身体的珠光淡紫软体生物弥弥，可从整个轮廓捏出多根触须">
            <defs>
              <radialGradient id="pearl-skin" cx=".36" cy=".22" r=".88"><stop stop-color="#fff5ef"/><stop offset=".25" stop-color="#e9dfea"/><stop offset=".60" stop-color="#c8b5d9"/><stop offset=".84" stop-color="#ac95c1"/><stop offset="1" stop-color="#8b749f"/></radialGradient>
              <radialGradient id="eye-gem" cx=".37" cy=".26" r=".8"><stop stop-color="#60506d"/><stop offset=".45" stop-color="#39293f"/><stop offset=".78" stop-color="#543650"/><stop offset="1" stop-color="#bb8b9b"/></radialGradient>
              <linearGradient id="auricle" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#f8e4e3"/><stop offset=".6" stop-color="#e8b8bf"/><stop offset="1" stop-color="#f7d0ba"/></linearGradient>
              <radialGradient id="cheek-gradient"><stop stop-color="#eeb4b2" stop-opacity=".8"/><stop offset="1" stop-color="#eeb4b2" stop-opacity="0"/></radialGradient>
              <radialGradient id="shine-gradient"><stop stop-color="#fff9f2" stop-opacity=".7"/><stop offset="1" stop-color="#fff9f2" stop-opacity="0"/></radialGradient>
              <radialGradient id="shadow-gradient"><stop stop-color="#887292" stop-opacity=".2"/><stop offset="1" stop-color="#887292" stop-opacity="0"/></radialGradient>
              <filter id="clay-shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="9" stdDeviation="9" flood-color="#715a80" flood-opacity=".17"/></filter>
              <filter id="pearl-rim" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur in="SourceAlpha" stdDeviation="5" result="blur"/><feOffset in="blur" dx="4" dy="7" result="offset"/><feComposite in="SourceAlpha" in2="offset" operator="out" result="rim"/><feFlood flood-color="#fff8ef" flood-opacity=".85"/><feComposite in2="rim" operator="in"/><feComposite in2="SourceGraphic" operator="over"/></filter>
              <clipPath id="skin-clip"><use href="#body"/></clipPath>
            </defs>
            <ellipse id="ground-shadow" cx="480" cy="609" rx="150" ry="25" fill="url(#shadow-gradient)"/>
            <g id="creature" filter="url(#clay-shadow)">
              <path id="body" fill="url(#pearl-skin)" stroke="#a58eb5" stroke-width="1" filter="url(#pearl-rim)"/>
              <g clip-path="url(#skin-clip)">
                <path id="ear-inner-0" fill="url(#auricle)" opacity=".88"/>
                <path id="ear-inner-1" fill="url(#auricle)" opacity=".88"/>
                <ellipse id="head-glow" cx="442" cy="285" rx="110" ry="67" fill="url(#shine-gradient)"/>
                <ellipse id="belly" cx="470" cy="482" rx="62" ry="82" fill="url(#shine-gradient)" opacity=".6"/>
                <path id="head-shine" stroke="#fff9f2" stroke-width="6" opacity=".6" stroke-linecap="round" fill="none"/>
              </g>
              <g id="face">
                <path d="M480 256Q482 274 492 279Q482 282 480 299Q477 282 467 279Q478 276 480 256Z" fill="#efbd82"/>
                <g fill="#e7b487" opacity=".8"><circle cx="449" cy="279" r="2"/><circle cx="508" cy="278" r="2.3"/><circle cx="434" cy="290" r="1.4"/><circle cx="521" cy="291" r="1.4"/><circle cx="456" cy="298" r="1.5"/><circle cx="504" cy="301" r="1.7"/></g>
                <ellipse cx="401" cy="366" rx="32" ry="21" fill="url(#cheek-gradient)"/><ellipse cx="560" cy="366" rx="32" ry="21" fill="url(#cheek-gradient)"/>
                <g id="eyes"><ellipse cx="425" cy="335" rx="26" ry="30" fill="#e5c8d5" stroke="#b49aa9" stroke-width="1"/><ellipse cx="535" cy="333" rx="26" ry="30" fill="#e5c8d5" stroke="#b49aa9" stroke-width="1"/><ellipse cx="425" cy="334" rx="23" ry="27" fill="url(#eye-gem)"/><ellipse cx="535" cy="332" rx="23" ry="27" fill="url(#eye-gem)"/><ellipse cx="418" cy="321" rx="6" ry="5" fill="#fff7e6"/><ellipse cx="528" cy="319" rx="6" ry="5" fill="#fff7e6"/><circle cx="438" cy="348" r="2.4" fill="#e7bcb3"/><circle cx="548" cy="346" r="2.4" fill="#e7bcb3"/><circle cx="417" cy="351" r="1.5" fill="#f4d8a2"/><circle cx="527" cy="349" r="1.5" fill="#f4d8a2"/></g>
                <path id="mouth" d="M473 371Q480 377 487 371" stroke="#a47e8b" stroke-width="2.4" stroke-linecap="round" fill="none"/>
                <path d="M477 358Q480 355 483 358" stroke="#c49ba5" stroke-width="2" stroke-linecap="round" fill="none"/>
              </g>
            </g>
            <path id="contour-guide" fill="none" stroke="#aa92bd" stroke-width="1" stroke-dasharray="2 7" opacity=".38"/>
            <circle id="surface-target" r="14" fill="#edc9b2" fill-opacity=".15" stroke="#b29ac5" stroke-width="1.4" stroke-dasharray="3 4" opacity="0"/>
            <g id="hand-cursor" opacity="0"><circle class="cursor-halo" r="34" fill="#d9bfe4" fill-opacity=".2"/><circle id="cursor-ring" r="21" fill="none" stroke="#9274a6" stroke-width="2.4"/><circle r="4" fill="#9274a6"/><path id="cursor-pinch" d="m-6 1 4 4 9-10" stroke="#9274a6" stroke-width="2.5" fill="none" opacity="0"/><text id="cursor-label" x="0" y="-42" text-anchor="middle" fill="#79628b" font-size="17" font-family="sans-serif">任意位置都能捏</text></g>
            <g class="ear-hint"><path d="M249 345Q258 302 308 303" fill="none" stroke="#b4a3bc" stroke-width="1.3" stroke-dasharray="4 5"/><text x="171" y="371" fill="#a18bad" font-size="16" font-family="sans-serif" transform="rotate(-8 171 371)">从这里，长出新的可能</text></g>
          </svg>
          <div class="stage-bottom"><span><i></i> <span id="mood-text">今天也有无限可能</span></span><span class="mono" id="edit-counter">00 次塑形</span></div>
          <div class="toast" id="toast" role="status"></div>
        </div>
        <div class="sculpt-toolbar"><span>自由生长 <small>整个轮廓都可塑形</small></span><label for="brush-size">拉伸粗细</label><input id="brush-size" type="range" min="16" max="90" value="32"/><output id="brush-label" for="brush-size">纤细触须</output></div>
        <div class="lab-footer"><div><span class="live-dot" id="live-dot"></span><span id="tracking-status" role="status" aria-live="polite">摄像头未开启</span></div><div class="shape-actions"><button id="undo-button" disabled>${icon('reset')} 撤销一步</button><button id="reset-button">${icon('reset')} 重置形态</button></div></div>
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

    <section class="steps" aria-label="三步手势操作指南"><div class="steps-heading"><span>HOW TO PLAY</span><h2>把奇思妙想<br/>交给双手。</h2></div><article><span class="step-number">01</span><div><h3>靠近，找到它</h3><p>手掌面对镜头，让光标靠近<br/>身体任意位置。</p></div><span class="step-sketch">◎</span></article><article><span class="step-number">02</span><div><h3>捏住，慢慢拉</h3><p>拇指与食指捏合，移动手部，<br/>拉出你喜欢的模样。</p></div><span class="step-sketch">↗</span></article><article><span class="step-number">03</span><div><h3>松开，就是新生</h3><p>张开手指，形状就会留下。<br/>每一点不同，都值得被收容。</p></div><span class="step-sketch sparkle">✧</span></article></section>
    <footer class="site-footer"><span>未名生物收容所 <i>© 2026</i></span><p>没有标准答案的形状，只有独一无二的你。</p><span class="mono">MADE OF A LITTLE IMAGINATION ${icon('arrow')}</span></footer>
  </main>

  <dialog id="guide-dialog"><button class="dialog-close icon-button" aria-label="关闭指南">${icon('close')}</button><span class="eyebrow">A SMALL FIELD GUIDE</span><h2>让我们隔空认识一下。</h2><p>在 Chrome 或 Edge 中开启摄像头，让一只手完整入镜。镜像画面中向右移动，观察室里的光标也会向右移动。</p><ol><li><strong>找位置：</strong>看着观察室的圆形光标，移动到整个轮廓。光标显示“可以捏住”时即可抓取。</li><li><strong>捏合拉伸：</strong>拇指与食指靠拢并保持，缓慢移动。可拉长耳朵、拉宽身体；从不同位置反复拉出触须，再抓住已有触须继续塑形或分叉。用“拉伸粗细”调节局部影响范围。</li><li><strong>松手定型：</strong>分开两指，弥弥轻轻回弹后保留新形状。每次抓取都需要先张开，再捏合。</li></ol><p class="dialog-note">距离镜头约 40–80 cm、光线均匀，避免两根手指互相遮挡。若捏合难识别，可稍微提高灵敏度。手部丢失超过 350 ms 会自动松手定型。按 Esc 可随时结束当前抓取。</p><button class="primary-button dialog-done">明白了，开始创造 ${icon('arrow')}</button></dialog>
  <dialog id="archive-dialog"><button class="dialog-close icon-button" aria-label="关闭物种档案">${icon('close')}</button><span class="eyebrow">SPECIMEN ARCHIVE / 002</span><h2>弥弥，还没有被定义。</h2><p>月光软体科的新住客。珠光的皮肤收藏着月亮的颜色，下垂的花瓣耳朵感受每一次靠近。没有固定的四肢数量，也没有必须长成的样子。</p><img class="concept-image" src="${import.meta.env.BASE_URL}concept-mimi.png" alt="弥弥的原创形象设定与多触须形态参考"/><dl class="specimen-facts"><div><dt>初始形态</dt><dd>珠光淡紫 · 星点眼睛 · 花瓣垂耳</dd></div><div><dt>可塑区域</dt><dd>整个连续轮廓 / 自由触须 / 触须分叉</dd></div><div><dt>当前塑形次数</dt><dd id="archive-count">0 次</dd></div><div><dt>档案状态</dt><dd>本次会话中持续生长，刷新后回到初始形态</dd></div></dl><p class="dialog-note">这是「未名生物收容所」毕业设计的交互可行性原型。真正的独一无二，从你伸出手的那一刻开始。</p><button class="primary-button dialog-done">回到观察室 ${icon('arrow')}</button></dialog>
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
    $('undo-button').disabled = sculpture.history.length === 0;
    if (notify) toast('新形状已留下，弥弥很喜欢。');
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
  $('gesture-description').textContent = sculpting ? '局部轮廓已抓住，慢慢拉出新的形状' : pinched ? escapeLatch ? '已结束抓取，请先张开手指' : '请先松开，再靠近虚线区域捏合' : tracking ? hover ? '位置刚刚好，捏合拇指与食指' : '移动光标，靠近整个轮廓' : active ? '将一只手完整放入摄像头画面' : '开启摄像头后，将一只手放入画面';
  $('tracking-status').textContent = cameraState === 'requesting' ? '等待摄像头授权…' : cameraState === 'loading' ? '正在加载本地手部模型…' : cameraState === 'error' ? '摄像头或追踪暂不可用' : active ? tracking ? '已识别 1 只手 · 追踪中' : '摄像头已连接 · 等待手部入镜' : '摄像头未开启';
  $('stage-tip').innerHTML = `${icon(sculpting ? 'expand' : 'hand')} ${sculpting ? '保持捏合移动，松开即可定型' : tracking ? '任意位置捏合向外拉，可反复长出触须' : active ? '手掌面对镜头，让五根手指完整入镜' : '打开摄像头，和弥弥打个招呼'}`;
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
      else toast('还差一点：先张开手指，靠近整个轮廓再捏合。');
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
  $('edit-counter').textContent = '00 次塑形'; $('archive-count').textContent = '0 次'; $('undo-button').disabled = true;
  $('mood-text').textContent = '今天也有无限可能';
  updateStatus(); toast('回到最初的软乎乎，重新想象吧。');
});
$('brush-size').addEventListener('input', event => {
  const value = Number(event.target.value); sculpture.radius = value;
  $('brush-label').textContent = value < 39 ? '纤细触须' : value < 65 ? '柔软肢体' : '宽幅塑形';
});
function undoShape() {
  if (!sculpture.undo()) return;
  escapeLatch = true;
  $('edit-counter').textContent = `${String(sculpture.changes).padStart(2, '0')} 次塑形`;
  $('archive-count').textContent = `${sculpture.changes} 次`;
  $('undo-button').disabled = sculpture.history.length === 0;
  updateStatus(); toast('退回上一个形状，继续想象。');
}
$('undo-button').addEventListener('click', undoShape);
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) { event.preventDefault(); undoShape(); }
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
  const contour = closedCurve(shape.body);
  $('body').setAttribute('d', contour);
  $('contour-guide').setAttribute('d', contour);
  const skin = (x, y) => skinPoint({ x, y }, shape.body);
  const pointString = ([x, y]) => { const p = skin(x, y); return `${p.x} ${p.y}`; };
  const paintedCurve = points => `M ${pointString(points[0])} C ${points.slice(1, 4).map(pointString).join(', ')} C ${points.slice(4, 7).map(pointString).join(', ')} Z`;
  $('ear-inner-0').setAttribute('d', paintedCurve([[354, 321], [350, 383], [314, 468], [328, 480], [344, 476], [362, 390], [369, 340]]));
  $('ear-inner-1').setAttribute('d', paintedCurve([[596, 314], [610, 373], [645, 451], [634, 465], [619, 469], [590, 376], [585, 343]]));
  $('head-shine').setAttribute('d', `M ${pointString([377, 275])} Q ${pointString([403, 240])} ${pointString([439, 238])}`);
  const glow = skin(437, 280); $('head-glow').setAttribute('cx', glow.x); $('head-glow').setAttribute('cy', glow.y);
  const belly = skin(476, 488); $('belly').setAttribute('cx', belly.x); $('belly').setAttribute('cy', belly.y);
  const left = skin(420, 340), right = skin(540, 340), top = skin(480, 290), bottom = skin(480, 390), center = skin(480, 340);
  const a = clamp((right.x - left.x) / 120, .65, 1.5), b = clamp((right.y - left.y) / 120, -.5, .5);
  const c = clamp((bottom.x - top.x) / 100, -.5, .5), d = clamp((bottom.y - top.y) / 100, .65, 1.5);
  $('face').setAttribute('transform', `matrix(${a} ${b} ${c} ${d} ${center.x - a * 480 - c * 340} ${center.y - b * 480 - d * 340})`);
  const xs = shape.body.map(p => p.x), ys = shape.body.map(p => p.y);
  $('ground-shadow').setAttribute('rx', clamp((Math.max(...xs) - Math.min(...xs)) * .48, 100, 330));
  $('ground-shadow').setAttribute('cy', Math.min(675, Math.max(...ys) + 23));
  $('surface-target').setAttribute('opacity', hover && cursor ? .9 : 0);
  if (hover && cursor) { $('surface-target').setAttribute('cx', hover.point.x); $('surface-target').setAttribute('cy', hover.point.y); $('surface-target').setAttribute('r', Math.min(28, sculpture.radius * .6)); }
  const breathing = sculpture.grab ? 0 : Math.sin(now / 1100) * 1.7;
  $('creature').setAttribute('transform', `translate(0 ${breathing})`);
  if (now > nextBlink) { blinkUntil = now + 160; nextBlink = now + 2600 + Math.random() * 4000; }
  const blink = now < blinkUntil ? 0.12 : 1;
  $('eyes').setAttribute('transform', `translate(0 ${334 * (1 - blink)}) scale(1 ${blink})`);
  const expression = sculpture.grab ? 'M474 370Q480 385 486 370Z' : now - releasedAt < 1800 ? 'M471 370Q480 382 489 370' : 'M473 371Q480 377 487 371';
  $('mouth').setAttribute('d', expression);
  $('mouth').setAttribute('fill', sculpture.grab ? '#aa7d99' : 'none');
  if (!sculpture.grab && releasedAt && now - releasedAt < 3000) $('mood-text').textContent = '嗯！这个样子，也很喜欢';
  // Pause interaction behind modal dialogs and if video stops producing frames.
  if (document.querySelector('dialog[open]') && sculpture.grab) { release(false); escapeLatch = true; updateStatus(); }
  if (cameraState === 'active' && cursor && now - lastSeen > 500) { clearHand(); updateStatus(); }
  $('hand-cursor').setAttribute('opacity', cursor ? 1 : 0);
  if (cursor) {
    $('hand-cursor').setAttribute('transform', `translate(${cursor.x} ${cursor.y})`);
    const engaged = currentGesture?.pinched;
    $('cursor-ring').setAttribute('r', engaged ? 15 : hover ? 24 : 21);
    $('cursor-ring').setAttribute('stroke', sculpture.grab ? '#d3a184' : '#9274a6');
    $('cursor-label').textContent = sculpture.grab ? '正在塑形 · 松开定型' : engaged ? '已捏合' : hover ? '可以捏住' : '任意位置都能捏';
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
