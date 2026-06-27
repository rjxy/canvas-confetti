/**
 * 粒子模块
 * Particle: 封装单个纸屑粒子的物理状态和渲染逻辑
 */
import { bitmapMapper } from './bitmap-mapper.js';

const canUsePaths = typeof Path2D === 'function' && typeof DOMMatrix === 'function';

const transformPath2D = (pathString, pathMatrix, x, y, scaleX, scaleY, rotation) => {
  const path2d = new Path2D(pathString);
  const t1 = new Path2D();
  t1.addPath(path2d, new DOMMatrix(pathMatrix));
  const t2 = new Path2D();
  t2.addPath(t1, new DOMMatrix([
    Math.cos(rotation) * scaleX,
    Math.sin(rotation) * scaleX,
    -Math.sin(rotation) * scaleY,
    Math.cos(rotation) * scaleY,
    x, y
  ]));
  return t2;
};

export const ellipse = (context, x, y, radiusX, radiusY, rotation, startAngle, endAngle, antiClockwise) => {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.scale(radiusX, radiusY);
  context.arc(0, 0, 1, startAngle, endAngle, antiClockwise);
  context.restore();
};

export class Particle {
  constructor(opts) {
    this.x = opts.x;
    this.y = opts.y;
    this.wobble = Math.random() * 10;
    this.wobbleSpeed = Math.min(0.11, Math.random() * 0.1 + 0.05);
    this.velocity = (opts.startVelocity * 0.5) + (Math.random() * opts.startVelocity);
    this.angle2D = -(opts.angle * (Math.PI / 180)) + ((0.5 * opts.spread * (Math.PI / 180)) - (Math.random() * opts.spread * (Math.PI / 180)));
    this.tiltAngle = (Math.random() * (0.75 - 0.25) + 0.25) * Math.PI;
    this.color = opts.color;
    this.shape = opts.shape;
    this.tick = 0;
    this.totalTicks = opts.ticks;
    this.decay = opts.decay;
    this.drift = opts.drift;
    this.random = Math.random() + 2;
    this.tiltSin = 0;
    this.tiltCos = 0;
    this.wobbleX = 0;
    this.wobbleY = 0;
    this.gravity = opts.gravity * 3;
    this.ovalScalar = 0.6;
    this.scalar = opts.scalar;
    this.flat = opts.flat;
  }

  update(context) {
    this.x += Math.cos(this.angle2D) * this.velocity + this.drift;
    this.y += Math.sin(this.angle2D) * this.velocity + this.gravity;
    this.velocity *= this.decay;

    if (this.flat) {
      this.wobble = 0;
      this.wobbleX = this.x + (10 * this.scalar);
      this.wobbleY = this.y + (10 * this.scalar);
      this.tiltSin = 0;
      this.tiltCos = 0;
      this.random = 1;
    } else {
      this.wobble += this.wobbleSpeed;
      this.wobbleX = this.x + ((10 * this.scalar) * Math.cos(this.wobble));
      this.wobbleY = this.y + ((10 * this.scalar) * Math.sin(this.wobble));
      this.tiltAngle += 0.1;
      this.tiltSin = Math.sin(this.tiltAngle);
      this.tiltCos = Math.cos(this.tiltAngle);
      this.random = Math.random() + 2;
    }

    const progress = (this.tick++) / this.totalTicks;
    const x1 = this.x + (this.random * this.tiltCos);
    const y1 = this.y + (this.random * this.tiltSin);
    const x2 = this.wobbleX + (this.random * this.tiltCos);
    const y2 = this.wobbleY + (this.random * this.tiltSin);

    context.fillStyle = 'rgba(' + this.color.r + ', ' + this.color.g + ', ' + this.color.b + ', ' + (1 - progress) + ')';
    context.beginPath();

    if (canUsePaths && this.shape.type === 'path' && typeof this.shape.path === 'string' && Array.isArray(this.shape.matrix)) {
      context.fill(transformPath2D(
        this.shape.path, this.shape.matrix,
        this.x, this.y,
        Math.abs(x2 - x1) * 0.1, Math.abs(y2 - y1) * 0.1,
        Math.PI / 10 * this.wobble
      ));
    } else if (this.shape.type === 'bitmap') {
      const rotation = Math.PI / 10 * this.wobble;
      const scaleX = Math.abs(x2 - x1) * 0.1;
      const scaleY = Math.abs(y2 - y1) * 0.1;
      const width = this.shape.bitmap.width * this.scalar;
      const height = this.shape.bitmap.height * this.scalar;

      const matrix = new DOMMatrix([
        Math.cos(rotation) * scaleX, Math.sin(rotation) * scaleX,
        -Math.sin(rotation) * scaleY, Math.cos(rotation) * scaleY,
        this.x, this.y
      ]);
      matrix.multiplySelf(new DOMMatrix(this.shape.matrix));

      const pattern = context.createPattern(bitmapMapper.transform(this.shape.bitmap), 'no-repeat');
      pattern.setTransform(matrix);

      context.globalAlpha = (1 - progress);
      context.fillStyle = pattern;
      context.fillRect(this.x - (width / 2), this.y - (height / 2), width, height);
      context.globalAlpha = 1;
    } else if (this.shape === 'circle') {
      context.ellipse
        ? context.ellipse(this.x, this.y, Math.abs(x2 - x1) * this.ovalScalar, Math.abs(y2 - y1) * this.ovalScalar, Math.PI / 10 * this.wobble, 0, 2 * Math.PI)
        : ellipse(context, this.x, this.y, Math.abs(x2 - x1) * this.ovalScalar, Math.abs(y2 - y1) * this.ovalScalar, Math.PI / 10 * this.wobble, 0, 2 * Math.PI);
    } else {
      context.moveTo(Math.floor(this.x), Math.floor(this.y));
      context.lineTo(Math.floor(this.wobbleX), Math.floor(y1));
      context.lineTo(Math.floor(x2), Math.floor(y2));
      context.lineTo(Math.floor(x1), Math.floor(this.wobbleY));
    }

    context.closePath();
    context.fill();
    return this.tick < this.totalTicks;
  }
}
