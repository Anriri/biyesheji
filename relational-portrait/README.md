# RELATIONAL PORTRAIT — Interactive Prototype

记忆 → 空间关系 → 未来想象。一个实际运行的 Three.js 2.5D 互动艺术实验，界面使用英文。独立放在 `relational-portrait/`，旧版《未名生物收容所》及其素材、下载包和入口均保留。

![Interactive prototype preview](docs/preview.png)

## 运行

开发环境：Node.js **22.12+**（本环境验证版本 24.19）与 npm。

```bash
cd relational-portrait
npm ci
npm run dev
```

在运行服务的电脑上打开终端显示的地址，默认 `http://localhost:5174/`。开发服务监听 `0.0.0.0`；摄像头只在本机 localhost/127.0.0.1 或 HTTPS 下可用。远程访问需通过支持 HTTPS 的预览或部署，普通局域网 HTTP 不具备摄像头权限。

```bash
npm run build       # TypeScript 检查 + Vite 生产构建
npm run preview     # 预览 dist，默认 4174
npm test            # 逻辑测试
npm run test:browser # Chromium / Playwright 功能测试
```

浏览器测试默认用 `/usr/bin/chromium`。其他系统先 `npx playwright install chromium`，或通过 `CHROMIUM_PATH` 指定浏览器，然后运行测试。应用本身不需要 Playwright。

### Windows 10 / 11 直接运行包

仓库 `downloads/relational-portrait-windows-v1.zip`：全部解压后双击 `start-windows.bat`。保持启动窗口打开，页面在自己的电脑上运行，不上传记忆或摄像头画面。不需要安装 Node.js、Python、npm；Three.js、WASM、模型和占位素材都已包含。不要直接双击 `app/index.html`，JavaScript 模块与模型需要 HTTP 服务。

修改源码请进入包内 `source/`，执行 `npm ci` 和 `npm run dev`。

启动器复用了旧项目的 PowerShell TCP 本机静态服务器，只监听 127.0.0.1，并自动选择空闲端口。此版本在 Linux/Chromium 中验证网页及静态构建；未在 Windows 实机上运行启动器。

## 体验流程

1. **Memory input**：默认两位参与者与题目示例。输入文字后点 **Find shared motifs**；标签可直接编辑、用 × 删除或自行添加。**Add participant** 可增加第三位及更多参与者。每人有独立文字、标签和稳定 ID，不是写死的 A/B 两份状态。
2. **Generate portrait**：建立独立透明素材与不同深度的 2.5D 场景。初次打开的动态画面标为 **Studio preview**，不冒充已生成的个人作品。生成后才启用后续步骤。
3. **Initial portrait**：选择图层，调整 X/Y/Z、Size、Opacity、Visible。**Replace with transparent PNG** 逐层替换，保留该层的空间与互动逻辑；可恢复默认素材。PNG 限 4 MB、4096 × 4096。视差由展示区域内的指针轻微改变观察方向。
4. **Live interaction**：默认 **Manual**，无需摄像头即可完整体验。Distance 越小，鱼群和轨迹越聚合；越大，空间与轨迹向两边分离。Synchrony 越高，鱼群与线条节奏越协调；Raised hands 改变鱼的高度。Expression 是明确标注的手动数值接口，不是心理或情绪识别。
5. **Use camera**：允许摄像头，让两人的上半身与手腕完整进入镜头。身体中心来自肩/髋，抬手来自腕相对肩的位置。识别结果在本机映射到同样的实时参数，不重新调用素材生成。状态显示人数与推理帧率。**Manual / Stop camera** 会释放摄像头。默认隐藏摄像头预览；勾选后只在控制面板出现，绝不进入作品或导出图片。
6. **Future input**：输入未来、提取并编辑标签，点 **Grow this world**。约 12 个场景秒中，池塘扩展、新海洋与建筑片段渐入，鱼与轨迹向新空间移动；初始校园与水体不会被替换。第一版每个肖像支持一个未来章节，生成新的初始肖像可开始另一轮实验。
7. **Final portrait**：导出 **1600 × 900 PNG**、完整 **Portrait JSON**、单独的 **Text & motifs** 文本。**Replay the full journey** 重现初始显现、记录的互动参数及未来过渡，时间轴可暂停定位，再播放或回到 Live。**Open portrait** 恢复 JSON（含自定义 PNG、文字、标签、图层、参数时间线）。没有自动向服务器保存，重要作品请导出 JSON。

