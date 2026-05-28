// NPC 数据表（720p HD · 像素坐标）
//
// PHASE Step2：从"tile 坐标 (x,y)" 切到"像素坐标 (cx,cy)"
// ────────────────────────────────────────────────────────
//  - 之前 villageScene init 中：npc.px = x*64+16, npc.py = y*64+16
//    意味着 sprite 32×48 的左上角 = (x*64+16, y*64+16)
//    所以 sprite 中心点（视觉锚点）原本就在 (x*64+32, y*64+32)
//  - 现在切到 T=32，仍要让 NPC 出现在视觉上的同一像素位置
//    → 直接存"sprite 中心像素 (cx, cy)"，与 T 解耦
//  - 旧 (x,y) 映射到 (cx,cy)：cx = x*64+32, cy = y*64+32
//
// 渲染时 villageScene 会按 npc.px = cx - 16, npc.py = cy - 16 反算 sprite 左上角。

export const NPCS = [
  {
    id: 'mom',
    name: '秀兰阿姨',
    // 旧 (5,5) → 中心 (352, 352)；2026-05-28 南移 1 格(64px) → (352, 416)
    cx: 352, cy: 416,
    sprite: { head: '#F4E4C1', body: '#3A6FA8', leg: '#3D2B1F' },
    role: '阿明的母亲',
    facing: 'down',
    defaultDialog: 'mom_default',
    questId: null,
    autoTrigger: true              // 玩家进场后首次自动触发 mom_first_meet
  },
  {
    id: 'chief',
    name: '阿土伯',
    // 旧 (9,2) → (608, 160)
    cx: 608, cy: 160,
    sprite: { head: '#C9A876', body: '#9A9590', leg: '#A67C52' },
    role: '村长',
    facing: 'down',
    defaultDialog: 'chief_default',
    questId: 'q001_first_fish'    // 关键！第一个任务发布人
  },
  {
    id: 'master_lin',
    name: '林师傅',
    // 旧 (13,5) → (864, 352)；2026-05-28 西移 2 格(128px) → (736, 352)
    cx: 736, cy: 352,
    sprite: { head: '#E8C896', body: '#5C8A4C', leg: '#A67C52' },
    role: '钓具店老板',
    facing: 'down',
    defaultDialog: 'lin_default',
    questId: 'q003'
  },
  {
    id: 'xiaofang',
    name: '小芳',
    // 旧 (14, 7.5) → (928, 512)；2026-05-28 西移 1 格(64px) → (864, 512)
    cx: 864, cy: 512,
    sprite: { head: '#3D2B1F', body: '#A83C3C', leg: '#3D2B1F' },
    role: '7-11 店员',
    facing: 'down',
    defaultDialog: 'xiaofang_default',
    questId: 'q002'               // q001 完成后小芳提供 q002
  }
];
