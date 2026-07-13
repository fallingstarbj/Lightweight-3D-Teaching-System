# 轻量化三维示教系统

面向课堂教学的轻量化三维示教平台 — 支持模型浏览、交互预览、结构标注与教学状态管理。
> 完整使用说明请参阅 [docs/使用说明书.md](docs/使用说明书.md)

## 功能特性

- **本地文件浏览** — 选择文件夹后自动递归扫描模型与贴图文件
- **自动缩略图** — 使用 Three.js 离屏渲染为模型生成 3D 缩略图，贴图自动生成预览图
- **交互式 3D 预览** — 双击模型打开全屏预览，支持旋转/缩放/平移
- **贴图预览** — 支持 JPG、PNG、PSD 等格式，滚轮缩放、拖拽平移
- **多格式支持** — 见下方格式表
- **目录导航** — 面包屑导航、子目录浏览、返回上级
- **搜索与排序** — 按文件名搜索，按名称/大小/修改时间排序
- **网格/列表视图** — 两种浏览模式自由切换
- **缩略图大小调节** — 工具栏滑块缩放网格卡片与列表缩略图
- **外观自定义** — 工具栏可调整强调色与背景色，偏好自动保存
- **资产信息面板** — 显示顶点数、面数、尺寸或贴图分辨率等详细信息
- **打开文件位置** — 在 Windows 资源管理器中定位文件

## 技术栈

- Electron + React + TypeScript
- Three.js（模型加载、缩略图渲染、3D 预览）
- Vite + electron-vite

## 快速开始

```bash
# 安装依赖（首次安装会自动下载 Electron 二进制）
npm install

# 开发模式（启动 Electron 窗口 + 热更新）
npm run dev

# 仅构建
npm run build

# 打包便携版 exe
npm run pack
```

### Electron 安装失败时

若 `npm run dev` 报 `Electron uninstall`，手动执行：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
node node_modules/electron/install.js
```

项目已配置国内镜像（`.npmrc`）和 `postinstall` 自动补装脚本。

## 使用说明

1. 启动应用后点击「选择文件夹」
2. 选择包含 3D 模型或贴图的目录
3. 左侧浏览子目录，中间查看资产网格/列表
4. 单击选中资产，右侧面板查看详细信息
5. 双击或点击「3D 预览 / 查看贴图」进入全屏预览
6. 使用搜索框在整个目录树中按文件名搜索

## 支持格式

### 3D 模型（可预览）

| 格式 | 扩展名 | 说明 |
|------|--------|------|
| glTF | `.gltf` | 支持外部贴图和二进制资源 |
| GLB  | `.glb`  | 二进制 glTF，自包含 |
| OBJ  | `.obj`  | 支持配套 MTL 材质文件 |
| FBX  | `.fbx`  | Autodesk FBX 格式 |
| STL  | `.stl`  | 3D 打印/CAD 常用，仅几何体；默认按 +X 轴朝上加载 |
| 3DS  | `.3ds`  | 3D Studio 格式（3ds Max 可导出） |

### 3D 模型（仅目录浏览）

| 格式 | 扩展名 | 说明 |
|------|--------|------|
| 3ds Max | `.max` | Autodesk 专有二进制格式，**无法直接预览**。请在 3ds Max 中导出为 FBX、GLB 或 OBJ 后查看 |

### 贴图 / 图片

| 格式 | 扩展名 | 说明 |
|------|--------|------|
| JPEG | `.jpg` `.jpeg` | 常用贴图格式 |
| PNG  | `.png`  | 支持透明通道 |
| PSD  | `.psd`  | Photoshop 文件（自动解析合成图） |
| WebP | `.webp` | 现代 Web 图片格式 |
| GIF  | `.gif`  | 动图/贴图 |
| BMP  | `.bmp`  | 位图 |
| TIFF | `.tiff` `.tif` | 高质量贴图 |
| TGA  | `.tga`  | 游戏常用贴图 |
| SVG  | `.svg`  | 矢量图 |
| ICO  | `.ico`  | 图标 |
| EXR  | `.exr`  | HDR 图像 |
| HDR  | `.hdr`  | 环境贴图 |

## 缩略图缓存

缩略图自动缓存在 `%APPDATA%/3d-asset-manager/thumbnails/`，文件修改后会自动重新生成。

## 便携版

打包完成后，便携版位于：

```
release/轻量化三维示教系统-1.0.0-Portable.exe
```

双击即可运行，无需安装。开发调试请使用 `npm run dev`。
