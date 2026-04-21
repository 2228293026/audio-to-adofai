# Audio to ADOFAI Converter / 音频转ADOFAI转换器

A modern TypeScript-based converter that transforms 4K rhythm game charts and audio files into ADOFAI (A Dance of Fire and Ice) format.

一个基于TypeScript的现代转换器，可将4K节奏游戏谱面和音频文件转换为ADOFAI（A Dance of Fire and Ice）格式。

## Features / 功能特点

### 4K Chart Converter / 4K谱面转换
- Import 4K charts (Malody format) and convert to ADOFAI
- 导入4K谱面（Malody格式）并转换为ADOFAI
- Three encoding modes:
  - **Smart**: Dynamically chooses between straight lines and polygon angles based on note density
  - **Hybrid Angle**: Prioritizes angle data with optional Twirl and Pause events
  - **Speed Only**: Pure straight path with BPM events for maximum timing accuracy
- 三种编码模式：
  - **Smart（智能）**：根据音符密度动态选择直线或多边形角度
  - **Hybrid Angle（混合角度）**：优先使用角度数据，支持Twirl和Pause事件
  - **Speed Only（仅速度）**：纯直线路径，使用BPM事件确保最大时间精度
- Three chord handling modes:
  - **Merge**: Combine simultaneous notes into one tile
  - **Split**: Expand chords into sequential tiles with spacing
  - **Force Single**: Ignore all but the first note in each chord
- 三种和弦处理模式：
  - **Merge（合并）**：同时的音符合并为单个方块
  - **Split（分离）**：将和弦展开为有间距的连续方块
  - **Force Single（强制单音符）**：仅使用每个和弦的第一个音符

### Audio to ADOFAI / 音频转ADOFAI（新功能！）
- Upload any audio file (MP3, WAV, etc.)
- 上传任意音频文件（MP3、WAV等）
- Automatic beat detection using Web Audio API
- 使用Web Audio API自动检测节拍
- Generate 4K notes from detected beats
- 从检测到的节拍生成4K音符
- Apply full ADOFAI encoding pipeline
- 应用完整的ADOFAI编码流程
- Multiple note generation strategies:
  - Single Track (all beats to column 0)
  - Alternating (cycles through columns 0-3)
  - Random (random column assignment)
  - Pattern 4 (fixed 0,1,2,3 pattern)
- 多种音符生成策略：
  - 单轨道（所有节拍到第0列）
  - 交替（在0-3列间循环）
  - 随机（随机列分配）
  - 模式4（固定的0,1,2,3循环）

### Additional Features / 其他功能
- Style profile support for smart encoding customization
- 智能编码自定义支持样式配置文件
- Manual offset adjustment
- 手动偏移调整
- BPM change preservation
- BPM变化保留
- Export to .adofai format
- 导出为.adofai格式
- Modern React UI with Vite
- 基于Vite的现代React界面

## Tech Stack / 技术栈

- **Frontend / 前端**: React 19 + TypeScript + Vite
- **State Management / 状态管理**: React hooks (useState, useCallback)
- **Audio Processing / 音频处理**: Web Audio API
- **Build Tool / 构建工具**: Vite 6

## Getting Started / 快速开始

### Prerequisites / 前置要求
- Node.js 18+
- npm 或 yarn

### Installation / 安装

```bash
# Install dependencies / 安装依赖
npm install

# Start development server / 启动开发服务器
npm run dev

# Build for production / 构建生产版本
npm run build

# Preview production build / 预览生产构建
npm run preview
```

### Usage / 使用方法

1. 在浏览器中打开应用（默认：http://localhost:3000）
2. 选择以下任一功能：
   - **4K Chart Converter**: 上传4K JSON/TXT文件并配置选项
   - **Audio to ADOFAI**: 上传音频文件，选择音符生成策略，然后转换
3. 点击转换按钮
4. 下载您的.adofai文件