最终艺术区域及 PNG 没有人物、人脸、人物剪影或相机视频。人物只作为输入。

## 摄像头与离线资源

- 使用固定版本 **MediaPipe Tasks Vision 0.10.21 / Pose Landmarker**（避免新版 SDK 的使用统计请求），本版 `numPoses: 2`。记忆、作品数据、轨迹和手动编排支持参与者数组；摄像头本轮同时追踪最多两人。
- 首次安装后 `postinstall` 从 npm 包复制匹配的 WASM 到 `public/vision/wasm/`。姿态模型已放在 `public/models/`，不依赖 Google Storage/CDN 在线下载。模型加载前校验 SHA-256，来源、独立比对与许可证在 `public/models/PROVENANCE.md`。
- 权限拒绝、无设备、非安全上下文、模型缺失、校验失败或跟踪异常均显示具体状态并保留手动控制。停止后终止 MediaStream tracks，取消推理与待处理请求。
- 相机未看到两个人时，不伪造距离或同步检测。只有一个身体时，显示需要第二人；静止两人不会被当作“同步移动”。
- 位置关联是近邻匹配与平滑，不是身份识别；交叉、遮挡和离开镜头后可能换槽。光线、衣着、遮挡、距离与 CPU 会影响识别。建议单台摄像头、固定机位、背景简洁，镜头内站两人并留出手腕空间。

## 架构

| 文件 | 职责 |
| --- | --- |
| `src/App.tsx` | 五阶段界面、参与者/标签编辑、手动控制、相机状态、素材上传、导出/导入 |
| `src/services/creative.ts` | 独立 `CreativeService` 接口；当前为本地英中关键词与语义素材计划，无真正 AI API |
| `src/assets.ts` | 独立透明 SVG 占位素材；背景、建筑、水、鱼/物件与关系轨迹分别生成，支持替换 PNG |
| `src/engine.ts` | PerspectiveCamera + 不同 Z 平面，水体顶点着色器、鱼群路径、浮动建筑、关系线、渐入与回放 |
| `src/services/tracking.ts` | Pose 初始化/停止、可见性检查、镜像坐标、身体匹配、运动特征、独立 `ExpressionSource` 接口 |
| `src/types.ts` | 可扩展参与者、图层、计划、信号帧与作品数据模型 |
| `src/work.ts` | JSON 验证与作品恢复，拒绝无效数值和外部追踪图片地址 |

真实 AI 服务可以实现 `CreativeService`，替换本地关键词与素材计划；透明图像的实际提供/替换与 Three.js 实时参数解耦。现有输入与动作变化不触发 AI 图像生成请求。占位素材是程序绘制的独立 SVG，不是一张合成背景，且没有使用复杂 3D 模型、Bloom、体积光、Lens Flare 或大量粒子。

### 视觉映射

- 身体靠近 → 两组轨迹终点与鱼群收拢；远离 → 轨迹形成分离的分支。
- 同方向移动速度与方向一致 → 提高相位协调度；静止输入同步值为 0。
- 腕高于肩 → 增加鱼群垂直空间。
- 手动 Expression → 轻微改变色彩参数，不产生情绪标签。
- Future tags → 决定新增海洋/水域与建筑素材；Three.js 负责渐入、扩展、位置插值和现有元素迁移。

## 已验证与范围

执行 TypeScript/Vite 构建、逻辑单测与真实 Chromium 功能测试，覆盖标签、三个参与者、图层 PNG 替换、手动互动、未来增量生长、PNG 尺寸、文字/JSON 导出与恢复、回放、手机尺寸、相机拒绝与模型缺失、本地模型实际推理。另以临时合成的双人测试画面通过相机输入路径，确认返回两个身体位置；测试画面没有打包或出现在艺术素材中。

当前未接真实生成式 AI；未接 Face Landmarker，表情接口仅手动数值；无 AR、声音、视频导出、账户、数据库或多人联网。回放保存的是视觉参数时间线、初始显现和未来加入时间，按保存的最终图层设置重现；不记录每次打字、鼠标视差或素材编辑的全部过程。不保证遮挡/交叉中的身份不变，也未在当前云环境使用物理双人摄像头实测，因此真实现场动作质量仍需在安装场地校准。

## 重新打包

```bash
npm ci
npm run build
python3 scripts/package-windows.py
```

生成的运行包写到父仓库 `downloads/relational-portrait-windows-v1.zip`；该脚本只生成新包，不改旧项目。
