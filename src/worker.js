/**
 * Web Worker 入口
 * 在独立线程中运行粒子计算和 OffscreenCanvas 渲染，不阻塞主线程
 * 通过 postMessage 接收配置并在动画结束时回传 callback
 */
import { animate } from './animator.js';
import { randomPhysics } from './Particle.js';
import { prop, onlyPositiveInt, colorsToRgb, randomInt, getOrigin } from './utils.js';

let CONFETTI;
const SIZE = {};

const setCanvasRectSize = (canvas) => {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
};

const promise = (func) => new Promise(func);

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

onmessage = (msg) => {
  if (msg.data.options) {
    const canvas = CONFETTI;
    const options = msg.data.options;
    const size = { width: SIZE.width, height: SIZE.height };
    const { fettis } = fireLocal(canvas, options, size, () => {});

    const done = () => { animationObj = null; };

    if (animationObj) {
      animationObj.addFettis(fettis).then(() => {
        if (msg.data.callback) {
          postMessage({ callback: msg.data.callback });
        }
      });
    } else {
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
    SIZE.width = msg.data.resize.width;
    SIZE.height = msg.data.resize.height;
  } else if (msg.data.canvas) {
    SIZE.width = msg.data.canvas.width;
    SIZE.height = msg.data.canvas.height;
    CONFETTI = msg.data.canvas;
  }
};
