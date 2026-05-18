// NPC 数据表（720p HD · 坐标基于 20×11 地图）

export const NPCS = [
  {
    id: 'mom',
    name: '秀兰阿姨',
    x: 5, y: 5,                    // 阿明家（1-2列）右侧空地
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
    x: 9, y: 2,                   // 中央水池旁（广场石砖区）
    sprite: { head: '#C9A876', body: '#9A9590', leg: '#A67C52' },
    role: '村长',
    facing: 'down',
    defaultDialog: 'chief_default',
    questId: 'q001_first_fish'    // 关键！第一个任务发布人
  },
  {
    id: 'master_lin',
    name: '林师傅',
    x: 13, y: 5,                  // 钓具店门前
    sprite: { head: '#E8C896', body: '#5C8A4C', leg: '#A67C52' },
    role: '钓具店老板',
    facing: 'down',
    defaultDialog: 'lin_default',
    questId: 'q003'
  },
  {
    id: 'xiaofang',
    name: '小芳',
    x: 14, y: 7.5,                  // 7-11 杂货店门口
    sprite: { head: '#3D2B1F', body: '#A83C3C', leg: '#3D2B1F' },
    role: '7-11 店员',
    facing: 'down',
    defaultDialog: 'xiaofang_default',
    questId: 'q002'               // q001 完成后小芳提供 q002
  }
];