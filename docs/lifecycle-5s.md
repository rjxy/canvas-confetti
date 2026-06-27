# 一次 5 秒纸屑效果的完整生命周期

> 本文以"点击按钮触发一个持续约 5 秒的纸屑效果"为例，串起从点击到页面展示再到结束的全过程，**重点说明 Web Worker 在其中承担的工作**。所有引用均指向当前源码（`src/`）的真实位置。

## 一、为什么是"5 秒"——时长由 ticks 控制，而非定时器

先澄清一个关键点：纸屑效果的持续时间**不是用 `setTimeout` 或任何计时器控制的**，而是由每个粒子的"存活帧数"决定。

页面里典型的触发代码：

```js
button.onclick = () => confetti({ particleCount: 200, ticks: 300 });
```

- `ticks: 300` 表示每个粒子最多存活 300 帧。
- 动画循环被限制在约 60fps（`animator.js:8` 的 `TIME = Math.floor(1000 / 60)`）。
- 于是 300 帧 ÷ 60fps ≈ **5 秒**。

判定逻辑在 `Particle.js:131`：每帧 `tick++`，当 `tick >= totalTicks` 时 `update()` 返回 `false`，该粒子被剔除。所有粒子都死亡后动画自然结束。所以"持续 5 秒"本质是"粒子在第 300 帧前后陆续耗尽"。

## 二、时间轴：点击 → 展示 → 结束

### 第 0 步：点击瞬间（主线程）

`confetti(...)` 进入 `confetti.js:16`。首次调用时懒创建一个全局单例 `ConfettiCannon`，配置为 `{ useWorker: true, resize: true }`（`confetti.js:9-14`）。

### 第 1 步：建立 Worker（仅首次）

`ConfettiCannon` 构造函数中 `this.#worker = this.#createWorker()`（`ConfettiCannon.js:66`），内部 `new Worker(workerUrl)` 启动一条独立线程（`ConfettiCannon.js:76`）。

- **惰性单例**：整个页面生命周期只创建一次 Worker，后续每次点击都复用它。
- **静默降级**：若 `new Worker` 失败（如 CSP 限制），catch 后返回 `null`（`ConfettiCannon.js:79-84`），后续自动走主线程渲染。

### 第 2 步：移交画布控制权（仅首次，不可逆）

`fire()` 中先创建一个全屏、`pointer-events:none`、`position:fixed` 的 canvas 并贴到 `body`（`ConfettiCannon.js:193-195`、`getCanvas` 见 `ConfettiCannon.js:34-42`），然后：

```js
this.#worker.init(this.#canvas);   // ConfettiCannon.js:206
```

`init` 内部执行 `canvas.transferControlToOffscreen()`（`ConfettiCannon.js:136`），把画布转成 `OffscreenCanvas` 并 `postMessage` 给 Worker（连同 transfer 列表）。

> **这是整个架构的核心**：自此刻起，这块画布的像素绘制权完全归 Worker 所有，主线程再也不参与它的渲染。该操作不可逆，因此用 `#initialized` 标志位保证只执行一次（`ConfettiCannon.js:205`、`52`）。

### 第 3 步：发起一次异步通信（Promise 回执协议）

主线程调 `this.#worker.fire(options, size, done)`（`ConfettiCannon.js:248`）。首次发射时 `prom` 为 `null`，于是（`ConfettiCannon.js:105-122`）：

1. 生成一个随机 `id` 作为本次发射的"回执单号"（`ConfettiCannon.js:106`）。
2. 创建 Promise，挂上 `workerDone` 消息监听器，**只认 `callback === id` 的回传**（`ConfettiCannon.js:109`）。
3. `postMessage({ options, callback: id })` 把配置和单号丢给 Worker（`ConfettiCannon.js:118`）。
4. **主线程到此立即返回 Promise**——它没有计算任何粒子，接下来 5 秒的活儿都不在主线程上。

### 第 4 步：Worker 接管全部计算与渲染（独立线程，约 5 秒）

Worker 在 `worker.js:25` 收到消息，进入 `#fireAndNotify`（`worker.js:40`）：

**a) 一次性生成粒子**（`worker.js:59-89` 的 `#createParticles`）
根据 `particleCount` 造出 200 个 `Particle` 对象，每个被赋予随机初速度、发射角、摆动相位、倾斜角等（`Particle.js:34-57`）。**这批对象只在发射时创建一次**，之后 5 秒内不再 new，只更新状态。

**b) 启动动画循环**（`worker.js:50`，`Animation` 实例）
这是 5 秒里持续运转的引擎。每帧 `update()`（`animator.js:61-81`）做三件事：

