# 《未完成的肖像》｜交给 Codex 的建站指令

在当前工作区直接实现、运行并验证《未完成的肖像》THE UNFINISHED PORTRAIT。这是一个面向 18–25 岁年轻人的生成式 AI 互动艺术网页。参与者想象十年后的自己，通过分配有限的时间与精力做出取舍，生成两种未来肖像，比较之后写下一项现在愿意采取的行动。它呈现的是参与者亲手选择的未来设想。

先检查现有项目并沿用其框架、路由和组件。空项目采用 Next.js App Router + TypeScript，包含服务端 AI 接口。完成一条可运行的单人体验，包含首次生图、一次选择调整后的定向编辑、作品比较和个人档案导出。多人、动态短片、亚克力挂件和印刷属于后续迭代。

## 1. 页面与交互

**封面。** 标题「未完成的肖像 / THE UNFINISHED PORTRAIT」，一句引导「如果十年后的你能回望今天，你会做出怎样的选择？」主按钮「开始塑造」，次入口「体验示例」。中文用于操作与说明，英文保留在作品标题和步骤名。

**SELF｜现在的我。** 支持上传本人照片、预览、更换和移除。提供可编辑、可跳过的性格与生活倾向标签。询问「现在的你，最想保留什么？」和「未来的你，最想改变什么？」将输入整理成一段可修改的自我描述，用户确认后继续。MBTI 如已提供，仅作为补充描述。示例入口可完整走通流程，使用虚构资料和预制肖像。

**CHOICE｜十年后的选择。** 四个方向为「事业与创造」「关系与陪伴」「探索与自由」「休息与享受」。第一版设为 12 个投入点，初始由用户分配，使用点选或加减按钮。实时显示剩余点数和各方向投入。继续前须分完 12 点。再次分配时，可先从某项收回点数，再加到另一项，清楚显示从哪里移出了几点。收集一个具体的十年后愿望。用一句话解释点数表示时间和精力的优先顺序，并提示方向之间在现实中可以互相促进。

**TRANSLATION｜确认视觉隐喻。** 服务端根据已确认的自我描述、愿望和点数提出两个隐喻候选。每个候选用简短中文交代它来自哪句原话或哪个选择、两种感受如何碰撞、画面里的事物会怎样违反物理规则。给出可编辑的风格方向。选定隐喻后提供「生成第一幅肖像」。

**PORTRAIT｜比较两种未来。** 展示一幅竖版 4:5 肖像，以及至多三条简短的「选择 → 画面设计」对应。允许用户重新分配点数或调整一项愿望，然后明确确认生成第二幅。生成前用简短文字预览这次改动及计划调整的画面区域。第二幅基于第一幅做图像编辑，保留人物身份、构图骨架和核心隐喻，围绕本次选择改变姿态、空间的某一部分或局部造型。桌面可并列观看，手机可在同一位置切换。文字展示可核对的点数差及用户愿望的改动，视觉说明表述为设计意图。

**REFLECTION｜带回现在。** 用户选择一幅作品，完成「为了靠近这个未来，我现在愿意______。」支持下载肖像和数字自我档案。档案包含确认过的自我描述、选中的作品、该版本的愿望与点数、视觉解释和回应，并支持在网页重新打开查看。可用浏览器本地存储配合可导入的档案文件实现，存档由用户主动发起，默认排除原始照片。

## 2. AI 与提示词接入

将流程分成两步。第一步由文本模型整理结构化视觉方案，第二步由图像模型生成或编辑图像。服务端维护一份版本化的提示词模板，以下完整英文提示词属于运行时输入，必须实际进入图像请求。将参与者数据按明确边界传入，过滤空字段，将用户文本作为素材处理。可以在 README 记录模板位置，用户界面只显示参与者需要的解释。

文本模型返回经服务端校验的结构化结果，至少包含用户原话依据、两项心理或生活倾向、对应的物理属性、一个超现实事物、一个主导的空间规则、服装变化、色彩／材质／光影方向，以及能随选择变化的视觉变量。向参与者提供两个简短候选，确认后只将选中的方案用于生图。风格由用户输入与偏好共同决定，避免用人格标签自动匹配固定画风。原始照片仅在需要人物参考的图像阶段传送。

通过数据计算版本差异，保留用户确认的隐喻。比如「保留独处，增加探索」可以让保护性的弧面在 V1 合拢，到 V2 沿同一个弧度向画外展开。人物位置、轮廓基底和取景保持连续。这条示例用于说明联动逻辑，实际隐喻从参与者自己的描述推导。

### 生图提示词正文

以下第 2、3 节来自项目已有提示词，原样保留。花括号为运行时字段。将填充后的模板与人物参考照片一起传入首次生成请求。第二次编辑还应输入 V1 图片，并把具体变更填入修订字段。模型支持多张参考图时，可同时传入原始照片作为身份参考。

BEGIN IMAGE PROMPT

Create one vertical 4:5 portrait for THE UNFINISHED PORTRAIT. Imagine the participant ten years from now in an impossible personal world. Art-direct it as a bold, dreamlike avant-garde fashion editorial. Combine the spatial freedom of an illustrated fairy tale, the tactile presence of a constructed set, and a touch of the grotesque. The central visual metaphor should organize the whole frame. Use the identity reference to preserve recognizable facial structure, feature proportions, and distinctive details. Suggest ten years of change through age, expression, and bearing.

