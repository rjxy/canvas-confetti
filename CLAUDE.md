# CLAUDE.md

本文件为在此仓库中工作的 Claude Code / Ducc 提供项目导览，避免每次都重读源码。

## 项目简介

canvas-confetti 是一个浏览器端的高性能纸屑（confetti）动画库，零依赖。核心卖点是把粒子计算与渲染放到 Web Worker 的离屏画布（OffscreenCanvas）上，不阻塞主线程。

入口导出 `confetti()` 函数，并挂载 `confetti.create()` / `confetti.reset()` / `confetti.shapeFromPath()` / `confetti.shapeFromText()`。

## 常用命令

- `npm run build` — 用 esbuild 打包，产物进 `dist/`（`build/build.js`）
- `npm test` — 先自动 build（pretest），再用 ava 串行跑 `test/` 下的测试（基于 puppeteer 做真实浏览器渲染验证）
- `npm run devtest` — 带 `CONFETTI_SHOW=1` 跑测试，可见浏览器窗口便于调试
- `npm run lint` — eslint 检查 `src/`、`test/`、`build/`
- `npm run dev` — 启本地开发服务器（`build/serve.js`）

## 源码模块地图（src/）

按调用链从入口到底层：

- **confetti.js** — 库入口。懒创建一个全局单例 `ConfettiCannon`（配置 `{ useWorker: true, resize: true }`），导出 `confetti` 函数及 create/reset/shapeFrom* 方法。
- **ConfettiCannon.js** — 核心协调类，管理单个发射器的完整生命周期：创建/管理 canvas 与 Worker、处理 fire/reset/resize、Worker 不可用时回退到主线程。封装了 Worker 的 postMessage 通信协议。
- **worker.js** — Web Worker 入口。在独立线程中接收配置、生成粒子、驱动 OffscreenCanvas 渲染，动画结束时回传 callback。
- **animator.js** — 动画循环引擎。`raf` 是带 ~60fps 帧率限制的 requestAnimationFrame 封装；`Animation` 类逐帧 clear→update 粒子→绘制→剔除死亡粒子。
- **Particle.js** — 单个纸屑粒子的物理状态与渲染（位置/速度/重力/摆动/倾斜，支持 path/bitmap/circle/方块等形状）。
- **shapes.js** — `shapeFromPath` / `shapeFromText`，把 SVG path 或文字/emoji 转成可绘制的形状描述。
- **bitmap-mapper.js** — ImageBitmap 缓存映射器，把 bitmap 转成 OffscreenCanvas 并缓存，规避重复创建开销；浏览器支持直绘时跳过转换。
- **utils.js** — 公共工具：`prop`（取配置 + 默认值 + 类型转换）、`colorsToRgb`、`randomInt`、`getOrigin` 等。

## 关键设计决策（读源码前先理解这些）

- **Worker 离屏渲染是核心架构**：`ConfettiCannon` 首次 fire 时调用 `canvas.transferControlToOffscreen()` 把画布控制权一次性、不可逆地移交给 Worker（用 `#initialized` 标志位保证只做一次）。此后所有粒子物理计算与逐帧绘制都在 Worker 线程进行，主线程在动画期间完全空闲，页面不卡顿。
- **动画时长由 `ticks` 而非定时器控制**：每个粒子有 `totalTicks`，每帧 `tick++`，`tick >= totalTicks` 时粒子死亡。所有粒子死光后动画结束。所以 `ticks: 300` ≈ 300 帧 ≈ 5 秒（按 ~60fps）。
- **Worker 是惰性单例**：整个页面生命周期只创建一次 Worker，后续每次发射复用它。`new Worker` 失败（如 CSP 限制）会静默 catch 返回 null，自动走主线程的 `#fireLocal` 降级路径（逻辑相同，但计算压力落在主线程）。
- **Promise 回执协议**：主线程 fire 时生成随机 id 作为"单号"随 postMessage 发给 Worker，监听只认匹配该 id 的回传消息来 resolve Promise。
- **动画进行中再次 fire 只追加粒子**：当 `prom` 非 null（动画运行中），新的 fire 不创建新 Promise/新动画循环，而是 postMessage 追加 options，Worker 端用 `addFettis` 把新粒子并入现有粒子数组，复用同一循环与同一 Promise。

## 注意事项

- `src/confetti.js` 是源码入口（package.json 的 `main`），但发布给浏览器/打包器用的是 `dist/` 下的产物（`module` / `jsdelivr` 字段）。改完源码需 `npm run build` 重新打包。
- 测试依赖 puppeteer 做真实浏览器截图比对，跑测试前会自动 build。
