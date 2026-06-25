/**
 * canvas-confetti 主入口
 * 导出 confetti 函数及 create/shapeFromPath/shapeFromText 方法
 */
import { ConfettiCannon } from './ConfettiCannon.js';
import { shapeFromPath, shapeFromText } from './shapes.js';

let defaultFire;
const getDefaultFire = () => {
  if (!defaultFire) {
    defaultFire = new ConfettiCannon(null, { useWorker: true, resize: true });
  }
  return defaultFire;
};

const confetti = (...args) => getDefaultFire().fire(...args);

confetti.reset = () => getDefaultFire().reset();

confetti.create = (canvas, opts) => {
  const cannon = new ConfettiCannon(canvas, opts);
  const fire = (...args) => cannon.fire(...args);
  fire.reset = () => cannon.reset();
  return fire;
};

confetti.shapeFromPath = shapeFromPath;
confetti.shapeFromText = shapeFromText;

export default confetti;
