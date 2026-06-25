/**
 * Web Worker 入口
 * 在独立线程中运行粒子计算和 OffscreenCanvas 渲染，不阻塞主线程
 * 通过 postMessage 接收配置并在动画结束时回传 callback
 */
import { animate } from './animator.js';
import { randomPhysics } from './Particle.js';
import { prop, onlyPositiveInt, colorsToRgb, randomInt, getOrigin } from './utils.js';

// Worker 内的 OffscreenCanvas 引用（由主线程 transferControlToOffscreen 传入）
let CONFETTI;
// 当前 canvas 尺寸，由主线程 resize 消息更新，animate 循环中检测变化并同步
const SIZE = {};

const setCanvasRectSize = (canvas) => {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
};

const promise = (func) => new Promise(func);

/**
 * Worker 内的本地发射逻辑：解析配置并生成粒子数组
 * 与 ConfettiCannon._fireLocal 逻辑一致，但运行在 Worker 线程中
 */
const fireLocal = (canvas, options, size, done) => {
  const particleCount = prop(options, 'particleCount', onlyPositiveInt);
  const angle = prop(options, 'angle', Number);
  const spread = prop(options, 'spread', Number);
  const startVelocity = prop(options, 'startVelocity', Number);
  const decay = prop(options, 'decay', Number);
  const gravity = prop(options, 'gravity', Number);
  const drift = prop(options, 'drift', Number);
  const colors = prop(options, 'colors', colorsToRgb);
  const ticks = prop(options, 'ticks', Number);
  const shapes = prop(options, 'shapes');
  const scalar = prop(options, 'scalar');
  const flat = !!prop(options, 'flat');
  const origin = getOrigin(options);

  const startX = canvas.width * origin.x;
  const startY = canvas.height * origin.y;
  const fettis = [];
  let temp = particleCount;

  while (temp--) {
    fettis.push(randomPhysics({
      x: startX, y: startY, angle, spread, startVelocity,
      color: colors[temp % colors.length],
      shape: shapes[randomInt(0, shapes.length)],
      ticks, decay, gravity, drift, scalar, flat
    }));
  }

  return { fettis, size };
};

let animationObj;

/**
 * Worker 消息处理器，支持四种消息类型：
 * - options: 发射新粒子（追加到已有动画或创建新动画）
 * - reset: 停止当前动画
 * - resize: 更新 canvas 尺寸（下一帧生效）
 * - canvas: 接收 OffscreenCanvas 引用（初始化时调用一次）
 */
onmessage = (msg) => {
  if (msg.data.options) {
    const canvas = CONFETTI;
    const options = msg.data.options;
    const size = { width: SIZE.width, height: SIZE.height };
    const { fettis } = fireLocal(canvas, options, size, () => {});

    const done = () => { animationObj = null; };

    if (animationObj) {
      // 动画进行中：追加新粒子到当前循环
      animationObj.addFettis(fettis).then(() => {
        if (msg.data.callback) {
          postMessage({ callback: msg.data.callback });
        }
      });
    } else {
      // 启动新动画循环，传入 isWorker=true 和 SIZE 引用以支持动态 resize
      animationObj = animate(canvas, fettis, setCanvasRectSize, size, done, true, SIZE, promise);
      animationObj.promise.then(() => {
        if (msg.data.callback) {
          postMessage({ callback: msg.data.callback });
        }
      });
    }
  } else if (msg.data.reset) {
    if (animationObj) animationObj.reset();
  } else if (msg.data.resize) {
    // 主线程窗口 resize 时同步新尺寸，animate 循环会在下一帧检测并应用
    SIZE.width = msg.data.resize.width;
    SIZE.height = msg.data.resize.height;
  } else if (msg.data.canvas) {
    // 初始化：接收 OffscreenCanvas（transferControlToOffscreen 的结果）
    SIZE.width = msg.data.canvas.width;
    SIZE.height = msg.data.canvas.height;
    CONFETTI = msg.data.canvas;
  }
};
