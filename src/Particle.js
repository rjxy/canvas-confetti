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

/**
 * 为单个纸屑粒子生成随机物理参数
 * @param {Object} opts - 发射配置
 * @param {number} opts.x - 粒子起始 x 坐标（canvas 像素）
 * @param {number} opts.y - 粒子起始 y 坐标（canvas 像素）
 * @param {number} opts.startVelocity - 初始速度基准值，实际速度在 [0.5x, 1.5x] 范围内随机
 * @param {number} opts.angle - 发射主方向角度（度），90 为正上方
 * @param {number} opts.spread - 发射扩散角度（度），粒子方向在主方向 ± spread/2 内随机偏移
 * @param {Object} opts.color - 颜色对象 {r, g, b}
 * @param {string|Object} opts.shape - 粒子形状（'circle'、'square' 或自定义形状）
 * @param {number} opts.ticks - 粒子总生命周期帧数，用于计算透明度衰减
 * @param {number} opts.decay - 速度衰减系数（每帧 velocity *= decay），<1 表示减速
 * @param {number} opts.drift - 水平漂移量，正值向右，负值向左
 * @param {number} opts.gravity - 重力加速度（乘以 3 作为实际值），正值向下
 * @param {number} opts.scalar - 粒子缩放系数，影响摆动振幅和绘制大小
 * @param {boolean} opts.flat - 是否为扁平模式（无 3D 翻转和摆动效果）
 * @returns {Object} 粒子的完整物理状态对象
 */
export const randomPhysics = (opts) => ({
  // 初始位置
  x: opts.x,
  y: opts.y,
  // 摆动相关：wobble 为当前摆动相位，wobbleSpeed 控制摆动频率（0.05~0.11）
  wobble: Math.random() * 10,
  wobbleSpeed: Math.min(0.11, Math.random() * 0.1 + 0.05),
  // 实际速度 = 基准速度的 50% + [0, 100%] 随机部分，即最终范围 [50%, 150%]
  velocity: (opts.startVelocity * 0.5) + (Math.random() * opts.startVelocity),
  // 2D 发射角度（弧度）：将角度转为弧度后取反（因为 canvas y 轴向下），再加上 spread 范围内的随机偏移
  angle2D: -(opts.angle * (Math.PI / 180)) + ((0.5 * opts.spread * (Math.PI / 180)) - (Math.random() * opts.spread * (Math.PI / 180))),
  // 3D 翻转角度，初始值在 [0.25π, 0.75π] 之间随机，模拟纸片在空中翻转
  tiltAngle: (Math.random() * (0.75 - 0.25) + 0.25) * Math.PI,
  color: opts.color,
  shape: opts.shape,
  // 动画计时：tick 为当前帧，totalTicks 为总生命帧数，progress = tick/totalTicks 用于透明度渐隐
  tick: 0,
  totalTicks: opts.ticks,
  // 每帧速度衰减系数
  decay: opts.decay,
  // 水平漂移，每帧叠加到 x 位移上
  drift: opts.drift,
  // 随机因子 [2, 3)，用于计算粒子绘制时的抖动偏移量
  random: Math.random() + 2,
  // tiltSin/tiltCos：翻转角的正弦余弦值，用于绘制时模拟 3D 旋转效果
  tiltSin: 0,
  tiltCos: 0,
  // wobbleX/wobbleY：摆动后的实际绘制坐标，由 x/y + scalar * cos/sin(wobble) 计算
  wobbleX: 0,
  wobbleY: 0,
  // 重力值乘以 3 作为每帧 y 方向的加速度增量
  gravity: opts.gravity * 3,
  // 椭圆缩放比，用于 circle 形状绘制时的纵向压缩
  ovalScalar: 0.6,
  // 粒子整体缩放系数
  scalar: opts.scalar,
  // 扁平模式：禁用摆动和翻转，粒子保持固定姿态下落
  flat: opts.flat
});

/**
 * 每帧更新单个纸屑粒子的物理状态并绘制到 canvas 上
 * @param {CanvasRenderingContext2D} context - canvas 2D 绘图上下文
 * @param {Object} fetti - 粒子状态对象（由 randomPhysics 生成，会被就地修改）
 * @returns {boolean} 粒子是否仍存活（tick < totalTicks），false 表示应移除
 */
