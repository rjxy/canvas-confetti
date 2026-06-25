/**
 * 动画循环模块
 * raf: requestAnimationFrame 封装，带帧率限制（~60fps）
 * animate: 驱动粒子动画循环，每帧更新并绘制所有活跃粒子
 */
import { bitmapMapper } from "./bitmap-mapper.js";
import { updateFetti } from "./Particle.js";

// 目标帧间隔：约 16ms（60fps）
const TIME = Math.floor(1000 / 60);
// 存储活跃的 raf ID，用于取消
const frames = {};
// 上一帧的时间戳，用于帧率去重
let lastFrameTime = 0;

/**
 * 帧率受控的 requestAnimationFrame 封装
 * 即使在高刷屏（120Hz/144Hz）上也限制回调频率为 ~60fps
 * 原理：比较当前时间和上次执行时间，间隔不足 TIME 则跳过本帧
 * @param {Function} cb - 满足帧间隔条件后执行的回调
 * @returns {number} 内部 ID，用于 cancel 取消
 */
const frame = (cb) => {
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
};

const cancel = (id) => {
  if (frames[id]) cancelAnimationFrame(frames[id]);
};

export const raf = { frame, cancel };

/**
 * 创建并启动粒子动画循环
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas - 绘制目标
 * @param {Array} fettis - 初始粒子数组（由 randomPhysics 生成）
 * @param {Function} resizer - canvas 尺寸调整函数（setCanvasWindowSize 或 setCanvasRectSize）
 * @param {Object} size - 当前 canvas 尺寸 {width, height}，动画过程中可能被 resize 更新
 * @param {Function} done - 动画结束回调（清理 canvas、移除事件监听等）
 * @param {boolean} isWorker - 是否在 Worker 中运行
 * @param {Object|null} workerSize - Worker 环境下的外部尺寸引用，用于检测 resize
 * @param {Function} promiseFn - Promise 构造器封装
 * @returns {Object} 动画控制对象：{ addFettis, canvas, promise, reset }
 */
export const animate = (
  canvas,
  fettis,
  resizer,
  size,
  done,
  isWorker,
  workerSize,
  promiseFn,
) => {
  let animatingFettis = fettis.slice();
  const context = canvas.getContext("2d");
  let animationFrame;
  let destroy;

  const prom = promiseFn((resolve) => {
    // 动画结束时的清理：清空画布、释放 bitmap 缓存、通知外部
    const onDone = () => {
      animationFrame = destroy = null;
      context.clearRect(0, 0, size.width, size.height);
      bitmapMapper.clear();
      done();
      resolve();
    };

    // 每帧执行：同步 Worker 尺寸 → 清空画布 → 更新并绘制粒子 → 过滤死亡粒子
    const update = () => {
      // Worker 中检测外部尺寸变化并同步到 canvas
      if (
        isWorker &&
        !(size.width === workerSize.width && size.height === workerSize.height)
      ) {
        size.width = canvas.width = workerSize.width;
        size.height = canvas.height = workerSize.height;
      }
      // 尺寸为空时重新测量（首次渲染或 resize 后）
      if (!size.width && !size.height) {
        resizer(canvas);
        size.width = canvas.width;
        size.height = canvas.height;
      }
      context.clearRect(0, 0, size.width, size.height);
      // updateFetti 返回 false 表示粒子已消亡，filter 自动移除
      animatingFettis = animatingFettis.filter((fetti) =>
        updateFetti(context, fetti),
      );
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
    // 追加新粒子到当前动画（多次调用 confetti 时复用同一动画循环）
    addFettis(newFettis) {
      animatingFettis = animatingFettis.concat(newFettis);
      return prom;
    },
    canvas,
    promise: prom,
    reset() {
      if (animationFrame) raf.cancel(animationFrame);
      if (destroy) destroy();
    },
  };
};
