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
    // 当前粒子的中心点坐标；初始值来自发射原点。
    this.x = opts.x;
    this.y = opts.y;

    // 摆动相位和摆动速度，用来制造纸片左右摇摆的动态效果。
    this.wobble = Math.random() * 10;
    this.wobbleSpeed = Math.min(0.11, Math.random() * 0.1 + 0.05);

    // 初速度带随机扰动，避免同一批粒子沿完全相同的轨迹运动。
    this.velocity = (opts.startVelocity * 0.5) + (Math.random() * opts.startVelocity);

    // 发射方向，angle 是主方向，spread 决定围绕主方向的随机扩散范围。
    this.angle2D = -(opts.angle * (Math.PI / 180)) + ((0.5 * opts.spread * (Math.PI / 180)) - (Math.random() * opts.spread * (Math.PI / 180)));

    // 纸片倾斜角度，用来配合 tiltSin/tiltCos 计算四边形的翻转感。
    this.tiltAngle = (Math.random() * (0.75 - 0.25) + 0.25) * Math.PI;

    // 外观配置：颜色和形状由发射参数生成时分配给每个粒子。
    this.color = opts.color;
    this.shape = opts.shape;

    // 生命周期计数：tick 每帧递增，达到 totalTicks 后粒子死亡。
    this.tick = 0;
    this.totalTicks = opts.ticks;

    // 物理参数：速度衰减、水平漂移和重力下落。
    this.decay = opts.decay;
    this.drift = opts.drift;

    // 每帧用于计算纸片形变的随机因子，非 flat 模式下会持续变化。
    this.random = Math.random() + 2;

    // 倾斜角的正弦/余弦缓存，每帧由 tiltAngle 更新。
    this.tiltSin = 0;
    this.tiltCos = 0;

    // 摆动后的辅助点坐标，用来决定纸片当前帧的宽高和四个顶点。
    this.wobbleX = 0;
    this.wobbleY = 0;

    // 重力放大后参与 y 方向位移，让粒子逐渐向下坠落。
    this.gravity = opts.gravity * 3;

    // 圆形粒子的纵横缩放系数，让圆形在运动中呈现椭圆翻转效果。
    this.ovalScalar = 0.6;

    // 整体尺寸缩放；flat 为 true 时关闭摆动和随机翻转。
    this.scalar = opts.scalar;
    this.flat = opts.flat;
  }

  update(context) {
    // 1. 按当前方向和速度推进位置，drift 控制水平偏移，gravity 控制下落。
    this.x += Math.cos(this.angle2D) * this.velocity + this.drift;
    this.y += Math.sin(this.angle2D) * this.velocity + this.gravity;

    // 2. 速度逐帧衰减，让粒子从快速喷出逐渐慢下来。
    this.velocity *= this.decay;

    if (this.flat) {
      // flat 模式固定形变参数，粒子不再摇摆和翻转。
      this.wobble = 0;
      this.wobbleX = this.x + (10 * this.scalar);
      this.wobbleY = this.y + (10 * this.scalar);
      this.tiltSin = 0;
      this.tiltCos = 0;
      this.random = 1;
    } else {
      // 3. 普通模式更新摆动和倾斜，让纸片每帧产生飘动感。
      this.wobble += this.wobbleSpeed;
      this.wobbleX = this.x + ((10 * this.scalar) * Math.cos(this.wobble));
      this.wobbleY = this.y + ((10 * this.scalar) * Math.sin(this.wobble));
      this.tiltAngle += 0.1;
      this.tiltSin = Math.sin(this.tiltAngle);
      this.tiltCos = Math.cos(this.tiltAngle);
      this.random = Math.random() + 2;
    }

    // 4. progress 决定透明度；tick 在这里递增，控制粒子生命周期。
    const progress = (this.tick++) / this.totalTicks;

    // 5. 根据当前位置、摆动点和倾斜值计算当前帧的绘制参考点。
    const x1 = this.x + (this.random * this.tiltCos);
    const y1 = this.y + (this.random * this.tiltSin);
    const x2 = this.wobbleX + (this.random * this.tiltCos);
    const y2 = this.wobbleY + (this.random * this.tiltSin);

    // 6. 粒子越接近生命周期末尾越透明。
    context.fillStyle = 'rgba(' + this.color.r + ', ' + this.color.g + ', ' + this.color.b + ', ' + (1 - progress) + ')';
    context.beginPath();

    if (canUsePaths && this.shape.type === 'path' && typeof this.shape.path === 'string' && Array.isArray(this.shape.matrix)) {
      // 自定义 SVG path：按当前粒子位置、缩放和旋转生成临时 Path2D 后填充。
      context.fill(transformPath2D(
        this.shape.path, this.shape.matrix,
        this.x, this.y,
        Math.abs(x2 - x1) * 0.1, Math.abs(y2 - y1) * 0.1,
        Math.PI / 10 * this.wobble
      ));
    } else if (this.shape.type === 'bitmap') {
      // bitmap/emoji：通过带变换矩阵的 pattern 绘制到当前粒子位置。
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
      // 圆形粒子：用当前参考点距离模拟翻转时的椭圆压缩。
      context.ellipse
        ? context.ellipse(this.x, this.y, Math.abs(x2 - x1) * this.ovalScalar, Math.abs(y2 - y1) * this.ovalScalar, Math.PI / 10 * this.wobble, 0, 2 * Math.PI)
        : ellipse(context, this.x, this.y, Math.abs(x2 - x1) * this.ovalScalar, Math.abs(y2 - y1) * this.ovalScalar, Math.PI / 10 * this.wobble, 0, 2 * Math.PI);
    } else {
      // 默认纸片：用四个点画出一个随 wobble/tilt 变形的四边形。
      context.moveTo(Math.floor(this.x), Math.floor(this.y));
      context.lineTo(Math.floor(this.wobbleX), Math.floor(y1));
      context.lineTo(Math.floor(x2), Math.floor(y2));
      context.lineTo(Math.floor(x1), Math.floor(this.wobbleY));
    }

    context.closePath();

    // 7. 将当前路径填充到共享 canvas；返回值表示粒子是否继续存活。
    context.fill();
    return this.tick < this.totalTicks;
  }
}
