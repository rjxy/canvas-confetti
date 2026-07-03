# requestAnimationFrame 详解

本文结合当前项目的 `src/animator.js`，说明浏览器原生 `requestAnimationFrame` 的作用、参数、返回值，以及本项目为什么在它外面封装了一层 `raf.frame()`。

## 一、`requestAnimationFrame` 是什么

`requestAnimationFrame`，通常简称 `rAF`，是浏览器提供的动画调度 API。它的作用不是立刻执行函数，而是告诉浏览器：**请在下一次准备绘制页面之前执行这个回调**。

基础用法：

```js
requestAnimationFrame((time) => {
  // 在浏览器下一帧绘制前执行
});
```

它适合做动画，因为浏览器会把 rAF 回调安排在自己的渲染节奏里执行。相比 `setTimeout(fn, 16)`，rAF 更贴近浏览器真实绘制时机，也更容易在页面不可见时被浏览器降频或暂停，从而减少无意义计算。

在当前项目中，粒子动画不是用 `setInterval` 或 `setTimeout` 驱动的，而是用 `requestAnimationFrame` 一帧一帧推进。封装入口在 `src/animator.js:22` 的 `raf.frame(cb)`。

## 二、参数：传入一个回调函数

原生 API 只有一个参数：回调函数。

```js
const handle = requestAnimationFrame(function onFrame(time) {
  // time 由浏览器传入
});
```

这个回调不会在 `requestAnimationFrame(...)` 调用时同步执行。调用它只是在浏览器里登记一次“下一帧前执行”的任务。

执行顺序可以理解为：

```text
requestAnimationFrame(onFrame)
  -> 当前 JS 调用栈继续执行并结束
  -> 浏览器进入下一次绘制周期
  -> 浏览器调用 onFrame(time)
  -> onFrame 中执行业务动画逻辑
```

所以在项目里这句：

```js
this.#animationFrame = raf.frame(update);
```

对应 `src/animator.js:110`，含义不是立刻执行 `update()`，而是预约下一帧。真正执行 `update()` 的地方是 `raf.frame` 内部的 `cb()`，对应 `src/animator.js:39`。

## 三、回调参数 `time` 是什么

`requestAnimationFrame` 会给回调传入一个 `time`：

```js
requestAnimationFrame((time) => {
  console.log(time);
});
```

这个 `time` 是当前动画帧的高精度时间戳，单位是毫秒。它和 `performance.now()` 使用相近的时间基准，可以理解为“页面生命周期内走到当前绘制帧时的时间”。

本项目在 `src/animator.js:28` 接收这个参数：

```js
function onFrame(time) {
  ...
}
```

它主要用于限帧。不同设备的屏幕刷新率不同：

- 60Hz 屏幕大约每 16.67ms 触发一次 rAF。
- 120Hz 屏幕大约每 8.33ms 触发一次 rAF。
- 144Hz 屏幕大约每 6.94ms 触发一次 rAF。

如果每次 rAF 都更新粒子，那么高刷新率屏幕上的粒子会跑得更快。当前项目希望粒子运动接近 60fps，所以用 `time` 判断距离上一次真正执行是否已经接近 16ms。

## 四、返回值：一个可取消的 handle

原生 `requestAnimationFrame` 会返回一个整数 handle：

```js
const handle = requestAnimationFrame(onFrame);
```

这个 handle 可以交给 `cancelAnimationFrame`，取消还没执行的那次回调：

```js
cancelAnimationFrame(handle);
```

注意：只能取消“已经预约但尚未执行”的回调。如果回调已经开始执行，取消就没有意义了。

项目没有直接把原生 handle 暴露出去，而是在 `raf.frame(cb)` 里生成了一个自定义 id（`src/animator.js:26`）：

```js
const id = Math.random();
frames[id] = requestAnimationFrame(onFrame);
return id;
```

原因是项目有一层限帧逻辑：如果当前 rAF 来得太早，就会继续预约下一次 rAF：

```js
frames[id] = requestAnimationFrame(onFrame);
```

对应 `src/animator.js:43`。同一个业务帧可能会经历多次原生 rAF 预约，所以需要一个稳定的自定义 id，让 `raf.cancel(id)` 始终可以取消最新那次预约。

## 五、项目里的 `raf.frame(cb)` 做了什么

当前封装的核心代码在 `src/animator.js:22-56`：

