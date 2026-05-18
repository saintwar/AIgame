// 美术调色板 v1.2 四阶段昼夜系统

export const PALETTE = {
  // 已有主色（保留）
  ROOF_RED:    '#A83C3C',
  WALL_CREAM:  '#F4E4C1',
  GRASS:       '#5C8A4C',
  WOOD_DARK:   '#3D2B1F',
  WATER_LIGHT: '#7AB8C4',
  WATER_DEEP:  '#2B4F6B',
  SAND_WARM:   '#E8C896',
  ROOF_METAL:  '#6B7A85',

  // 黄昏氛围扩展（Phase A 新增）
  SKY_TOP:     '#FFB07A',
  SKY_MID:     '#E8956B',
  SKY_HORIZON: '#7B6FA8',
  SUN:         '#FF7B47',
  GOLD_RIM:    '#FFE4B5',
  WINDOW_LIT:  '#FFD700',
  GRASS_DARK:  '#4A7A3D',
  GRASS_LIGHT: '#7AAB5C',
  SHADOW:      'rgba(60,40,80,0.35)',
  DUSK_FILTER: 'rgba(255,165,107,0.12)',

  // Phase B 新增
  STONE:        '#B8A887',
  STONE_GAP:    '#6B5D45',
  WOOD_PLANK:   '#8B6F47',
  WOOD_GRAIN:   '#5C4A3A',
  WOOD_NAIL:    '#4A4A4A',
  GLASS_BLUE:   'rgba(122,184,196,0.6)',
  LANTERN_RED:  '#C8302C',
  RIPPLE_WARM:  '#FFD4A8',
  MOUNTAIN_FAR: '#7B6FA8',
  MOUNTAIN_MID: '#6A5C8E',
  MOUNTAIN_NEAR:'#5A4D7A',

  // 白天配色（Phase D 新增）
  DAY_MOUNTAIN_FAR:  '#8CB88C',
  DAY_MOUNTAIN_MID:  '#6A9A6A',
  DAY_MOUNTAIN_NEAR: '#4A7A4A',
  DAY_SHADOW:        'rgba(0,0,0,0.15)',
  DAY_GOLD_RIM:      'rgba(255,255,255,0.15)',
  DAY_REFLECT_COLOR: 'rgba(200,230,255,0.3)',

  // 黎明配色（Phase D 新增）
  DAWN_MOUNTAIN_FAR:  '#9A8AAA',
  DAWN_MOUNTAIN_MID:  '#7A6A8A',
  DAWN_MOUNTAIN_NEAR: '#5A4A6A',
  DAWN_SHADOW:        'rgba(40,30,60,0.25)',
  DAWN_GOLD_RIM:      'rgba(255,200,160,0.3)',

  // 夜晚配色
  NIGHT_MOUNTAIN_FAR:  '#3A3060',
  NIGHT_MOUNTAIN_MID:  '#2A2050',
  NIGHT_MOUNTAIN_NEAR: '#1A1840',
  NIGHT_SHADOW:        'rgba(0,0,20,0.5)',
  NIGHT_GOLD_RIM:      'rgba(255,215,0,0.2)',

  // Phase C 新增
  SKIN_TONE:     '#F5C9A0',
  SKIN_DARK:     '#D9A37A',
  HAIR_BLACK:    '#2B1810',
  HAIR_WHITE:    '#E8E0D0',
  CLOTH_AMING:   '#E8C896',   // 阿明黄T
  PANTS_AMING:   '#2B4F6B',   // 阿明蓝裤
  CLOTH_XIULAN:  '#D4756B',   // 秀兰花布
  CLOTH_VILLAGE: '#5C4A3A',   // 村长唐装
  CLOTH_LIN:     '#8B6F47',   // 林师傅背心
  CLOTH_XIAOFANG:'#FFFFFF',   // 小芳白T
  CLOTH_BAND:    '#7AB8C4',   // 小芳牛仔
  HAT_AMING:     '#A83C3C',   // 阿明红帽
  HAT_VILLAGE:   '#C9A876',   // 村长斗笠
  REFLECTION:    'rgba(255,255,255,0.25)',
};