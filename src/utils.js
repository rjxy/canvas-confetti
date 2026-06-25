/**
 * 工具函数与默认配置
 * 包含颜色转换、参数提取、默认值等基础功能
 */
export const defaults = {
  particleCount: 50,
  angle: 90,
  spread: 45,
  startVelocity: 45,
  decay: 0.9,
  gravity: 1,
  drift: 0,
  ticks: 200,
  x: 0.5,
  y: 0.5,
  shapes: ['square', 'circle'],
  zIndex: 100,
  colors: [
    '#26ccff', '#a25afd', '#ff5e7e', '#88ff5a',
    '#fcff42', '#ffa62d', '#ff36ff'
  ],
  disableForReducedMotion: false,
  scalar: 1
};

export const convert = (val, transform) => transform ? transform(val) : val;

export const isOk = (val) => !(val === null || val === undefined);

export const prop = (options, name, transform) =>
  convert(options && isOk(options[name]) ? options[name] : defaults[name], transform);

export const onlyPositiveInt = (number) => number < 0 ? 0 : Math.floor(number);

export const randomInt = (min, max) => Math.floor(Math.random() * (max - min)) + min;

const toDecimal = (str) => parseInt(str, 16);

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

export const getOrigin = (options) => {
  const origin = prop(options, 'origin', Object);
  origin.x = prop(origin, 'x', Number);
  origin.y = prop(origin, 'y', Number);
  return origin;
};
