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
| 1 | `confetti.js` | API 入口结构，懒初始化 ConfettiCannon |
| 2 | `utils.js` | 默认参数有哪些，prop 如何提取配置 |
| 3 | `ConfettiCannon.js` | 核心流程：`fire()` 方法串联了 canvas 创建 → 粒子生成 → 动画启动 → Worker 分发 |
| 4 | `Particle.js` | `randomPhysics` 看粒子初始化，`updateFetti` 看每帧物理计算和形状绘制 |
| 5 | `animator.js` | 动画循环如何驱动，帧率控制逻辑 |
| 6 | `shapes.js` | SVG path 如何转为 Path2D，emoji 如何光栅化为 bitmap |
| 7 | `worker.js` | Worker 消息协议，离屏渲染流程 |
| 8 | `bitmap-mapper.js` | 性能优化细节，bitmap 缓存避免重复创建 canvas |

## 核心调用链路

```
confetti(options)
  → getDefaultFire()           // 懒创建 ConfettiCannon 实例
  → ConfettiCannon.fire()      // 主流程入口
    ├── 创建/复用 canvas
    ├── 如果有 Worker:
    │     → worker.postMessage({ options, callback })
    │     → Worker 内: fireLocal() 生成粒子 → animate() 驱动循环
    │     → 动画结束 postMessage 回传 callback
    └── 如果无 Worker (主线程渲染):
          → _fireLocal()        // 生成粒子数组
            → randomPhysics()   // 每个粒子的初始物理参数
          → animate()           // 启动动画循环
            → raf.frame(update) // 每帧执行
              → updateFetti()   // 更新位置 + 绘制到 canvas
```

## Worker 消息协议

| 主线程 → Worker | 说明 |
|----------------|------|
| `{ canvas }` | 初始化：传递 OffscreenCanvas |
| `{ options, callback }` | 发射：传递配置和回调 ID |
| `{ resize: { width, height } }` | 通知 canvas 尺寸变化 |
| `{ reset: true }` | 停止动画并清除粒子 |

| Worker → 主线程 | 说明 |
|----------------|------|
| `{ callback: id }` | 动画结束，通知主线程 resolve Promise |
