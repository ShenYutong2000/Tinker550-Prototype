# 素材视觉效果加工（Visual Effects）实施方案

在素材编辑抽屉的 **Visual / 视觉** 区域下方新增一套非破坏性的二次视觉加工系统，支持对每个素材状态（State）已生成或上传的图片 / GIF / 视频实时叠加 5 大类视觉与动态效果，并在素材预览区和右侧 2D 试玩舞台中同步生效。

---

## User Review & Critical Decisions

> [!IMPORTANT]
> 以下 4 项关键产品决策已按你的确认锁定，本方案将严格围绕这些共识落地：

- **Fade 合并**：将原本分散在第 1 类的 *Fade In / Out* 与第 5 类的 *Fade* 合并为 **Dynamic Effects（动态效果）** 下的单一 **Fade（渐显 / 渐隐）** 效果，并保留 **Easing（缓动曲线）** 作为其折叠的「高级」参数；第 1 类 **Transparency & Visibility** 保持纯粹的静态透明度与显隐控制。
- **Figma 式按需添加交互**：Visual 下方默认保持干净收起，通过 **`+ Add Effect / + 添加效果`** 分类菜单按需添加效果；只有已添加的效果才展开为可开关（眼睛图标）、可折叠、可删除的参数行，避免 372px 抽屉被十几个默认滑块淹没。
- **高级参数渐进披露**：所有基础参数直接可用；标注为「高级」的 3 项参数（**Fade → Easing**、**Sharpen → Intensity**、**Distortion → Intensity**）默认收在各自效果行底部的 **`Advanced / 高级`** 折叠开关内，点击即展开微调。
- **实时预览 + 动态试播 + Play 舞台全同步**：静态效果在素材预览框中即时渲染；添加任意动态效果后，预览框右上角自动出现 **`Preview / 试播`** 按钮（调节动态参数时亦自动重播一次），且所有静态与动态效果都会实时同步到右侧 2D Play 舞台中绑定了该素材的角色、障碍物、背景与对话头像。

---

## 1. Overview & Core Concept

- **核心能力**：把素材的原始图片 / GIF / 视频作为“底片”，在每个状态页（例如小猫的 *Default*、*Jump*、*Hurt*）下独立叠加一层可随时开关、微调、重置的视觉效果栈（Visual Effects Stack），彻底保留原图不被破坏。
- **目标用户**：13 岁以上的游戏设计学习者。通过“选素材 → 切状态 → 叠效果 → 立刻在右侧舞台看变化”的直观反馈，快速掌握透明度、调色、描边、像素化与受击闪烁/震动等游戏美术表达手法。
- **核心价值**：
  - 同一张图配合多状态文件夹页 + 视觉效果，无需重画即可做出“受伤闪红震动”“隐身半透明”“像素风变身”“发光无敌态”等丰富游戏状态。
  - 按需添加的极简面板既保持了 18 项专业维度的完整表达力，又让新手打开抽屉时零压迫感。

---

## 2. User Experience & Visual Design

### 关键交互流程

1. **零负担初始态**：打开任意视觉类素材（角色、物品、背景、特效，以及处于 Image 模式的游戏界面）后，在 Visual 预览框与 `AI Generate / Upload` 按钮下方，会出现带魔棒图标的 **Visual Effects / 视觉效果** 标题栏与 **`+ Add Effect / + 添加效果`** 按钮；未添加任何效果时不占据额外高度。
2. **按类点选添加（Figma 风格）**：点击 **`+ Add Effect`** 弹出分组清晰、支持按 5 大类浏览的菜单（已添加的效果自动标记勾选或置灰，防止重复堆叠冲突）：
   - **Transparency & Visibility（透明度与可见性）**：Opacity（0–100%）、Visibility（Show / Hide）
   - **Color & Lighting（色彩与光线）**：Brightness、Contrast、Saturation、Hue、Tint（Color + Intensity）、Grayscale（0–100%）
   - **Blur & Style（模糊与图像风格）**：Blur（Radius px）、Pixelate（Pixel Size）、Sharpen（含高级 Intensity）、Distortion（Type: Ripple / Wave + 高级 Intensity）
   - **Glow, Outline & Shadow（发光、描边与阴影）**：Glow（Color / Intensity / Radius）、Outline（Color / Thickness）、Shadow（Color / Offset X & Y / Blur / Opacity）
   - **Dynamic Effects（动态效果）**：Flash / Blink（Frequency / Duration / Count）、Fade（Start & End Opacity / Duration + 高级 Easing）、Pulse（Scale / Frequency / Count）、Shake（Intensity / Frequency / Duration）、Color Flash（Color / Duration / Count）
