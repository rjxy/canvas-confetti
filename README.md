# Canvas Confetti

基于 Canvas 的纸屑/彩带动画库。

## 在线演示

[catdad.github.io/canvas-confetti](https://catdad.github.io/canvas-confetti/)

## 本地开发与测试

```bash
npm install
npm run dev
```

启动后访问 `http://localhost:9001` 即可查看所有效果演示。

访问 `http://localhost:9001/test.html` 可使用简洁测试界面：左侧按钮列表选择效果，右侧 canvas 区域展示动画，右上角可切换深色/浅色主题。

> 注意：主题切换仅影响页面背景和 UI 样式，不会修改粒子颜色。粒子颜色始终由各效果函数中的 `colors` 配置决定，与主题无关。

<!-- PLACEHOLDER_REST -->

## 减少动画

并非所有用户都喜欢动画效果。可以通过 `disableForReducedMotion` 选项来尊重用户的 [prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) 系统设置。

## API

通过 CDN 使用时，`confetti` 函数挂载在 `window` 上。通过 npm 安装时，使用 ES Module 导入。

### `confetti([options])` → `Promise|null`

接受一个可选的配置对象，返回 Promise（动画结束时 resolve）。

多次调用 `confetti` 时会复用同一个 canvas，新粒子会叠加到当前动画中。

#### 配置项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `particleCount` | Integer | 50 | 粒子数量 |
| `angle` | Number | 90 | 发射角度（度），90 为正上方 |
| `spread` | Number | 45 | 扩散角度（度） |
| `startVelocity` | Number | 45 | 初始速度（像素） |
| `decay` | Number | 0.9 | 速度衰减系数（0-1） |
| `gravity` | Number | 1 | 重力，1 为正常重力，0 为无重力 |
| `drift` | Number | 0 | 水平漂移，负值向左，正值向右 |
| `flat` | Boolean | false | 关闭 3D 倾斜和摆动效果 |
| `ticks` | Number | 200 | 粒子存活帧数 |
| `origin` | Object | `{x:0.5, y:0.5}` | 发射原点，x/y 范围 0-1 |
| `colors` | Array\<String\> | 彩虹色 | 颜色数组，HEX 格式如 `#bada55` |
| `shapes` | Array | `['square','circle']` | 形状：`square`、`circle`、`star` 或自定义 |
| `scalar` | Number | 1 | 粒子缩放比例 |
| `zIndex` | Integer | 100 | canvas 的 z-index |
| `disableForReducedMotion` | Boolean | false | 为偏好减少动画的用户禁用效果 |

### `confetti.shapeFromPath({ path, matrix? })` → `Shape`

使用 SVG Path 字符串创建自定义形状。

```javascript
const triangle = confetti.shapeFromPath({ path: 'M0 10 L5 0 L10 10z' });
confetti({ shapes: [triangle] });
```

注意事项：
- 路径只支持填充，不支持描边
- 每个路径只能用单一颜色
- 需要浏览器支持 `Path2D`
- `matrix` 可省略（会自动计算，但有性能开销，建议缓存）

### `confetti.shapeFromText({ text, scalar?, color?, fontFamily? })` → `Shape`

用文本（通常是 emoji）创建形状。

```javascript
const scalar = 2;
const pineapple = confetti.shapeFromText({ text: '🍍', scalar });
confetti({ shapes: [pineapple], scalar });
```

参数：
- `text` — 要渲染的文本
- `scalar` — 缩放比例（默认 1），应与 confetti 的 scalar 一致以避免模糊
- `color` — 文本颜色（默认 `#000000`）
- `fontFamily` — 字体（默认使用系统 emoji 字体）

### `confetti.create(canvas, [globalOptions])` → `function`

创建一个绑定到指定 canvas 的 confetti 实例，用于限制动画区域。

```javascript
const myCanvas = document.getElementById('my-canvas');
const myConfetti = confetti.create(myCanvas, { resize: true, useWorker: true });
myConfetti({ particleCount: 100, spread: 160 });
```

全局选项：
- `resize` _(Boolean, 默认 false)_ — 是否自动调整 canvas 尺寸
- `useWorker` _(Boolean, 默认 false)_ — 是否使用 Web Worker 渲染（不阻塞主线程）
- `disableForReducedMotion` _(Boolean, 默认 false)_ — 全局禁用减少动画

**注意：使用 `useWorker: true` 后，canvas 控制权会转移给 Worker，主线程不能再操作该 canvas。**

### `confetti.reset()`

停止动画并清除所有粒子。

```javascript
confetti();
setTimeout(() => confetti.reset(), 100);
```

## 示例

基础发射：

```javascript
confetti();
```

大量粒子：

```javascript
confetti({ particleCount: 150 });
```

全方位扩散：

```javascript
confetti({ spread: 180 });
```

从随机位置发射：

```javascript
confetti({
  particleCount: 100,
  startVelocity: 30,
  spread: 360,
  origin: { x: Math.random(), y: Math.random() - 0.2 }
});
```

两侧持续发射 30 秒：

```javascript
const duration = 30 * 1000;
const end = Date.now() + duration;

(function frame() {
  confetti({ particleCount: 7, angle: 60, spread: 55, origin: { x: 0 } });
  confetti({ particleCount: 7, angle: 120, spread: 55, origin: { x: 1 } });
  if (Date.now() < end) requestAnimationFrame(frame);
}());
```
