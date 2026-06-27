# 源码阅读指南

## 文件结构

```
src/
├── confetti.js          # 主入口，导出 confetti 函数及 create/shapeFromPath/shapeFromText
├── ConfettiCannon.js    # 发射器类，管理 canvas、Worker、发射与重置逻辑
├── Particle.js          # 粒子物理（初始状态生成 + 每帧位置更新与绘制）
├── animator.js          # requestAnimationFrame 封装 + 动画循环驱动
├── worker.js            # Web Worker 入口，在独立线程中渲染动画
├── shapes.js            # 自定义形状：SVG path 转换 / emoji 文本光栅化
├── utils.js             # 默认配置、参数提取、颜色转换等工具函数
└── bitmap-mapper.js     # ImageBitmap → OffscreenCanvas 缓存映射
```

## 推荐阅读顺序

| 顺序 | 文件 | 关注点 |
|------|------|--------|
| 1 | `confetti.js` | API 入口结构，懒初始化 ConfettiCannon 单例 |
| 2 | `utils.js` | 默认参数有哪些，`prop` 如何提取配置 |
| 3 | `ConfettiCannon.js` | 核心流程：`fire()` 方法串联了 canvas 创建 → Worker 移交 → 发射分发；`#fireLocal()` 为主线程兜底 |
| 4 | `Particle.js` | `Particle` 构造函数看粒子初始化（随机物理参数），`update()` 看每帧物理计算和形状绘制 |
| 5 | `animator.js` | `Animation` 类如何驱动动画循环，`raf` 帧率控制逻辑 |
| 6 | `shapes.js` | SVG path 如何转为 Path2D，emoji 如何光栅化为 bitmap |
| 7 | `worker.js` | Worker 消息协议，离屏渲染流程 |
| 8 | `bitmap-mapper.js` | 性能优化细节，bitmap 缓存避免重复创建 canvas |

## 核心调用链路

```
confetti(options)
  → getDefaultFire()              // 懒创建 ConfettiCannon 单例 (confetti.js:9)
  → ConfettiCannon.fire()         // 主流程入口 (ConfettiCannon.js:187)
    ├── 创建/复用全屏 canvas
    ├── 首次发射: worker.init(canvas)  // transferControlToOffscreen 移交画布
    ├── 如果有 Worker:
    │     → worker.fire(options, size, done)   // ConfettiCannon.js:248
    │       → postMessage({ options, callback: id })
    │     → Worker 内 (worker.js):
    │         → #createParticles()  // 生成粒子数组
    │         → new Animation(...)  // 驱动离屏渲染循环
    │       → 动画结束 postMessage({ callback }) 回传，主线程 resolve Promise
    └── 如果无 Worker (主线程渲染):
          → #fireLocal()           // ConfettiCannon.js:145，生成粒子数组
            → new Particle(...)     // 每个粒子的初始物理参数 (Particle.js:34)
          → new Animation(...)      // 启动动画循环 (animator.js:31)
            → raf.frame(update)     // 每帧执行 (animator.js:77)
              → particle.update(ctx) // 更新位置 + 绘制到 canvas (Particle.js:59)
```

> 说明：源码已重构为 class + 私有字段（`#`）风格。`ConfettiCannon` 是发射器类，`Animation` 是动画循环类，`Particle` 是粒子类；动画时长由粒子的 `ticks`（存活帧数）控制，而非定时器。

## Worker 消息协议

| 主线程 → Worker | 说明 |
|----------------|------|
| `{ canvas }` | 初始化：传递 OffscreenCanvas（`worker.init` → `transferControlToOffscreen`） |
| `{ options, callback }` | 发射：传递配置和回调 ID |
| `{ options }` | 动画进行中追加粒子（无 callback，复用现有循环） |
| `{ resize: { width, height } }` | 通知 canvas 尺寸变化 |
| `{ reset: true }` | 停止动画并清除粒子 |

| Worker → 主线程 | 说明 |
|----------------|------|
| `{ callback: id }` | 动画结束，通知主线程 resolve 对应 Promise |

## 延伸阅读

- `docs/lifecycle-5s.md` — 以"持续 5 秒的效果"为例，逐步拆解从点击到展示的运行时全过程，重点讲 Worker 的工作。