3. **单行精简控制与实时反馈**：
   - 每条已添加的效果呈现为紧凑的卡片行，头部包含：**效果名称**、**单条启用/隐藏开关（Eye 图标）**、**折叠/展开箭头**、**删除按钮（Trash / X）**；当存在已添加效果时，效果栏右侧提供一键 **Reset / 重置**。
   - 所有滑块均带清晰标签、等宽数字读数（`tabular-nums`）与单位（`%`、`px`、`°`、`s`、`Hz`、`×`）。
   - 含有高级项的效果在参数底部显示轻量的 **`Advanced ▸ / 高级 ▸`** 折叠开关，展开后呈现 `Easing`（Linear / Ease In / Ease Out / Ease In-Out）或对应的 `Intensity` 滑块。
   - 当 **Visibility** 设为 `Hide` 时，素材编辑器预览框显示半透明棋盘格与清晰的“已隐藏”文字标识（不让用户误以为图片丢失），而右侧 Play 舞台中该实体则真实隐藏。
4. **动态效果试播与舞台联动**：
   - 只要当前状态添加了至少一个已启用的动态效果，Visual 预览框角落就会浮现紧凑的 **`▶ Preview / 试播`** 按钮（播放中切换为停止/重播状态）；修改动态参数时也会自动触发一次即时预览。
   - 在右侧 **Play 舞台**中，凡是卡片绑定了该素材的角色精灵、挑战障碍/收集物、场景背景与对话头像，都会实时继承当前激活状态的全部静态滤镜与动态效果。

### 视觉风格与排版约束

- **延续 Tinker 550 明亮工作台风格**：保持 60% 清爽中性白/浅灰底（`#FFFFFF` / `#F8FAFC`）、30% 细腻分割线与结构面板（`#E2E8F0` / `#CBD5E1`）、10% 深海蓝主交互色（`#14244B`）与天蓝焦点反馈（`#4E9AE3`）。
- **无多余气泡与视觉噪音**：分类标题使用柔和无加粗文字，数值读数统一采用 `font-mono tabular-nums`，按钮单行防换行（`whitespace-nowrap shrink-0`），且在彩色状态文件夹页内部保持清爽层级不嵌套厚重边框。

---

## 3. Key Product Decisions & Trade-Offs

- **决策 1：效果数据挂在每个 State（状态）而非整个 Asset**
  - *方案*：将视觉效果配置存储在每个状态槽位中，与该状态的 Visual / Audio 一一对应。
  - *原因*：玩家通常需要让“默认态”保持正常，而让“受伤态”带红色闪烁 + 震动、让“隐身态”带 30% 透明度 + 发光；按状态独立保存完美契合刚刚完成的彩色文件夹标签页心智模型。
  - *替代方案（已舍弃）*：做成全局素材级效果（会剥夺不同状态差异化加工的能力）。

- **决策 2：静态滤镜采用 CSS + SVG Filter 组合，Pixelate 采用离屏低分辨率像素重采样**
  - *方案*：常规调色与模糊使用原生 CSS Filter；Tint（保留透明通道染色）、Outline（贴合剪影轮廓描边）、Sharpen（3×3 卷积锐化）与 Distortion（`feTurbulence` + `feDisplacementMap` 波纹/波浪扭曲）通过轻量内联 SVG `<filter>` 实时渲染；Pixelate 则通过离屏 Canvas 缩放到低像素再关闭平滑（`imageSmoothingEnabled = false`）放大，实现真正的锐利像素块质感。
  - *原因*：兼顾所有 PNG / SVG / 上传图片与 GIF 的透明边缘保真度，无需引入沉重的 WebGL 依赖，且对 13+ 网页端性能极友好。

- **决策 3：统一的确定性动态求值引擎驱动双端**
  - *方案*：将 5 种动态效果（Flash/Blink、Fade+Easing、Pulse、Shake、Color Flash）抽象为纯时间函数 `evaluateDynamicEffects(effects, elapsedSec)`，输出当前帧的透明度系数、缩放比、抖动位移与颜色闪烁遮罩。
  - *原因*：素材预览区（DOM 动画帧）与右侧 Play 舞台（2D Canvas 主循环）共用同一套数学公式，确保“编辑框里调出来的节奏 = 试玩舞台上跑出来的效果”，绝不出现双端表现不一致。

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### 系统架构与数据流

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                       StudioWorkspace (Single Source of Truth)          │
│   AssetItem.states[i].visualEffects  (Per-State VisualEffectsConfig)    │
└───────────────────────────────┬──────────────────────────┬──────────────┘
                                │                          │
                                ▼                          ▼
