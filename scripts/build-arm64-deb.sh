#!/bin/bash
# 在 WSL2（Ubuntu）里运行此脚本，打出 ARM64 的 deb 安装包
set -e

echo "=========================================="
echo "  啄木鸟自动勾选浏览器 - ARM64 deb 打包脚本"
echo "=========================================="

# 检查是否在 WSL/Linux 环境
if [[ "$(uname -s)" != "Linux" ]]; then
  echo "错误：请在 WSL2 的 Ubuntu 终端里运行此脚本"
  exit 1
fi

# 安装 deb 打包所需系统工具（首次运行需要）
if ! command -v dpkg &>/dev/null || ! command -v fakeroot &>/dev/null; then
  echo ">> 安装打包工具 dpkg、fakeroot ..."
  sudo apt-get update -qq
  sudo apt-get install -y dpkg fakeroot
fi

# 检查 Node.js
if ! command -v node &>/dev/null; then
  echo ""
  echo "未检测到 Node.js，请先安装（复制下面命令执行）："
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "  sudo apt-get install -y nodejs"
  exit 1
fi

echo ">> Node.js: $(node -v)"
echo ">> npm:     $(npm -v)"
echo ">> 架构:    $(uname -m)（electron-builder 会自动下载 ARM64 版 Electron）"
echo ""

# 进入项目根目录（脚本在 scripts/ 下）
cd "$(dirname "$0")/.."
PROJECT_DIR="$(pwd)"
echo ">> 项目目录: $PROJECT_DIR"
echo ""

# 安装依赖
if [[ ! -d node_modules ]]; then
  echo ">> 首次运行，安装 npm 依赖（约 2～5 分钟）..."
  npm install
else
  echo ">> 依赖已存在，跳过 npm install"
fi

echo ""
echo ">> 同步图标（从 woodpecker.png 生成 build/icons）..."
npm run icons:sync

echo ""
echo ">> 开始打包 ARM64 deb（约 3～10 分钟，视网速而定）..."
npm run pack:arm64

echo ""
echo "=========================================="
echo "  打包完成！"
echo "  安装包位置: $PROJECT_DIR/dist/"
echo "=========================================="
ls -lh dist/*.deb 2>/dev/null || ls -lh dist/
