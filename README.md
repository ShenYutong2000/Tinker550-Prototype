# Tinker550 原型

Tinker550 是一个 React、TypeScript 和 Vite 项目。孩子可以在设计板上连接玩法卡片、绑定素材，再在工作台中试玩。

## 本地运行

使用项目支持的 Node.js 版本。当前工作区使用 Node.js 24 验证。

    npm install --legacy-peer-deps --ignore-scripts --no-package-lock
    npm run dev

开发服务默认使用 3000 端口。首页、设计板、内置素材和本地试玩可直接使用。运行以下命令检查类型和生产构建。

    npm run lint
    npm run build
    npm run preview -- --host 127.0.0.1 --port 3020

## 代码目录

- src/main.tsx 挂载 React。src/index.css 引入全局样式。
- src/app/ 负责应用入口、视图切换和顶部导航。
- src/features/start/ 放开始创作入口和首页画板动画。
- src/features/studio/StudioWorkspace.tsx 管理工作台布局，以及设计板、素材和试玩共用的编辑状态。
  - design-board/ 放卡片、连线交互、数据模型、初始数据和文案推导。
  - asset-library/ 放素材列表、素材编辑和素材数据。effects/ 放视觉特效的编辑、模型和渲染。
  - properties/ 放属性面板、范围选择、状态模型和公式处理。
  - playtest/ 放右侧试玩界面、画面模拟和执行卡片及条件连线的引擎。
  - guidance/ 放工作台内的引导。
- src/shared/i18n.ts 集中维护中英文界面文案。
- src/assets/ 和 public/ 存放原版静态素材。.aistudio/ 存放原版 AI Studio 导出资料。

添加功能时，将界面和专用逻辑放入对应的功能目录。跨子功能的状态协调在工作台入口处理。卡片、属性和试玩之间共用的规则放在对应的模型或引擎模块，界面通过导入使用。

[AI Studio 原型](https://ai.studio/apps/6889088b-5a2e-4784-9dd7-3a869035ff74)