┌──────────────────────────────────────────┐  ┌───────────────────────────┐
│        AssetEditorDrawer (Visual)        │  │  RightStudioColumn (Play) │
│  ┌────────────────────────────────────┐  │  │  ┌─────────────────────┐  │
│  │ Visual Preview Box                 │  │  │  │ 2D Canvas Renderer  │  │
│  │ • Inline SVG Filter Defs           │  │  │  │ • Hero Sprite       │  │
│  │ • CSS Filter + Pixelate Render     │  │  │  │ • Challenge Entity  │  │
│  │ • Dynamic Replay (▶ Preview) rAF   │  │  │  │ • Stage Backdrop    │  │
│  └────────────────────────────────────┘  │  │  └──────────┬──────────┘  │
│  ┌────────────────────────────────────┐  │  │             │             │
│  │ VisualEffectsEditor (Figma Stack)  │  │  │  ┌──────────▼──────────┐  │
│  │ • [+ Add Effect] 5-Category Picker │  │  │  │ Dialogue Portrait   │  │
│  │ • Active Effect Rows (Eye/Fold/X)  │  │  │  │ (DOM + SVG Filter)  │  │
│  │ • Collapsible [Advanced ▸] Toggles │  │  │  └─────────────────────┘  │
│  └────────────────────────────────────┘  │  └─────────────┬─────────────┘
└───────────────────────┬──────────────────┘                │
                        └───────────────┬───────────────────┘
                                        ▼
                 ┌──────────────────────────────────────────────┐
                 │      Shared Visual Effects Core Engine       │
                 │ • Typed Effect Schema & Sensible Defaults    │
                 │ • SVG Filter & CSS Style Composer (DOM)      │
                 │ • Offscreen Canvas Effect Baker (2D Stage)   │
                 │ • Deterministic Dynamic Evaluator (rAF time) │
                 └──────────────────────────────────────────────┘
```

### 核心数据模型

- 在每个 `AssetStateSlot` 上新增可选字段 `visualEffects?: VisualEffectItem[]`（或按唯一类型索引的有序效果栈数组，天然记录用户添加顺序、每条效果的 `enabled` 开关状态和各自强类型参数）。
- **5 大类 16 项非冗余效果完整覆盖**：
  1. **Transparency & Visibility**：`opacity`（0–100%）、`visibility`（`show | hide`）
  2. **Color & Lighting**：`brightness`（0–200%）、`contrast`（0–200%）、`saturation`（0–200%）、`hue`（-180°–180°）、`tint`（`color`, `intensity` 0–100%）、`grayscale`（0–100%）
  3. **Blur & Style**：`blur`（`radius` 0–20px）、`pixelate`（`pixelSize` 2–24px）、`sharpen`（默认开启基础锐化 + 高级 `intensity` 0–100%）、`distortion`（`type`: `ripple | wave` + 高级 `intensity` 0–100%）
  4. **Glow, Outline & Shadow**：`glow`（`color`, `intensity`, `radius`）、`outline`（`color`, `thickness`）、`shadow`（`color`, `offsetX`, `offsetY`, `blur`, `opacity`）
  5. **Dynamic Effects**：`flash`（`frequency`, `duration`, `count`）、`fade`（`startOpacity`, `endOpacity`, `duration` + 高级 `easing`: `linear | ease-in | ease-out | ease-in-out`）、`pulse`（`scale`, `frequency`, `count`）、`shake`（`intensity`, `frequency`, `duration`）、`colorFlash`（`color`, `duration`, `count`）

### 交互与状态映射

- **添加 / 开关 / 调参 / 重置**：均通过 `onUpdateAsset` 不可变更新当前 `activeState.visualEffects`，即时触发预览框与右侧 Play 舞台重绘。
- **动态效果预览循环**：在预览组件内部维护轻量的播放状态（`isPlayingDynamic` + `startTimeRef`）；当动态效果全部结束（取所有已启用动态效果的最大持续时间）后自然停在终态或回到静态基态，随时可点 `▶ Preview` 重播；在 Play 舞台中，静态预览模式与点击 Play 运行模式均按时间循环/触发驱动动态效果，确保所见即所得。
- **Canvas 性能保护**：在右侧 2D 舞台渲染中，将昂贵的静态像素加工（如 Pixelate、Outline、Tint、Distortion、Sharpen）按素材 URL + 效果指纹缓存在离屏 Canvas，仅当参数变更时重算；逐帧 60fps 循环只执行极轻量的动态变换（Opacity、Scale、Shake 位移、Color Flash 叠加），保证试玩流畅不卡顿。
- **双语同步**：所有 5 大类名称、16 项效果名称、参数名、单位、`Advanced` 折叠开关与 `Preview / 试播` 提示完整支持 `EN / 中文` 即时切换。