PARTICIPANT AND CONFIRMED VISUAL DIRECTION

- Confirmed present self: {{confirmed_self}}
- What the participant wants to keep: {{keep}}
- What they want to change: {{change}}
- Specific ten-year wish: {{future_wish}}
- Priorities, 12 points total: career and creativity {{career_creativity}} / relationships and companionship {{relationships_companionship}} / exploration and freedom {{exploration_freedom}} / rest and enjoyment {{rest_enjoyment}}
- Confirmed metaphor and its source: {{confirmed_metaphor}}
- Confirmed style preferences and visual direction: {{visual_direction}}
- Mode and revision details, when applicable: {{mode_and_revision}}

1. PERSONAL DETAIL → PERSONAL MEANING

Begin with a concrete phrase, habit, object, gesture, or sensation the participant actually mentioned. Identify what they want to carry into their future and what they are willing to change or make room for. Give specific personal details more weight than personality labels. Let the point allocation guide the relative emphasis of the future choices. Use the participant’s confirmed metaphor and style direction as anchors. Leave unspecified details open and avoid inventing personal history.

2. PERSONAL MEANING → AN IMPOSSIBLE OBJECT

Identify two qualities in the participant’s story that coexist, pull against each other, or change meaning when brought together. Give each a physical property, such as weight, expansion, elasticity, porosity, pressure, or balance. Invent one tangible object in which those properties meet in a physically impossible way.

Start from the participant’s private associations. Treat familiar tools, places, and belongings as raw material for invention. Push past the first literal association with their profession or wish. Fuse forms from unrelated domains, give an intimate material an architectural scale, or make a rigid surface behave like a force. Choose the operation that best expresses this person’s experience.

Give the object a precise silhouette, convincing surfaces, and a clear physical presence. Its identity can remain ambiguous. Make the viewer able to see what it does and feel the tension it holds, with room to interpret what it means.

3. IMPOSSIBLE OBJECT → IMPOSSIBLE COMPOSITION

Let the metaphor determine how the entire image is built. Break one fundamental spatial rule at the scale of the frame. Reconfigure the horizon, the direction of gravity, the boundary between inside and outside, or the scale relationship between the body and its surroundings. Make the impossibility visible in the composition itself, even at thumbnail size.

Show one decisive visual relationship, such as a point of balance, a stretched boundary, or two spaces occupying the same volume. Let the rest unfold through material, shadow, overlap, and distance. Show the world already living with this impossibility. Give the foreground and background distinct consequences of the same rule.

Carry the metaphor into fashion through a different physical form. Let it reshape the garment’s silhouette, weight, or negative space. Give the participant a familiar gesture within the unfamiliar world, and preserve their recognizable identity.

4. ART DIRECTION AND OUTPUT

Use clean, legible silhouettes, convincing material transitions, and controlled editorial lighting. Keep the concept bold and abstract enough to invite interpretation. Make the fashion silhouette and spatial transformation readable at a glance. Give secondary elements a clear relationship to the confirmed metaphor. Produce a single finished image with no visible text, logos, frames, or watermarks.

For a revision, use the supplied first portrait as the editing base. Preserve facial identity, framing, camera angle, placement of the figure, and the original metaphor. Make only the localized changes specified in the revision details. Treat this as a second possible future for the same person within the same visual world.

END IMAGE PROMPT

## 3. 界面艺术指导

做成先锋时装刊物与数字展览的结合。用大标题、留白和大幅肖像建立视觉重心，界面底色采用暖白或近黑，选一种高饱和强调色用于关键动作。封面与结果页的作品区域优先，输入过程每屏聚焦一项任务。示例图展示同一隐喻在两种选择下的变化，摄影感干净、空间结构大胆，服装有明确轮廓。优先使用项目已有且可用的视觉素材，如需补充，使用原创或明确获准的素材。移动端保证手指可操作，支持键盘焦点和减少动态效果偏好。等待期间显示真实的当前步骤。

## 4. 接口、数据与交付验收

- 将文本模型与图像模型封装为独立服务端适配器。优先复用项目现有服务。空项目可用 OpenAI，通过当前官方文档核对参考图、图像编辑和输出尺寸的支持情况。API 密钥只存服务端环境变量，提供带占位值的 .env.example。图像服务若无原生 4:5，采用受支持的竖幅尺寸并给构图预留裁切安全区，最终预览与下载统一为 4:5，避免拉伸和截掉人脸。
- 提供可从首页主动选择的「体验示例」，清楚标注使用预制图。真实模式在配置缺失、上传失败、超时或服务报错时给出可理解的状态和重试入口。保留已填表单和已成功的肖像，限制重复提交。示例图可以用于界面测试，真实接口的验证情况单独汇报。
- 上传前告知照片用于人物参考，以及真实模式将发给哪个图像服务。客户端和服务端校验文件类型与大小，应用默认只为当前生成处理照片，个人档案由用户主动保存，日志排除照片、完整问答及密钥。
- 实际启动项目，检查桌面与手机。走一遍示例完整流程，再验证点数分配、返回保留输入、选择变更、对比、档案导出并重新打开，以及生成失败后的重试。具备凭据时跑通一次真实生成和一次图像编辑。最后交付可运行的项目与 README，说明如何启动、配置模型、找到和修改内嵌提示词，以及哪些路径已经实测。