export const updateFetti = (context, fetti) => {
  // === 物理位移更新 ===
  // x 方向：沿发射角的水平分量 * 当前速度 + 水平漂移
  fetti.x += Math.cos(fetti.angle2D) * fetti.velocity + fetti.drift;
  // y 方向：沿发射角的垂直分量 * 当前速度 + 重力（正值向下）
  fetti.y += Math.sin(fetti.angle2D) * fetti.velocity + fetti.gravity;
  // 速度逐帧衰减，模拟空气阻力
  fetti.velocity *= fetti.decay;

  // === 摆动和翻转更新 ===
  if (fetti.flat) {
    // 扁平模式：无摆动无翻转，固定偏移量绘制
    fetti.wobble = 0;
    fetti.wobbleX = fetti.x + (10 * fetti.scalar);
    fetti.wobbleY = fetti.y + (10 * fetti.scalar);
    fetti.tiltSin = 0;
    fetti.tiltCos = 0;
    fetti.random = 1;
  } else {
    // 正常模式：通过正弦/余弦函数产生左右摆动效果
    fetti.wobble += fetti.wobbleSpeed;
    // wobbleX/Y 是基于摆动相位计算的偏移坐标，幅度为 10 * scalar
    fetti.wobbleX = fetti.x + ((10 * fetti.scalar) * Math.cos(fetti.wobble));
    fetti.wobbleY = fetti.y + ((10 * fetti.scalar) * Math.sin(fetti.wobble));
    // 翻转角匀速递增，模拟纸片在空中旋转翻面
    fetti.tiltAngle += 0.1;
    fetti.tiltSin = Math.sin(fetti.tiltAngle);
    fetti.tiltCos = Math.cos(fetti.tiltAngle);
    // 随机因子每帧刷新，使粒子抖动更自然
    fetti.random = Math.random() + 2;
  }

  // === 生命周期进度与绘制坐标计算 ===
  // progress 从 0 递增到 1，用于控制透明度渐隐（1 - progress）
  const progress = (fetti.tick++) / fetti.totalTicks;
  // (x1, y1) 和 (x2, y2) 是粒子四边形的两组对角顶点
  // 通过 tiltCos/tiltSin 偏移模拟 3D 翻转视觉效果
  const x1 = fetti.x + (fetti.random * fetti.tiltCos);
  const y1 = fetti.y + (fetti.random * fetti.tiltSin);
  const x2 = fetti.wobbleX + (fetti.random * fetti.tiltCos);
  const y2 = fetti.wobbleY + (fetti.random * fetti.tiltSin);

  // === 绘制 ===
  // 填充色带透明度：随 progress 增加逐渐变透明直到消失
  context.fillStyle = 'rgba(' + fetti.color.r + ', ' + fetti.color.g + ', ' + fetti.color.b + ', ' + (1 - progress) + ')';
  context.beginPath();

  if (canUsePaths && fetti.shape.type === 'path' && typeof fetti.shape.path === 'string' && Array.isArray(fetti.shape.matrix)) {
    // 自定义 SVG 路径形状：通过 Path2D 变换矩阵实现缩放和旋转
    context.fill(transformPath2D(
      fetti.shape.path, fetti.shape.matrix,
      fetti.x, fetti.y,
      Math.abs(x2 - x1) * 0.1, Math.abs(y2 - y1) * 0.1,
      Math.PI / 10 * fetti.wobble
    ));
  } else if (fetti.shape.type === 'bitmap') {
    // 位图形状：通过 DOMMatrix 变换实现旋转和缩放，用 createPattern 绘制
    const rotation = Math.PI / 10 * fetti.wobble;
    const scaleX = Math.abs(x2 - x1) * 0.1;
    const scaleY = Math.abs(y2 - y1) * 0.1;
    const width = fetti.shape.bitmap.width * fetti.scalar;
    const height = fetti.shape.bitmap.height * fetti.scalar;

    // 构造 2D 仿射变换矩阵：旋转 + 缩放 + 平移到粒子位置
    const matrix = new DOMMatrix([
      Math.cos(rotation) * scaleX, Math.sin(rotation) * scaleX,
      -Math.sin(rotation) * scaleY, Math.cos(rotation) * scaleY,
      fetti.x, fetti.y
    ]);
    // 叠加形状自身的变换矩阵
    matrix.multiplySelf(new DOMMatrix(fetti.shape.matrix));

    const pattern = context.createPattern(bitmapMapper.transform(fetti.shape.bitmap), 'no-repeat');
    pattern.setTransform(matrix);

    // 位图使用 globalAlpha 控制透明度而非 rgba
    context.globalAlpha = (1 - progress);
    context.fillStyle = pattern;
    context.fillRect(fetti.x - (width / 2), fetti.y - (height / 2), width, height);
    context.globalAlpha = 1;
  } else if (fetti.shape === 'circle') {
    // 圆形/椭圆形：用 ovalScalar 压缩纵轴模拟扁平视角，wobble 控制旋转角
    context.ellipse
      ? context.ellipse(fetti.x, fetti.y, Math.abs(x2 - x1) * fetti.ovalScalar, Math.abs(y2 - y1) * fetti.ovalScalar, Math.PI / 10 * fetti.wobble, 0, 2 * Math.PI)
      : ellipse(context, fetti.x, fetti.y, Math.abs(x2 - x1) * fetti.ovalScalar, Math.abs(y2 - y1) * fetti.ovalScalar, Math.PI / 10 * fetti.wobble, 0, 2 * Math.PI);
  } else if (fetti.shape === 'star') {
    // 五角星：交替连接外径和内径上的顶点（外径 8*scalar，内径 4*scalar）
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
    // 默认矩形/方形：用四个顶点绘制不规则四边形，模拟纸片翻转效果
    context.moveTo(Math.floor(fetti.x), Math.floor(fetti.y));
    context.lineTo(Math.floor(fetti.wobbleX), Math.floor(y1));
    context.lineTo(Math.floor(x2), Math.floor(y2));
    context.lineTo(Math.floor(x1), Math.floor(fetti.wobbleY));
  }

  context.closePath();
  context.fill();
  // 返回粒子是否仍在生命周期内，false 时将被从粒子数组中移除
  return fetti.tick < fetti.totalTicks;
};
