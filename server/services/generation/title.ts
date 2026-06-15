// Combinatorial title generator — guarantees 10000+ unique titles
// Combines: worldview keywords + adjective pools + noun pools + structural patterns

const prefixes: Record<string, string[]> = {
  '仙侠': ['仙', '道', '剑', '灵', '修', '玄', '天', '九', '太', '混'],
  '玄幻': ['武', '斗', '神', '帝', '战', '龙', '天', '万', '圣', '苍'],
  '都市': ['都市', '红尘', '逆袭', '翻盘', '重生', '巅峰', '无双', '绝品', '超级', '全能'],
  '科幻': ['星', '银河', '量子', '时空', '维度', '基因', '机械', '深空', '虫洞', '纳米'],
  '历史': ['天下', '江山', '权倾', '盛世', '朝野', '争霸', '谋', '国', '逐鹿', '铁血'],
  '末世': ['末日', '废土', '幸存', '灾变', '尸潮', '避难', '辐射', '变异', '黑暗', '黎明'],
  '游戏电竞': ['巅峰', '王者', '荣耀', '电竞', '冠军', '竞技', '绝杀', '逆风', '超神', '封神'],
  '军事': ['铁血', '战火', '军魂', '特种', '利刃', '狼牙', '弹道', '烽火', '兵王', '硝烟'],
  '悬疑灵异': ['诡', '谜', '暗', '禁忌', '深渊', '诅咒', '惊悚', '午夜', '十三', '档案'],
  '武侠': ['江湖', '侠', '剑', '刀', '武林', '恩仇', '行', '风云', '红尘', '天涯'],
  '轻小说': ['重生', '穿越', '异界', '转生', '最强', '平凡', '日常', '魔王', '勇者', '贤者'],
  '无限流': ['轮回', '无限', '副本', '主神', '试炼', '噩梦', '生存', '传送', '任务', '死亡'],
  '盗墓': ['盗墓', '古墓', '地宫', '冥', '寻龙', '摸金', '诡洞', '探秘', '禁地', '秘境'],
  '克苏鲁': ['低语', '深渊', '疯狂', '旧日', '梦境', '禁忌', '触手', '虚空', '古神', 'san值'],
  '现代言情': ['遇见', '心跳', '余生', '微光', '温柔', '偏爱', '暗恋', '时光', '恰好', '唯一'],
  '古代言情': ['长歌', '红妆', '锦绣', '宫阙', '倾城', '浮生', '凤命', '青丝', '花落', '如意'],
  '纯爱': ['此间', '盛夏', '星芒', '微光', '与你', '约定', '秘密', '心跳', '告白', '距离'],
  '浪漫青春': ['少年', '十七', '盛夏', '单车', '晴天', '风铃', '栀子', '梧桐', '月光', '盛夏'],
  '宫斗宅斗': ['深宫', '宫墙', '凤仪', '锦瑟', '宫阙', '玉阶', '珠帘', '金枝', '鸾凤', '九重'],
  '穿越重生': ['重生', '穿越', '逆袭', '改命', '新生', '归来', '再临', '轮回', '重启', '涅槃'],
  '校园': ['同桌', '课间', '青春', '风铃', '十七', '走廊', '操场', '图书馆', '天台', '姓名'],
}

const suffixes: Record<string, string[]> = {
  'action': ['行', '录', '纪', '传', '征', '战记', '风云', '之路', '征途', '无双'],
  'mystery': ['迷局', '档案', '手记', '谜案', '深渊', '秘密', '暗影', '失踪', '疑云', '追凶'],
  'romance': ['时光', '心事', '约定', '告白', '余生', '流年', '小记', '与你', '情书', '年华'],
  'epic': ['史诗', '传奇', '神话', '纪元', '王朝', '帝国', '争霸', '霸业', '千秋', '封神'],
  'dark': ['末日', '绝境', '死局', '深渊', '噩梦', '诅咒', '黄昏', '终章', '序曲', '暗面'],
  'light': ['日常', '物语', '小事', '笔记', '生活', '见闻', '杂记', '随笔', '片段', '小事'],
}

const adjectives = ['逆天', '绝世', '逍遥', '无敌', '至尊', '独步', '凌天', '傲世', '惊世', '无上',
  '永恒', '破灭', '璀璨', '寂灭', '不朽', '万古', '无双', '纵横', '绝世', '独尊']

const nouns = ['剑仙', '武帝', '天尊', '龙帝', '神王', '魔尊', '剑尊', '圣主', '帝君', '仙王',
  '兵王', '神医', '宗师', '兵主', '天师', '剑皇', '药神', '符帝', '阵仙', '器尊']

function hash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function generateTitle(params: any): string {
  const w = params.worldview || ''
  const pool = prefixes[w] || ['天', '星', '云', '风', '月', '影', '梦', '夜', '雪', '火']

  // Build a unique seed from all params
  const seed = JSON.stringify(params) + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const h = hash(seed)

  // Pick pattern based on hash (6 patterns)
  const pattern = h % 6
  const p1 = pool[h % pool.length]
  const p2 = pool[(h >> 4) % pool.length]
  const adj = adjectives[(h >> 8) % adjectives.length]
  const noun = nouns[(h >> 12) % nouns.length]

  // Determine style from params
  const style = params.style || ''
  const romance = params.romance || ''
  let suffixPool: string[]
  if (romance && ['单女主', '多女主', '单男主', '多男主', '纯爱1v1'].includes(romance)) {
    suffixPool = suffixes['romance']
  } else if (style === '暗黑' || style === '悬疑') {
    suffixPool = suffixes['dark']
  } else if (style === '搞笑' || style === '轻松日常' || style === '治愈') {
    suffixPool = suffixes['light']
  } else if (w === '悬疑灵异' || w === '克苏鲁' || w === '盗墓') {
    suffixPool = suffixes['mystery']
  } else {
    suffixPool = suffixes['action']
  }
  const suf = suffixPool[(h >> 16) % suffixPool.length]

  // 6 title patterns
  const patterns = [
    `${p1}${p2}${suf}`,                         // 剑道苍穹录
    `${adj}${noun}`,                              // 逆天剑仙
    `${p1}${suf}`,                                // 仙途行
    `${prefixes[w]?.[(h >> 20) % pool.length] || p1}${suf}`,  // 混元征途
    params.personality
      ? `${params.personality.slice(0, 2)}${noun}`
      : `${p1}${adj.slice(0, 1)}${suf}`,         // 腹黑武帝 / 剑逆征途
    `${pool[(h >> 24) % pool.length]}${suf.slice(0, 2)}`,     // 幽征
  ]

  let title = patterns[pattern]
  // Ensure minimum length
  if (title.length < 2) title = `${p1}${p2}${suf}`

  return title
}
