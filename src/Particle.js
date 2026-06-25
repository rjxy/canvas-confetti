/**
 * 粒子物理模块
 * randomPhysics: 根据配置生成单个粒子的初始物理状态
 * updateFetti: 每帧更新粒子位置并绘制到 canvas 上下文
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

export const randomPhysics = (opts) => ({
  x: opts.x,
  y: opts.y,
  wobble: Math.random() * 10,
  wobbleSpeed: Math.min(0.11, Math.random() * 0.1 + 0.05),
  velocity: (opts.startVelocity * 0.5) + (Math.random() * opts.startVelocity),
  angle2D: -(opts.angle * (Math.PI / 180)) + ((0.5 * opts.spread * (Math.PI / 180)) - (Math.random() * opts.spread * (Math.PI / 180))),
  tiltAngle: (Math.random() * (0.75 - 0.25) + 0.25) * Math.PI,
  color: opts.color,
  shape: opts.shape,
  tick: 0,
  totalTicks: opts.ticks,
  decay: opts.decay,
  drift: opts.drift,
  random: Math.random() + 2,
  tiltSin: 0,
  tiltCos: 0,
  wobbleX: 0,
  wobbleY: 0,
  gravity: opts.gravity * 3,
  ovalScalar: 0.6,
  scalar: opts.scalar,
  flat: opts.flat
});

export const updateFetti = (context, fetti) => {
  fetti.x += Math.cos(fetti.angle2D) * fetti.velocity + fetti.drift;
  fetti.y += Math.sin(fetti.angle2D) * fetti.velocity + fetti.gravity;
  fetti.velocity *= fetti.decay;

  if (fetti.flat) {
    fetti.wobble = 0;
    fetti.wobbleX = fetti.x + (10 * fetti.scalar);
    fetti.wobbleY = fetti.y + (10 * fetti.scalar);
    fetti.tiltSin = 0;
    fetti.tiltCos = 0;
    fetti.random = 1;
  } else {
    fetti.wobble += fetti.wobbleSpeed;
    fetti.wobbleX = fetti.x + ((10 * fetti.scalar) * Math.cos(fetti.wobble));
    fetti.wobbleY = fetti.y + ((10 * fetti.scalar) * Math.sin(fetti.wobble));
    fetti.tiltAngle += 0.1;
    fetti.tiltSin = Math.sin(fetti.tiltAngle);
    fetti.tiltCos = Math.cos(fetti.tiltAngle);
    fetti.random = Math.random() + 2;
  }

  const progress = (fetti.tick++) / fetti.totalTicks;
  const x1 = fetti.x + (fetti.random * fetti.tiltCos);
  const y1 = fetti.y + (fetti.random * fetti.tiltSin);
  const x2 = fetti.wobbleX + (fetti.random * fetti.tiltCos);
  const y2 = fetti.wobbleY + (fetti.random * fetti.tiltSin);

  context.fillStyle = 'rgba(' + fetti.color.r + ', ' + fetti.color.g + ', ' + fetti.color.b + ', ' + (1 - progress) + ')';
  context.beginPath();

  if (canUsePaths && fetti.shape.type === 'path' && typeof fetti.shape.path === 'string' && Array.isArray(fetti.shape.matrix)) {
    context.fill(transformPath2D(
      fetti.shape.path, fetti.shape.matrix,
      fetti.x, fetti.y,
      Math.abs(x2 - x1) * 0.1, Math.abs(y2 - y1) * 0.1,
      Math.PI / 10 * fetti.wobble
    ));
  } else if (fetti.shape.type === 'bitmap') {
    const rotation = Math.PI / 10 * fetti.wobble;
    const scaleX = Math.abs(x2 - x1) * 0.1;
    const scaleY = Math.abs(y2 - y1) * 0.1;
    const width = fetti.shape.bitmap.width * fetti.scalar;
    const height = fetti.shape.bitmap.height * fetti.scalar;

    const matrix = new DOMMatrix([
      Math.cos(rotation) * scaleX, Math.sin(rotation) * scaleX,
      -Math.sin(rotation) * scaleY, Math.cos(rotation) * scaleY,
      fetti.x, fetti.y
    ]);
    matrix.multiplySelf(new DOMMatrix(fetti.shape.matrix));

    const pattern = context.createPattern(bitmapMapper.transform(fetti.shape.bitmap), 'no-repeat');
    pattern.setTransform(matrix);

    context.globalAlpha = (1 - progress);
    context.fillStyle = pattern;
    context.fillRect(fetti.x - (width / 2), fetti.y - (height / 2), width, height);
    context.globalAlpha = 1;
  } else if (fetti.shape === 'circle') {
    context.ellipse
      ? context.ellipse(fetti.x, fetti.y, Math.abs(x2 - x1) * fetti.ovalScalar, Math.abs(y2 - y1) * fetti.ovalScalar, Math.PI / 10 * fetti.wobble, 0, 2 * Math.PI)
      : ellipse(context, fetti.x, fetti.y, Math.abs(x2 - x1) * fetti.ovalScalar, Math.abs(y2 - y1) * fetti.ovalScalar, Math.PI / 10 * fetti.wobble, 0, 2 * Math.PI);
  } else if (fetti.shape === 'star') {
    let rot = Math.PI / 2 * 3;
    const innerRadius = 4 * fetti.scalar;
    const outerRadius = 8 * fetti.scalar;
    let sx = fetti.x, sy = fetti.y;
    let spikes = 5;
    const step = Math.PI / spikes;
    while (spikes--) {
      sx = fetti.x + Math.cos(rot) * outerRadius;
      sy = fetti.y + Math.sin(rot) * outerRadius;
      context.lineTo(sx, sy);
      rot += step;
      sx = fetti.x + Math.cos(rot) * innerRadius;
      sy = fetti.y + Math.sin(rot) * innerRadius;
      context.lineTo(sx, sy);
      rot += step;
    }
  } else {
    context.moveTo(Math.floor(fetti.x), Math.floor(fetti.y));
    context.lineTo(Math.floor(fetti.wobbleX), Math.floor(y1));
    context.lineTo(Math.floor(x2), Math.floor(y2));
    context.lineTo(Math.floor(x1), Math.floor(fetti.wobbleY));
  }

  context.closePath();
  context.fill();
  return fetti.tick < fetti.totalTicks;
};
