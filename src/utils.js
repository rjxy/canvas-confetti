/**
 * 工具函数与默认配置
 * 包含颜色转换、参数提取、默认值等基础功能
 */

// 所有 confetti 配置项的默认值，prop() 函数在用户未指定时回退到这里
export const defaults = {
  particleCount: 50,
  angle: 90,
  spread: 45,
  startVelocity: 45,
  decay: 0.9,
  gravity: 1,
  drift: 0,
  // 默认例子存活是200 tick, 按照60fps, 每秒60 tick, 这批例子(一个动画)大约存活200/60 ≈ 3.33秒
  ticks: 200,
  x: 0.5,
  y: 0.5,
  shapes: ['square', 'circle'],
  zIndex: 100,
  colors: [
    '#26ccff', '#a25afd', '#ff5e7e', '#88ff5a',
    '#fcff42', '#ffa62d', '#ff36ff'
  ],
  scalar: 1
};

// 对值应用可选的变换函数（如 Number、Boolean）
export const convert = (val, transform) => transform ? transform(val) : val;

export const isOk = (val) => !(val === null || val === undefined);

/**
 * 从 options 中提取指定配置项，未提供时使用 defaults 中的默认值
 * 可选的 transform 用于类型转换（如 Number 确保为数值、colorsToRgb 转换颜色数组）
 */
export const prop = (options, name, transform) =>
  convert(options && isOk(options[name]) ? options[name] : defaults[name], transform);

export const onlyPositiveInt = (number) => number < 0 ? 0 : Math.floor(number);

// 生成 [min, max) 范围内的随机整数
export const randomInt = (min, max) => Math.floor(Math.random() * (max - min)) + min;

const toDecimal = (str) => parseInt(str, 16);

// 将 HEX 颜色字符串（支持 3 位和 6 位）转为 {r, g, b} 对象
export const hexToRgb = (str) => {
  let val = String(str).replace(/[^0-9a-f]/gi, '');
  if (val.length < 6) {
    val = val[0] + val[0] + val[1] + val[1] + val[2] + val[2];
  }
  return {
    r: toDecimal(val.substring(0, 2)),
    g: toDecimal(val.substring(2, 4)),
    b: toDecimal(val.substring(4, 6))
  };
};

export const colorsToRgb = (colors) => colors.map(hexToRgb);

// 提取并规范化发射原点，确保 x/y 为数值（范围 0-1，表示 canvas 中的相对位置）
export const getOrigin = (options) => {
  const origin = prop(options, 'origin', Object);
  origin.x = prop(origin, 'x', Number);
  origin.y = prop(origin, 'y', Number);
  return origin;
};
