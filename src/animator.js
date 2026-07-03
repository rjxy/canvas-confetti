/**
 * 动画循环模块
 * raf: requestAnimationFrame 封装，带帧率限制（~60fps）
 * Animation: 驱动粒子动画循环，每帧更新并绘制所有活跃粒子
 */
import { bitmapMapper } from "./bitmap-mapper.js";

// 每帧的目标间隔。requestAnimationFrame 的回调时间单位是毫秒，
// 1000 / 60 约等于 16.67ms，这里向下取整后配合下面的判断把动画限制在约 60fps。
const TIME = Math.floor(1000 / 60);

// 存储当前还没执行完成的动画帧。
// key 是 raf.frame() 返回给调用方的自定义 id，value 是浏览器原生 requestAnimationFrame 返回的 handle。
// 由于限帧逻辑可能会连续预约下一次 requestAnimationFrame，同一个自定义 id 对应的原生 handle 会被不断更新，
// 这样 raf.cancel(id) 始终可以取消最新预约的那一帧。
const frames = {};

// 上一次真正执行业务回调的帧时间戳。
// requestAnimationFrame 会把当前绘制周期的时间戳传给回调；多个回调可能拿到同一个 time。
// 这个值用于判断距离上一次执行是否已经过了足够的帧间隔，从而避免浏览器高刷新率屏幕上跑得过快。
let lastFrameTime = 0;

export const raf = {
  frame(cb) {
    // 对外暴露一个轻量 id，而不是直接暴露 requestAnimationFrame 的 handle。
    // 因为内部可能因为限帧而重新预约多次原生 rAF，需要用稳定 id 把这些预约串起来。
    const id = Math.random();

    function onFrame(time) {
      // 满足下面任一条件时才真正执行调用方回调：
      // 1. lastFrameTime === time：同一个浏览器绘制周期内的多个动画回调应一起放行，
      //    避免同一帧里只有第一个回调执行、后续回调被无意义地推迟。
      // 2. lastFrameTime + TIME - 1 < time：距离上一帧已接近 16ms，允许进入下一帧。
      //    `- 1` 给时间戳取整和浏览器调度抖动留一点余量。
      if (lastFrameTime === time || lastFrameTime + TIME - 1 < time) {
        lastFrameTime = time;

        // 回调即将执行，这个自定义 id 不再代表一个待取消的原生 rAF。
        delete frames[id];
        cb();
      } else {
        // 浏览器刷新率可能高于 60Hz，例如 120Hz 会更频繁触发 rAF。
        // 如果还没到目标帧间隔，就继续预约下一次浏览器帧，但保持同一个自定义 id。
        frames[id] = requestAnimationFrame(onFrame);
      }
    }

    frames[id] = requestAnimationFrame(onFrame);

    return id;
  },
  cancel(id) {
    // 这里只取消仍处于“已预约但尚未执行”状态的浏览器 rAF。
    // 如果对应回调已经执行，frames[id] 会在执行前被删除，此时 cancel 是无操作。
    if (frames[id]) cancelAnimationFrame(frames[id]);
  }
};

export class Animation {
  #canvas;
  #context;
  #particles;
  #resizer;
  #size;
  #isWorker;
  #workerSize;
  #animationFrame = null;
  #destroy = null;
  #promise;

  constructor(canvas, particles, resizer, size, done, isWorker, workerSize, promiseFn) {
    this.#canvas = canvas;
    this.#context = canvas.getContext("2d");
    this.#particles = particles.slice();
    this.#resizer = resizer;
    this.#size = size;
    this.#isWorker = isWorker;
    this.#workerSize = workerSize;

    this.#promise = promiseFn((resolve) => {
      const onDone = () => {
        this.#animationFrame = this.#destroy = null;
        this.#context.clearRect(0, 0, this.#size.width, this.#size.height);
        bitmapMapper.clear();
        done();
        resolve();
      };

      const update = () => {
        if (
          this.#isWorker &&
          !(this.#size.width === this.#workerSize.width && this.#size.height === this.#workerSize.height)
        ) {
          this.#size.width = this.#canvas.width = this.#workerSize.width;
          this.#size.height = this.#canvas.height = this.#workerSize.height;
        }
        if (!this.#size.width && !this.#size.height) {
          this.#resizer(this.#canvas);
          this.#size.width = this.#canvas.width;
          this.#size.height = this.#canvas.height;
        }
        // 清除当前 canvas 画布上的全部已绘制像素
        this.#context.clearRect(0, 0, this.#size.width, this.#size.height);
        this.#particles = this.#particles.filter((p) => p.update(this.#context));
        if (this.#particles.length) {
          this.#animationFrame = raf.frame(update);
        } else {
          onDone();
        }
      };

      this.#animationFrame = raf.frame(update);
      this.#destroy = onDone;
    });
  }

  get canvas() {
    return this.#canvas;
  }

  get promise() {
    return this.#promise;
  }

  addFettis(newParticles) {
    this.#particles = this.#particles.concat(newParticles);
    return this.#promise;
  }

  reset() {
    if (this.#animationFrame) raf.cancel(this.#animationFrame);
    if (this.#destroy) this.#destroy();
  }
}
