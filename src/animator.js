/**
 * 动画循环模块
 * raf: requestAnimationFrame 封装，带帧率限制（~60fps）
 * animate: 驱动粒子动画循环，每帧更新并绘制所有活跃粒子
 */
import { bitmapMapper } from './bitmap-mapper.js';
import { updateFetti } from './Particle.js';

const TIME = Math.floor(1000 / 60);
const frames = {};
let lastFrameTime = 0;

const hasRaf = typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function';

const frame = hasRaf
  ? (cb) => {
      const id = Math.random();
      frames[id] = requestAnimationFrame(function onFrame(time) {
        if (lastFrameTime === time || lastFrameTime + TIME - 1 < time) {
          lastFrameTime = time;
          delete frames[id];
          cb();
        } else {
          frames[id] = requestAnimationFrame(onFrame);
        }
      });
      return id;
    }
  : (cb) => setTimeout(cb, TIME);

const cancel = hasRaf
  ? (id) => { if (frames[id]) cancelAnimationFrame(frames[id]); }
  : (timer) => clearTimeout(timer);

export const raf = { frame, cancel };

export const animate = (canvas, fettis, resizer, size, done, isWorker, workerSize, promiseFn) => {
  let animatingFettis = fettis.slice();
  const context = canvas.getContext('2d');
  let animationFrame;
  let destroy;

  const prom = promiseFn((resolve) => {
    const onDone = () => {
      animationFrame = destroy = null;
      context.clearRect(0, 0, size.width, size.height);
      bitmapMapper.clear();
      done();
      resolve();
    };

    const update = () => {
      if (isWorker && !(size.width === workerSize.width && size.height === workerSize.height)) {
        size.width = canvas.width = workerSize.width;
        size.height = canvas.height = workerSize.height;
      }
      if (!size.width && !size.height) {
        resizer(canvas);
        size.width = canvas.width;
        size.height = canvas.height;
      }
      context.clearRect(0, 0, size.width, size.height);
      animatingFettis = animatingFettis.filter((fetti) => updateFetti(context, fetti));
      if (animatingFettis.length) {
        animationFrame = raf.frame(update);
      } else {
        onDone();
      }
    };

    animationFrame = raf.frame(update);
    destroy = onDone;
  });

  return {
    addFettis(newFettis) {
      animatingFettis = animatingFettis.concat(newFettis);
      return prom;
    },
    canvas,
    promise: prom,
    reset() {
      if (animationFrame) raf.cancel(animationFrame);
      if (destroy) destroy();
    }
  };
};
