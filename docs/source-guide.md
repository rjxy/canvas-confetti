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
  → getDefaultFire()              // 懒创建 ConfettiCannon 单例 (confetti.js:8)
  → ConfettiCannon.fire()         // 主流程入口 (ConfettiCannon.js:183)
    ├── 创建/复用全屏 canvas
    ├── 首次发射: worker.init(canvas)  // transferControlToOffscreen 移交画布
    ├── 如果有 Worker:
    │     → worker.fire(options, size, done)   // ConfettiCannon.js:243
    │       → postMessage({ options, callback: id })
    │     → Worker 内 (worker.js):
    │         → #createParticles()  // 生成粒子数组 (worker.js:59)
    │         → new Animation(...)  // 驱动离屏渲染循环 (worker.js:50)
    │       → 动画结束 postMessage({ callback }) 回传，主线程 resolve Promise
    └── 如果无 Worker (主线程渲染):
          → #fireLocal()           // ConfettiCannon.js:143，生成粒子数组
            → new Particle(...)     // 每个粒子的初始物理参数 (ConfettiCannon.js:164)
          → new Animation(...)      // 启动动画循环 (ConfettiCannon.js:176)
            → raf.frame(update)     // 每帧执行 (animator.js:109)
              → particle.update(ctx) // 更新位置 + 绘制到 canvas (Particle.js:86)
```

> 说明：源码已重构为 class + 私有字段（`#`）风格。`ConfettiCannon` 是发射器类，`Animation` 是动画循环类，`Particle` 是粒子类；动画时长由粒子的 `ticks`（存活帧数）控制，而非定时器。

## 一帧中发生了什么

这一套动画可以拆成三个对象的分工：`Particle` 是粒子模型，保存单个粒子的状态；`Animation` 是帧循环调度器，负责每帧遍历所有粒子；`ConfettiCannon`/`worker.js` 负责在一次发射开始时批量创建粒子。

### 1. 帧循环从 `Animation` 开始

`Animation` 构造函数会先拿到 canvas 的 2D 上下文，并把传入的粒子数组复制到自己的私有字段里（`animator.js:69-72`）：

```js
this.#canvas = canvas;
this.#context = canvas.getContext("2d");
this.#particles = particles.slice();
```

随后定义内部的 `update` 函数，并用 `raf.frame(update)` 排入浏览器下一帧（`animator.js:87-109`）。这个 `update` 不是单个粒子的 `update`，而是整个动画系统的一帧：

```js
const update = () => {
  this.#context.clearRect(0, 0, this.#size.width, this.#size.height);
  this.#particles = this.#particles.filter((p) => p.update(this.#context));

  if (this.#particles.length) {
    this.#animationFrame = raf.frame(update);
  } else {
    onDone();
  }
};

this.#animationFrame = raf.frame(update);
```

一帧的顺序是：

1. 必要时同步 canvas 尺寸，Worker 模式下尤其要处理主线程传来的 resize 数据（`animator.js:88-99`）。
2. `clearRect(...)` 清空上一帧的整张画布（`animator.js:100`）。canvas 不是每个粒子一层，而是每帧重画整张图。
3. 遍历当前活跃粒子数组，逐个调用 `p.update(this.#context)`（`animator.js:101`）。
4. `Particle.update()` 返回 `true` 的粒子会留在数组里，返回 `false` 的粒子会被 `filter` 剔除。
5. 如果剔除后还有粒子，继续 `raf.frame(update)` 预约下一帧（`animator.js:102-103`）。
6. 如果没有粒子了，调用 `onDone()` 做收尾（`animator.js:104-105`）。

### 2. 单个 `Particle.update()` 在这一帧内做什么

`Particle` 可以理解为一个纯 JS 粒子模型：它不是 DOM 元素，也不是单独的 canvas，而是保存当前位置、速度、方向、颜色、形状、生命周期等状态的对象。构造函数只建立初始状态，真正的运动和绘制发生在每一帧的 `update(context)`（`Particle.js:86`）。

第一步是根据速度、方向、漂移和重力更新位置（`Particle.js:87-92`）：

```js
this.x += Math.cos(this.angle2D) * this.velocity + this.drift;
this.y += Math.sin(this.angle2D) * this.velocity + this.gravity;
this.velocity *= this.decay;
```

这里的含义是：

- `angle2D` 决定粒子往哪个方向飞。
- `velocity` 决定这一帧飞多远。
- `drift` 给 x 方向追加水平偏移。
- `gravity` 给 y 方向追加下落趋势。
- `decay` 让速度逐帧变小，所以粒子会从快速喷出逐渐慢下来。

第二步是更新纸片的摆动、倾斜和形变参考点（`Particle.js:94-120`）。普通模式下会推进 `wobble` 和 `tiltAngle`，再得到 `wobbleX/wobbleY`、`tiltSin/tiltCos` 等值；这些值不改变粒子的“中心点”本质，而是用来让纸片看起来在空中翻转、摇摆。