1. `clearRect` 清空整块画布（`animator.js:74`）。
2. 对每个粒子调 `p.update(context)`：更新物理并绘制（`animator.js:75`）。
3. `filter` 剔除已死亡的粒子（返回 `false` 的）。还有存活粒子就 `raf.frame(update)` 排下一帧，否则 `onDone()` 结束（`animator.js:76-80`）。

单个粒子每帧的物理（`Particle.js:60-62`）：

```js
this.x += Math.cos(this.angle2D) * this.velocity + this.drift;
this.y += Math.sin(this.angle2D) * this.velocity + this.gravity;
this.velocity *= this.decay;          // 速度逐帧衰减
```

透明度随进度衰减 `1 - progress`（`Particle.js:81`、`87`），视觉上就是纸屑喷出 → 受重力下落 → 速度变慢 → 逐渐淡出。

> **这正是用 Worker 的全部意义**：这 300 帧循环、上万次三角函数运算、上万次 canvas 绘制调用，**全部跑在 Worker 线程**。主线程在这 5 秒里完全空闲，页面滚动、点击、其他 JS 都不会卡顿。

### 第 5 步：动画结束，回传单号（约第 5 秒）

当最后一个粒子的 `tick` 也耗尽，`#particles.length === 0`，循环走 `onDone()`（`animator.js:79`），`Animation` 的 Promise resolve，Worker 随即：

```js
postMessage({ callback });   // worker.js:54
```

把当初的 `id` 原样回传。主线程的 `workerDone` 匹配到该 `id`（`ConfettiCannon.js:109`），执行清理（`ConfettiCannon.js:110-115`）：移除监听器、`prom = null`、`bitmapMapper.clear()`、调 `done()`（把全屏 canvas 从 DOM 移除，见 `ConfettiCannon.js:227-240`），最后 resolve 你最初拿到的那个 Promise。

至此 `confetti()` 返回的 Promise 兑现，5 秒效果完整收尾。

## 三、主线程 vs Worker 的职责划分

| 阶段 | 主线程 | Worker 线程 |
|------|--------|------------|
| 点击 | 解析配置、创建全屏 canvas | — |
| 移交 | `transferControlToOffscreen` | 接收 OffscreenCanvas |
| 通信 | 发 `postMessage` + 单号，立即返回 Promise | — |
| **5 秒动画** | **空闲（不卡顿）** | **造粒子 + 约 300 帧物理计算 + 逐帧绘制** |
| 结束 | 收到单号 → 清理 DOM → resolve Promise | 算完最后一帧 → 回传单号 |

**一句话：Worker 干的是这 5 秒里 99% 的脏活累活（粒子物理模拟 + 逐帧渲染）；主线程只在头尾做了"下单"和"收货"两个动作。**

## 四、两个重要补充

### 5 秒内再次点击：只追加粒子，不开新循环

若动画进行中再次 `fire`，此时 `prom` 非 `null`（`ConfettiCannon.js:100`），主线程不创建新 Promise，只 `postMessage({ options })` 追加配置并复用同一 Promise（`ConfettiCannon.js:100-103`）。Worker 端 `#fireAndNotify` 检测到 `this.#animation` 已存在，用 `addFettis` 把新粒子并入现有粒子数组（`worker.js:44-46`、`animator.js:96-99`），**复用同一动画循环**，不会启动第二个循环。

### 降级路径：无 Worker 时主线程兜底

若 `#worker` 为 `null`（创建失败或浏览器不支持 OffscreenCanvas），`fire()` 走 `#fireLocal`（`ConfettiCannon.js:145-180`）。它用同样的逻辑生成粒子、`new Animation(...)` 驱动循环——**功能完全一致**，区别仅在于这 5 秒的计算压力落在主线程，可能影响页面流畅度。

## 五、关键文件速查

| 文件 | 在本流程中的角色 |
|------|----------------|
| `confetti.js` | 入口，懒创建全局 `ConfettiCannon` 单例 |
| `ConfettiCannon.js` | 协调者：建 canvas/Worker、移交画布、postMessage 回执协议、清理 |
| `worker.js` | Worker 入口：接收配置、造粒子、驱动离屏渲染、回传 callback |
| `animator.js` | 动画循环引擎：`raf` 帧率限制 + `Animation` 逐帧 update/绘制/剔除 |
| `Particle.js` | 单个粒子的物理状态与每帧绘制，`tick` 计数决定存活 |
| `bitmap-mapper.js` | bitmap → OffscreenCanvas 缓存，动画结束时 `clear()` |