```js
const TIME = Math.floor(1000 / 60);
const frames = {};
let lastFrameTime = 0;

export const raf = {
  frame(cb) {
    const id = Math.random();

    function onFrame(time) {
      if (lastFrameTime === time || lastFrameTime + TIME - 1 < time) {
        lastFrameTime = time;
        delete frames[id];
        cb();
      } else {
        frames[id] = requestAnimationFrame(onFrame);
      }
    }

    frames[id] = requestAnimationFrame(onFrame);
    return id;
  },
  cancel(id) {
    if (frames[id]) cancelAnimationFrame(frames[id]);
  }
};
```

这层封装做了四件事：

1. 用 `requestAnimationFrame(onFrame)` 预约下一次浏览器帧。
2. 用 `time` 和 `lastFrameTime` 控制业务回调接近 60fps。
3. 如果当前浏览器帧太早，就重新预约下一帧，而不是立刻执行粒子计算。
4. 返回自定义 id，方便 `raf.cancel(id)` 取消当前还没执行的预约。

## 六、`lastFrameTime === time` 的意义

限帧判断里有两个条件：

```js
if (lastFrameTime === time || lastFrameTime + TIME - 1 < time) {
  ...
}
```

第二个条件更直观：

```js
lastFrameTime + TIME - 1 < time
```

它表示距离上一次真正执行业务回调已经接近 16ms，可以执行下一帧。

第一个条件：

```js
lastFrameTime === time
```

用于处理同一个浏览器绘制周期内的多个 rAF 回调。浏览器在同一帧中可能执行多个 rAF callback，它们拿到的 `time` 是一样的。

假设页面里同时有两个动画实例 A 和 B：

```text
浏览器绘制帧 time = 1000

执行 A 的 rAF：
  距离上一帧已超过 16ms
  lastFrameTime = 1000
  A.update()

执行 B 的 rAF：
  B 拿到的 time 也是 1000
  lastFrameTime === time 成立
  B.update()
```

如果没有 `lastFrameTime === time`，B 会因为 `lastFrameTime` 已经被 A 更新成 1000 而被错误推迟到下一次浏览器帧。这个条件的目的就是让同一个浏览器绘制周期里的多个动画回调都能一起执行。

## 七、`Animation` 如何用它驱动粒子

`Animation` 内部定义了一个 `update` 函数（`src/animator.js:88-108`）：

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
```

这个 `update` 是一次完整的动画帧：

1. 清空上一帧 canvas。
2. 遍历活跃粒子。
3. 调用每个 `Particle.update(context)` 更新物理状态并绘制当前粒子。
4. 用 `filter` 剔除生命周期结束的粒子。
5. 如果还有粒子，继续 `raf.frame(update)` 预约下一帧。
6. 如果没有粒子，进入 `onDone()` 清理并 resolve Promise。

因此，`raf.frame(update)` 和 `update()` 的关系是：

```text
raf.frame(update)
  -> 预约浏览器下一帧
  -> 到达合适的 rAF 时间点
  -> 执行 cb()
  -> cb 就是 update
  -> update 内部更新并绘制所有粒子
  -> 如果还有粒子，再次 raf.frame(update)
```

## 八、Worker 模式下 rAF 在哪里执行

默认 `confetti()` 使用 Worker。主线程先创建 DOM canvas，再通过 `transferControlToOffscreen()` 把绘图控制权转移给 Worker。之后 Worker 创建 `Animation`，并在 Worker 内部执行 `raf.frame(update)`。

也就是说，默认路径下：

```text
主线程：
  创建 canvas
  把 OffscreenCanvas 交给 Worker
  等待动画结束 callback

Worker：
  创建 Particle
  创建 Animation
  requestAnimationFrame 驱动每帧 update
  每帧计算粒子物理属性
  每帧绘制 OffscreenCanvas
```

主线程不会每帧把 `update` 发给 Worker。Worker 收到一次发射消息后，后续帧循环由 Worker 自己通过 `requestAnimationFrame` 推进。

## 九、和 `setTimeout` / `setInterval` 的区别

如果用 `setInterval(update, 16)`，代码会按固定时间间隔尽量执行，但它不知道浏览器什么时候真正绘制页面。浏览器忙碌、标签页隐藏、设备刷新率变化时，定时器和实际渲染节奏可能错开。

`requestAnimationFrame` 的优势是：

- 在浏览器准备绘制前执行，动画状态和渲染节奏更一致。
- 页面隐藏时浏览器通常会降频或暂停，减少后台计算。
- 多个动画回调可以在同一个绘制周期内统一调度。
- 更适合 canvas、DOM transform、WebGL 这类视觉更新。

这个项目仍然额外做了 60fps 限帧，是因为 rAF 默认跟随设备刷新率，而粒子的生命周期用 `ticks` 计帧。如果不限制，高刷新率设备上同样的 `ticks` 会更快耗尽，动画时长会变短。