1. Open the application in your browser (default: http://localhost:3000)
2. Choose either:
   - **4K Chart Converter**: Upload a 4K JSON/TXT file and configure options
   - **Audio to ADOFAI**: Upload an audio file, select note generation strategy, and convert
3. Click the conversion button
4. Download your .adofai file

## Project Structure / 项目结构

```
src/
├── App.tsx                 # Main application component / 主应用组件
├── main.tsx               # React entry point / React入口
├── vite-env.d.ts          # Vite type declarations / Vite类型声明
├── components/            # UI components / UI组件
│   ├── FileUploader.tsx   # 4K file upload component / 4K文件上传组件
│   ├── AudioUploader.tsx  # Audio file upload with preview / 音频上传与预览
│   ├── ConverterForm.tsx  # Conversion options form / 转换选项表单
│   └── ResultDisplay.tsx  # Result display and download / 结果显示与下载
├── lib/
│   ├── converter/         # 4K to ADOFAI conversion logic / 转换逻辑
│   │   ├── types.ts       # TypeScript interfaces / TypeScript接口
│   │   ├── timing.ts      # Timing segment reconstruction / 时间线段重建
│   │   ├── notes.ts       # Note extraction and grouping / 音符提取与分组
│   │   ├── timeline.ts    # Timeline building / 时间线构建
│   │   ├── utils.ts       # Shared utilities / 共享工具
│   │   ├── encoders/      # Encoding modes / 编码模式
│   │   │   ├── speedOnly.ts
│   │   │   ├── hybridAngle.ts
│   │   │   └── smart.ts
│   │   └── index.ts       # Main conversion entry point / 主转换入口
│   ├── audio/             # Audio processing / 音频处理
│   │   ├── beatDetector.ts  # Beat detection algorithm / 节拍检测算法
│   │   ├── noteGenerator.ts # Generate notes from beats / 从节拍生成音符
│   │   └── index.ts
│   └── audioToAdofai.ts   # Audio-to-ADOFAI pipeline / 音频转ADOFAI流程
└── styles/
    └── main.css          # Global styles / 全局样式
```

## Conversion Pipeline / 转换流程

### 4K Chart Path / 4K谱面路径
1. Load 4K JSON file / 加载4K JSON文件
2. Build timing segments from BPM events / 从BPM事件构建时间线段
3. Extract and group notes / 提取和分组音符
4. Build timeline with chord handling / 构建带和弦处理的时间线
5. Apply encoding mode (speed_only, hybrid_angle, smart) / 应用编码模式
6. Generate ADOFAI JSON / 生成ADOFAI JSON
7. Download file / 下载文件

### Audio Path / 音频路径
1. Upload audio file / 上传音频文件
2. Decode with Web Audio API / 使用Web Audio API解码
3. Detect beats using energy-based onset detection / 使用能量基起始检测检测节拍
4. Estimate BPM / 估算BPM
5. Generate 4K note structure from beats / 从节拍生成4K音符结构
6. Apply same 4K→ADOFAI conversion pipeline / 应用相同的4K→ADOFAI转换流程
7. Download file / 下载文件

## Configuration Options / 配置选项

### Encoding Modes / 编码模式

| Mode | Path | Angle Data | Events |
|------|------|------------|--------|
| `smart` | Dynamic | Dynamic based on density | SetSpeed, Twirl |
| `hybrid_angle` | N/A (angle-based) | Primary representation | SetSpeed, Pause, Twirl |
| `speed_only` | Straight (`R`*N) | None | SetSpeed |

| 模式 | 路径 | 角度数据 | 事件 |
|------|------|------------|--------|
| `smart` | 动态 | 基于密度的动态 | SetSpeed, Twirl |
| `hybrid_angle` | 不适用（基于角度） | 主要表示 | SetSpeed, Pause, Twirl |
| `speed_only` | 直线（`R`*N） | 无 | SetSpeed |

### Chord Modes / 和弦模式

| Mode | Description |
|------|-------------|
| `merge` | Combine notes at same time into one tile |
| `force_single` | Use only first note from each chord |
| `split` | Separate chords with spacing |

| 模式 | 描述 |
|------|-------------|
| `merge` | 同时的音符合并为单个方块 |
| `force_single` | 仅使用每个和弦的第一个音符 |
| `split` | 将和弦以间距分开 |

### Checkboxes / 复选框

- **Include releases**: Convert hold note releases to hits / 将长音释放转换为点击
- **Enable Twirl**: Insert Twirl events when angles exceed 180° / 角度超过180°时插入Twirl事件
- **Simulate chord angles**: Spread chords across multiple angles (simulate multi-key) / 将和弦分散到多个角度（模拟多键）
- **Preserve BPM changes**: Keep original BPM events from source chart / 保留源谱面的BPM事件

## Audio-specific Options / 音频特定选项

- **Detection Detail (暴力值)**: Controls beat detection aggressiveness (1-10)
  - Lower (1-3): Faster, fewer false positives / 更快，较少误报
  - Medium (4-7): Balanced / 平衡
  - High (8-10): Extremely aggressive, catches everything! / 极其激进，捕捉所有声音！

- **Base BPM (optional)**: Leave at 0 to auto-detect, or set manually if detection confidence is low
  - 留0自动检测，或在检测置信度低时手动设置

- **Note Generation Strategy**: Determines how beats are mapped to 4K columns / 决定节拍如何映射到4K列
  - Single Track / 单轨道
  - Alternating / 交替
  - Random / 随机
  - Pattern 4 / 模式4

## Notes / 注意事项

- This is a browser-based application; all conversion happens client-side / 这是一个基于浏览器的应用，所有转换都在客户端进行
- Large audio files may take time to process; be patient / 大型音频文件可能需要时间处理，请耐心等待
- Beat detection accuracy depends on audio quality and genre / 节拍检测精度取决于音频质量和类型
- Adjustable thresholds for smart encoding available via style profile JSON / 可通过样式配置文件JSON调整智能编码阈值

## Style Profile JSON / 样式配置文件

Customize smart encoding behavior / 自定义智能编码行为：

```json
{
  "name": "custom",
  "straightDenseThresholdMs": 140,
  "sparseAngleThresholdMs": 190,
  "canonicalDegrees": [180, 120, 90, 60, 45, 135],
  "chordAngleDeg": 22.5,
  "twirlThresholdDeg": 202.5,
  "useTwirl": true,
  "bpmPalette": []
}
```

## Browser Support / 浏览器支持

- Chrome (recommended) / 推荐
- Firefox
- Edge
- Safari (may have limited Audio API support) / 音频API支持可能有限

## License / 许可证

MIT License / MIT许可证

Copyright (c) 2025

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

本软件按"原样"提供，不包含任何形式的保证，包括但不限于对适销性、特定用途适用性和非侵权性的默示保证。作者或版权持有人不对任何索赔、损害或其他责任承担责任，无论是基于合同、侵权还是其他理由。

## Credits / 致谢

Original Python implementation: 4K to ADOFAI Converter (main.py). / 原始Python实现：4K to ADOFAI Converter (main.py)。

This is a complete TypeScript rewrite with additional audio conversion features. / 这是完整的TypeScript重写版本，并增加了音频转换功能。
