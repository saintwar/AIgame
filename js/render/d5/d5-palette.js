// PHASE 21-1 D5「鱼咬钩反馈系统」· 调色板 + 字体栈常量
//
// 唯一权威源：docs/PHASE-21-1-D5-impl-spec.md §2.2
// 复制时已逐字对齐 fishing-scene._drawPixelBob 内既有字面量（v3.0 浮漂同源 9 色）
// + D5 反馈层新增 3 色 + 警示红 1 色 + 四叶草高光 1 色
//
// 字体策略：art-spec §5.0 推荐的像素字体（Fusion Pixel / Zpix / Cubic 11 / Press Start 2P）
// 项目内未注册，作为前置 fallback 写入字符串；TencentSansW7 作为兜底主字体（index.html @font-face 已注册）

export const D5_COLORS = {
  // —— v3.0 浮漂同源 9 色（与 fishing-scene._drawPixelBob 字面量逐字对齐） ——
  OUT:     '#1A1A2E',
  GLOW:    '#FFF8C8',
  GLOW_HI: '#FFFFFF',
  RED:     '#E63946',
  RED_DK:  '#B11D2C',
  YEL:     '#FFD43B',
  YEL_DK:  '#D4A41A',
  WHT:     '#FFF4D6',
  WHT_DK:  '#C8B89A',

  // —— D5 反馈层 3 色 ——
  LATE:        '#E8553D', // LATE 警示橙红
  PERFECT_HI:  '#FFEEB0', // PERFECT 高光金
  CLOVER:      '#7AC862', // 四叶草明亮草绿

  // —— 既有警示红（猛档边框泛红，复用 v3.0 既有用法） ——
  WARN:        '#C8412B',

  // —— 四叶草专用高光（用途收窄，art-spec §0.2 / §6.1） ——
  CLOVER_HI:   '#F4E4BC',
};

// 字体栈：未注册像素字体在前作为渐进增强，TencentSansW7 兜底
export const D5_FONT_STACK =
  `'Fusion Pixel 12px','Zpix','Cubic 11','Press Start 2P',` +
  `'TencentSansW7','PingFang SC','Microsoft YaHei','Heiti SC',sans-serif`;
