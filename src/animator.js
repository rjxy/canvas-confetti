/**
 * 动画循环模块
 * raf: requestAnimationFrame 封装，带帧率限制（~60fps）
 * Animation: 驱动粒子动画循环，每帧更新并绘制所有活跃粒子
 */
import { bitmapMapper } from "./bitmap-mapper.js";

const TIME = Math.floor(1000 / 60);
const frames = {};
let lastFrameTime = 0;

export const raf = {
  frame(cb) {
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
  },
  cancel(id) {
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