第三步是推进生命周期，并计算透明度（`Particle.js:113-123`）：

```js
const progress = (this.tick++) / this.totalTicks;
context.fillStyle = 'rgba(' + this.color.r + ', ' + this.color.g + ', ' + this.color.b + ', ' + (1 - progress) + ')';
```

`tick` 表示已经经历了多少帧，`totalTicks` 表示最多存活多少帧。`progress` 越接近 `1`，`1 - progress` 越接近 `0`，粒子就越透明。

第四步是根据形状选择具体的 canvas 绘制方式（`Particle.js:126-167`）：

- 自定义 SVG path：用 `transformPath2D(...)` 按当前粒子位置、缩放和旋转生成临时 `Path2D`，再 `context.fill(...)`。
- bitmap/emoji：用 `createPattern(...)` 创建 pattern，设置变换矩阵后 `fillRect(...)`。
- `circle`：调用 `context.ellipse(...)` 或兼容函数画椭圆。
- 默认纸片：用 `moveTo/lineTo` 画一个会随摆动和倾斜变形的四边形。

最后统一 `closePath()` 并 `fill()`，把当前粒子的这一帧画到共享 canvas 上（`Particle.js:169-173`）：

```js
context.closePath();
context.fill();
return this.tick < this.totalTicks;
```

这个返回值是粒子的存活信号：还没到 `totalTicks` 就返回 `true`，到期后返回 `false`。

### 3. 粒子在哪里创建

粒子的创建不在 `Particle.update()` 中。`update()` 只负责“更新自己 + 绘制自己 + 返回是否存活”。粒子是在一次 `fire` 开始时批量创建的。

Worker 模式下，主线程把 options 发送给 Worker，Worker 在 `#createParticles(options)` 中创建粒子（`worker.js:59-88`）：

```js
const particles = [];
let temp = particleCount;

while (temp--) {
  particles.push(new Particle({
    x: startX, y: startY, angle, spread, startVelocity,
    color: colors[temp % colors.length],
    shape: shapes[randomInt(0, shapes.length)],
    ticks, decay, gravity, drift, scalar, flat
  }));
}
```

主线程降级模式下，`ConfettiCannon.#fireLocal()` 做同样的事情（`ConfettiCannon.js:143-170`）。区别只是执行线程不同：Worker 模式在 Worker 中 new 粒子并离屏绘制，降级模式在主线程 new 粒子并直接绘制。

创建时每个粒子都会拿到同一个发射点：

```js
const startX = this.#canvas.width * origin.x;
const startY = this.#canvas.height * origin.y;
```

Worker 里对应 `worker.js:74-75`，主线程降级路径里对应 `ConfettiCannon.js:158-159`。后续每个粒子会因为构造函数里的随机速度、随机角度、随机摆动相位而分散开。

如果动画已经在运行中再次触发发射，不会新开一个帧循环，而是把新粒子追加进现有 `Animation` 的粒子数组（`animator.js:122-124`）：

```js
addFettis(newParticles) {
  this.#particles = this.#particles.concat(newParticles);
  return this.#promise;
}
```

### 4. 粒子如何消失

粒子没有显式调用 `delete`，也没有从 canvas 上单独擦掉某一个粒子。它的消失分两层：

第一层是视觉消失。每一帧开始时，`Animation.update` 都会 `clearRect(...)` 清空整张 canvas（`animator.js:100`），然后只重画仍然存活的粒子。因此某个粒子一旦不再参与下一帧绘制，它自然就不会再出现在画布上。

第二层是数据消失。`Particle.update()` 最后一行返回：

```js
return this.tick < this.totalTicks;
```

当 `tick >= totalTicks` 时返回 `false`，外层这句 `filter` 就不会把它保留到新的 `#particles` 数组里（`animator.js:101`）：

```js
this.#particles = this.#particles.filter((p) => p.update(this.#context));
```

所以“删除粒子”的真实位置是 `Animation` 的 `filter`。`Particle.update()` 只给出生死判断；`Animation` 根据这个判断把死亡粒子从活跃数组里剔除。之后这个对象如果没有其他引用，就交给 JS 垃圾回收。

当最后一个粒子也被剔除后，`this.#particles.length` 变成 `0`，动画进入 `onDone()`（`animator.js:104-105`）。`onDone()` 会清空 canvas、清理 bitmap 缓存、调用外部传入的 `done()`，并 resolve 这次动画的 Promise（`animator.js:79-84`）。默认全屏 canvas 的 DOM 移除发生在 `ConfettiCannon.fire()` 里定义的 `done` 回调中（`ConfettiCannon.js:223-235`）。

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
- `docs/request-animation-frame.md` — 解释 `requestAnimationFrame` 的参数、返回值、取消方式，以及本项目的 60fps 限帧封装。
