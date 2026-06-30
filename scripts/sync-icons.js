const fs = require('fs');
const path = require('path');

const sizes = [16, 32, 48, 64, 128, 256, 512];
const projectRoot = path.join(__dirname, '..');
const src = path.join(projectRoot, 'woodpecker.png');
const destDir = path.join(projectRoot, 'build', 'icons');

if (!fs.existsSync(src)) {
  console.error('错误：找不到 woodpecker.png，请放在项目根目录');
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });

for (const size of sizes) {
  fs.copyFileSync(src, path.join(destDir, `${size}x${size}.png`));
}

console.log(`已从 woodpecker.png 同步 ${sizes.length} 个尺寸到 build/icons/`);
