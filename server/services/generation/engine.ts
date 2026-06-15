import { buildBasePrompt, buildShortStoryPrompt, buildLongStoryWorldPrompt, buildFirstChaptersPrompt, buildChapterPrompt, buildConsistencyCheckPrompt } from './prompt'
import { generateTitle } from './title'
import { getModelConfig, type ModelTask } from '../../utils/model'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// ── Structured tracking types ──

interface ForeshadowState {
  id: number
  name: string
  status: 'planted' | 'advanced' | 'resolved'
  chapterPlanted: number | null
  chapterResolved: number | null
  progress: string
}

interface CharacterSnapshot {
  chapter: number
  location: string
  emotion: string
  abilities: string
  relationships: string
}

interface CharacterStateTracking {
  name: string
  snapshots: CharacterSnapshot[]
}

interface OpenThread {
  desc: string
  chapterOpened: number | null
  resolved: boolean
}

interface MemoryUpdateEntry {
  chapterRange: string
  content: string
}

interface ConsistencyReport {
  checkedAtChapter: number
  report: string
  issues: string[]
}

interface ParsedMemoryUpdate {
  newCharacters: { name: string; role: string; relationship: string }[]
  revealedSettings: string[]
  characterChanges: { name: string; location: string; emotion: string; abilities: string; relationships: string }[]
  foreshadowChanges: { id: string; status: 'planted' | 'advanced' | 'resolved'; description: string }[]
  timeline: string
}

// ── Framework table types ──
interface Framework {
  columns: string[]
  rows: FrameworkRow[]
}

interface FrameworkRow {
  chapterRange: string
  cells: Record<string, string>
}

// 5 fixed columns — every novel needs these
const UNIVERSAL_COLUMNS = [
  '角色状态',
  '伏笔进度',
  '世界观揭示',
  '时间线',
  '未闭合线',
]

// Genre-specific columns — selected based on worldview tags
const GENRE_COLUMNS: Record<string, string[]> = {
  '仙侠': ['修炼进度', '宗门关系', '法宝灵兽'],
  '玄幻': ['修炼进度', '势力格局', '血脉天赋'],
  '科幻': ['科技设定', '组织派系', '星际格局'],
  '武侠': ['武功进境', '门派恩怨', '江湖格局'],
  '历史': ['历史事件', '朝局变化', '民生经济'],
  '都市': ['社会关系', '职业发展', '城市变迁'],
  '现代言情': ['感情进度', '家庭关系', '社交圈'],
  '古代言情': ['感情进度', '家族关系', '宫廷朝局'],
  '悬疑灵异': ['谜题揭秘', '线索汇总', '超自然规则'],
  '末世': ['生存资源', '势力分布', '环境异变'],
  '权谋': ['势力博弈', '情报网络', '政治格局'],
  '克苏鲁': ['认知侵蚀', '不可名状', '精神状态'],
  '游戏电竞': ['竞技水平', '团队关系', '赛事进度'],
  '热血': ['战力等级', '对手情报', '团队羁绊'],
  '暗黑': ['道德偏移', '心理变化', '代价累积'],
  '烧脑': ['真相揭露度', '伏线串联', '时间线重构'],
  '治愈': ['情感恢复', '人际关系', '生活重建'],
  '文艺': ['意象演变', '情感层次', '留白空间'],
  '奇幻': ['魔法体系', '种族关系', '世界格局'],
  '军事': ['战役进程', '装备科技', '军队部署'],
  '盗墓': ['墓穴探索', '机关破解', '队伍状态'],
  '美食': ['菜品研发', '餐厅经营', '人际网络'],
  '无限流': ['副本进度', '能力获取', '队伍变动'],
  '系统流': ['系统功能', '任务进度', '奖励累积'],
}

async function callDeepSeek(messages: ChatMessage[], stream = false, maxTokens = 12000, task: ModelTask = 'chapter_gen') {
  const config = getModelConfig(task)
  const response = await $fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model: config.model,
      messages,
      temperature: 0.85,
      max_tokens: maxTokens,
      stream,
    },
  })

  return response
}

// ============================================================
// 短篇生成（不变）
// ============================================================
export async function generateShortStory(params: any, title: string): Promise<{ content: string; blueprint: any }> {
  const systemPrompt = buildBasePrompt()
  const userPrompt = buildShortStoryPrompt(params, title)

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  const response: any = await callDeepSeek(messages)
  const fullText = response.choices[0].message.content

  const blueprintMatch = fullText.match(/【蓝图】\n([\s\S]*?)$/)
  const content = blueprintMatch
    ? fullText.replace(/【蓝图】[\s\S]*$/, '').trim()
    : fullText

  let blueprint = {}
  if (blueprintMatch) {
    const bpText = blueprintMatch[1]
    const charMatch = bpText.match(/人物设定：([\s\S]*?)(?=伏笔：|核心冲突：|结局方向：|$)/)
    const foreshadowMatch = bpText.match(/伏笔：([\s\S]*?)(?=核心冲突：|结局方向：|$)/)
    const conflictMatch = bpText.match(/核心冲突：([\s\S]*?)(?=结局方向：|$)/)
    const endingMatch = bpText.match(/结局方向：([\s\S]*?)$/)

    blueprint = {
      characters: charMatch?.[1]?.trim() || '',
      foreshadowing: foreshadowMatch?.[1]?.trim() || '',
      conflict: conflictMatch?.[1]?.trim() || '',
      ending: endingMatch?.[1]?.trim() || '',
    }
  }

  return { content, blueprint }
}

// ============================================================
// 长篇世界观生成（150-200章规划）
// ============================================================
export async function generateLongStoryWorld(params: any, title: string): Promise<any> {
  const systemPrompt = buildBasePrompt()
  const userPrompt = buildLongStoryWorldPrompt(params, title)

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  const response: any = await callDeepSeek(messages, false, 16000, 'world_gen')
  const fullText = response.choices[0].message.content

  // Parse sections
  const worldMatch = fullText.match(/【世界观设定】\n([\s\S]*?)(?=【角色档案】|$)/)
  const charMatch = fullText.match(/【角色档案】\n([\s\S]*?)(?=【篇章规划】|$)/)
  const arcMatch = fullText.match(/【篇章规划】\n([\s\S]*?)(?=【伏笔计划】|$)/)
  const foreshadowMatch = fullText.match(/【伏笔计划】\n([\s\S]*?)(?=【冲突线】|$)/)
  const conflictMatch = fullText.match(/【冲突线】\n([\s\S]*?)$/)

  // Parse arcs
  const arcText = arcMatch?.[1] || ''
  const arcs = parseArcs(arcText)

  // Extract first arc's chapter titles for DB seeding
  const chapterOutlines = parseChapterOutlinesFromArcs(arcText)

  return {
    worldSetting: worldMatch?.[1]?.trim() || '',
    characters: charMatch?.[1]?.trim() || '',
    arcs,
    chapterOutlines,
    foreshadowing: foreshadowMatch?.[1]?.trim() || '',
    conflict: conflictMatch?.[1]?.trim() || '',
    rawWorldContext: fullText, // Store complete context for memory
  }
}

function parseArcs(text: string): { name: string; chapterRange: string; conflict: string; goal: string }[] {
  const arcs: { name: string; chapterRange: string; conflict: string; goal: string }[] = []
  const lines = text.split('\n')
  for (const line of lines) {
    const match = line.match(/第[一二三四五六七八九十]+篇章[（(](第?\d+[-~—–]\d+章)[）)]\s*[:：]?\s*(.+)/)
    if (match) {
      arcs.push({
        chapterRange: match[1],
        name: match[2],
        conflict: '',
        goal: '',
      })
    }
  }
  return arcs
}

function parseChapterOutlinesFromArcs(text: string): { number: number; title: string; summary: string }[] {
  const arcs = parseArcs(text)
  const firstArc = arcs[0]
  const rangeMatch = firstArc?.chapterRange?.match(/(\d+)[-~—–]\s*(\d+)/)
  const start = rangeMatch ? parseInt(rangeMatch[1]) : 1
  const end = rangeMatch ? parseInt(rangeMatch[2]) : 35
  const count = end - start + 1
  const arcName = firstArc?.name || '第一篇章'

  const chapters: { number: number; title: string; summary: string }[] = []
  for (let i = 0; i < count; i++) {
    const num = start + i
    chapters.push({
      number: num,
      title: `第${num}章`,
      summary: `${arcName}·第${num}章`,
    })
  }
  return chapters
}

// ============================================================
// 长篇前2章生成（含世界背景注入）
// ============================================================
export async function generateFirstChapters(
  params: any,
  title: string,
  worldContext: string
): Promise<{ chapters: { number: number; title: string; content: string }[]; memoryUpdate: string }> {
  const systemPrompt = buildBasePrompt()
  const userPrompt = buildFirstChaptersPrompt(params, title, worldContext)

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  const response: any = await callDeepSeek(messages, false, 10000)
  const fullText = response.choices[0].message.content

  // Split chapters
  const parts = fullText.split(/---第\d+章完---/)
  const chapters: { number: number; title: string; content: string }[] = []

  for (let i = 0; i < parts.length && i < 2; i++) {
    const content = parts[i].trim()
    if (content) {
      const titleMatch = content.match(/第(\d+)章[：:]\s*(.+)/)
      chapters.push({
        number: i + 1,
        title: titleMatch?.[2]?.trim() || `第${i + 1}章`,
        content,
      })
    }
  }

  // Extract memory update
  const memoryMatch = fullText.match(/【记忆更新】\n([\s\S]*?)$/)
  const memoryUpdate = memoryMatch?.[1] || ''

  return { chapters, memoryUpdate }
}

// ============================================================
// 长篇续写（每次4章：2最终 + 2规划）
// ============================================================
export async function generateNextChapters(
  chapterNumber: number,
  chapterTitle: string,
  memoryContext: string,
  plannedChapters?: { number: number; title: string; firstChars: string }[]
): Promise<{ finalChapters: { number: number; title: string; content: string }[]; plannedChapters: { number: number; title: string; content: string }[]; memoryUpdate: string }> {
  const systemPrompt = buildBasePrompt()
  const userPrompt = buildChapterPrompt(chapterNumber, chapterTitle, memoryContext, plannedChapters)

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  const response: any = await callDeepSeek(messages, false, 16000)
  const fullText = response.choices[0].message.content

  // Split chapters — expect 4 this time
  const parts = fullText.split(/---第\d+章完---/)
  const allChapters: { number: number; title: string; content: string }[] = []

  for (let i = 0; i < parts.length && i < 4; i++) {
    const content = parts[i].trim()
    if (content) {
      const titleMatch = content.match(/第(\d+)章[：:]\s*(.+)/)
      allChapters.push({
        number: chapterNumber + i,
        title: titleMatch?.[2]?.trim() || `第${chapterNumber + i}章`,
        content,
      })
    }
  }

  const finalChapters = allChapters.slice(0, 2)
  const plannedChaptersResult = allChapters.slice(2, 4)

  // Extract memory update
  const memoryMatch = fullText.match(/【记忆更新】\n([\s\S]*?)$/)
  const memoryUpdate = memoryMatch?.[1] || ''

  return { finalChapters, plannedChapters: plannedChaptersResult, memoryUpdate }
}

// ============================================================
// 记忆上下文构建器
// ============================================================
export function buildMemoryContext(options: {
  worldSetting: string
  characters: string
  arcs: string
  conflict: string
  foreshadowing: string
  previousChapters: { number: number; title: string; summary: string; endingHint: string }[]
  previousMemoryUpdates: string
  trackingTables?: { foreshadowTable: string; characterTable: string; openThreads: string }
  frameworkContext?: string
}): string {
  let ctx = ''

  if (options.worldSetting) {
    ctx += `## 世界观设定\n${options.worldSetting}\n\n`
  }
  if (options.characters) {
    ctx += `## 角色档案\n${options.characters}\n\n`
  }
  if (options.arcs) {
    ctx += `## 篇章规划（全书150-200章）\n${options.arcs}\n\n`
  }
  if (options.conflict) {
    ctx += `## 冲突线\n${options.conflict}\n\n`
  }
  if (options.foreshadowing) {
    ctx += `## 伏笔计划\n${options.foreshadowing}\n\n`
  }
  if (options.previousChapters.length > 0) {
    const lastChapter = options.previousChapters[options.previousChapters.length - 1]

    // ── 衔接锚点：放到最前，AI 必须从这一刻接着拍 ──
    ctx += `## 衔接锚点（你的第 N 章第一个字必须发生在这个场景里）

上一章（第${lastChapter.number}章）结束时的镜头定格于此：

${lastChapter.endingHint}

上面这个镜头没有结束。摄影机还开着，角色还站在这里，灯光还没灭，话还没说完。
你的任务不是开一个新镜头，而是把上面这个镜头继续拍下去——
写出接下来三秒到三十秒内发生的事：一个动作、一句对话、一个感官细节。

正例：「路灯闪了一下。程渡眨了下眼，从那个陌生念头里回过神来。街上已经没人了，他抬脚往前走。」
反例：「凌晨三点，程渡从床上坐起来。」
反例：「第二天早上，程渡推开净化站的门。」
反例：「程渡睁开眼，发现自己在家里。」

铁律：你的第一个句号之前，必须是上一章最后一个句号之后的同一时间、同一地点、同一人物状态。

`
    // ── 已写章节摘要 ──
    ctx += `## 已写章节摘要（用于查重，不可修改）

`
    for (const ch of options.previousChapters) {
      ctx += `第${ch.number}章 ${ch.title}\n  开头：${ch.summary}\n  章尾：${ch.endingHint}\n\n`
    }

    // ── 结构引用，帮助 AI 定位 ──
    ctx += `续写目标：第${lastChapter.number + 1}章。衔接锚点已在最上方给出。\n\n`
  }

  // Inject unified framework context (V2), fall back to old tracking tables
  if (options.frameworkContext) {
    ctx += options.frameworkContext + '\n'
  } else if (options.trackingTables) {
    if (options.trackingTables.foreshadowTable) ctx += options.trackingTables.foreshadowTable + '\n'
    if (options.trackingTables.characterTable) ctx += options.trackingTables.characterTable + '\n'
    if (options.trackingTables.openThreads) ctx += options.trackingTables.openThreads + '\n'
  }

  if (options.previousMemoryUpdates) {
    ctx += `## 最新状态\n${options.previousMemoryUpdates}\n`
  }

  // Safety: truncate if total context exceeds reasonable limit (~8000 tokens)
  const MAX_CTX = 12000
  if (ctx.length > MAX_CTX) {
    ctx = ctx.slice(0, MAX_CTX) + '\n\n[...上下文过长，已截断。请优先参考上方追踪表]\n'
  }

  return ctx
}

// ============================================================
// Initial foreshadow parsing — from world generation
// ============================================================
export function parseInitialForeshadowing(foreshadowText: string): ForeshadowState[] {
  const states: ForeshadowState[] = []
  const lines = foreshadowText.split('\n')
  let id = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Match patterns like "1. 师父失踪：第1篇章埋→第5篇章回收"
    const match = trimmed.match(/^(\d+)[\.\、\)]\s*(.+)/)
    if (match) {
      id++
      const desc = match[2]
      // Try to extract which arcs it spans
      const arcMatch = desc.match(/第(\d+)篇章.*?第(\d+)篇章/)
      states.push({
        id,
        name: desc.replace(/第\d+篇章.*$/, '').replace(/[：:]\s*$/, '').trim().slice(0, 60),
        status: 'planted',
        chapterPlanted: null,
        chapterResolved: null,
        progress: desc.slice(0, 100),
      })
    }
  }
  // If no numbered items found, create a single entry with the full text
  if (states.length === 0 && foreshadowText.trim()) {
    states.push({
      id: 1,
      name: foreshadowText.trim().slice(0, 60),
      status: 'planted',
      chapterPlanted: null,
      chapterResolved: null,
      progress: foreshadowText.trim().slice(0, 100),
    })
  }
  return states
}

// ============================================================
// Parse the LLM's 【记忆更新】output into structured data
// ============================================================
export function parseMemoryUpdate(rawText: string, currentChapter: number): ParsedMemoryUpdate {
  const result: ParsedMemoryUpdate = {
    newCharacters: [],
    revealedSettings: [],
    characterChanges: [],
    foreshadowChanges: [],
    timeline: '',
  }

  if (!rawText) return result

  const sections = rawText.split('\n')

  let currentSection: string | null = null
  for (const line of sections) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Detect section headers (strip markdown formatting first: ###, **, -)
    const bare = trimmed.replace(/^[#*-]{1,3}\s*/, '')
    if (bare.startsWith('新增人物')) { currentSection = 'char'; continue }
    if (bare.startsWith('已揭示设定')) { currentSection = 'setting'; continue }
    if (bare.startsWith('状态变化')) { currentSection = 'state'; continue }
    if (bare.startsWith('伏笔变化')) { currentSection = 'foreshadow'; continue }
    if (bare.startsWith('时间线')) {
      currentSection = 'timeline'
      result.timeline = bare.replace(/^时间线[节点：:]\s*/, '')
      continue
    }

    if (!currentSection) continue

    switch (currentSection) {
      case 'char': {
        // Format: "姓名：XXX | 定位：XXX | 关系：XXX" or "- 姓名：XXX | ..."
        const clean = trimmed.replace(/^[-•*\s]+/, '')
        const nMatch = clean.match(/姓名[：:]\s*(.+)/)
        const rMatch = clean.match(/定位[：:]\s*(.+)/)
        const relMatch = clean.match(/关系[：:]\s*(.+)/)
        if (nMatch) {
          result.newCharacters.push({
            name: nMatch[1].trim(),
            role: rMatch?.[1]?.trim() || '',
            relationship: relMatch?.[1]?.trim() || '',
          })
        } else if (clean) {
          // Fallback: treat the whole line as name info
          result.newCharacters.push({ name: clean.slice(0, 40), role: '', relationship: '' })
        }
        break
      }
      case 'setting': {
        const clean = trimmed.replace(/^[-•*\s]+/, '')
        if (clean) result.revealedSettings.push(clean)
        break
      }
      case 'state': {
        // Format: "角色名：位置=XXX | 情绪=XXX | 能力=XXX | 关系=XXX"
        const clean = trimmed.replace(/^[-•*\s]+/, '')
        const nameMatch = clean.match(/^(.+?)[：:]/)
        const locMatch = clean.match(/位置[=＝]\s*([^|]+)/)
        const emoMatch = clean.match(/情绪[=＝]\s*([^|]+)/)
        const abiMatch = clean.match(/能力[=＝]\s*([^|]+)/)
        const relMatch2 = clean.match(/关系[=＝]\s*([^|]+)/) || clean.match(/关系变化[=＝]\s*([^|]+)/)
        if (nameMatch) {
          result.characterChanges.push({
            name: nameMatch[1].trim(),
            location: locMatch?.[1]?.trim() || '',
            emotion: emoMatch?.[1]?.trim() || '',
            abilities: abiMatch?.[1]?.trim() || '',
            relationships: relMatch2?.[1]?.trim() || '',
          })
        }
        break
      }
      case 'foreshadow': {
        // Format: "#ID 名称：状态=已推进/已回收/已埋 | 描述"
        const clean = trimmed.replace(/^[-•*\s]+/, '')
        const idMatch = clean.match(/^[#＃]?(\d+)/)
        const statusMatch = clean.match(/状态[=＝]\s*(已埋|已推进|已回收)/)
        const desc = clean.replace(/状态[=＝].*$/, '').replace(/^[#＃]?\d+\s*/, '').replace(/[：:]\s*$/, '').trim()
        if (statusMatch && idMatch) {
          const statusMap: Record<string, 'planted' | 'advanced' | 'resolved'> = {
            '已埋': 'planted', '已推进': 'advanced', '已回收': 'resolved',
          }
          result.foreshadowChanges.push({
            id: idMatch[1],
            status: statusMap[statusMatch[1]] || 'advanced',
            description: desc.slice(0, 100) || clean.slice(0, 100),
          })
        } else if (clean) {
          // Fallback: try to detect status from keywords
          let status: 'planted' | 'advanced' | 'resolved' = 'advanced'
          if (clean.includes('已埋') || clean.includes('埋下') || clean.includes('新埋')) status = 'planted'
          if (clean.includes('已回收') || clean.includes('回收') || clean.includes('呼应')) status = 'resolved'
          result.foreshadowChanges.push({
            id: '',
            status,
            description: clean.slice(0, 100),
          })
        }
        break
      }
    }
  }

  return result
}

// ============================================================
// Accumulate parsed memory data into tags (NEVER overwrite)
// ============================================================
export function accumulateMemoryData(
  existingTags: Record<string, any>,
  parsed: ParsedMemoryUpdate,
  chapterRange: string,
  rawMemoryText: string,
): Record<string, any> {
  const tags = { ...existingTags }

  // ── Foreshadow states ──
  const foreshadowStates: ForeshadowState[] = Array.isArray(tags._foreshadowStates)
    ? JSON.parse(JSON.stringify(tags._foreshadowStates))
    : []

  for (const fc of parsed.foreshadowChanges) {
    const existing = foreshadowStates.find(f => String(f.id) === fc.id)
    if (existing) {
      existing.status = fc.status
      existing.progress = fc.description
      if (fc.status === 'resolved') {
        existing.chapterResolved = existing.chapterResolved || parseInt(chapterRange.split('-')[0])
      }
    } else {
      // No matching ID — create a new entry regardless of status
      const newId = foreshadowStates.length > 0 ? Math.max(...foreshadowStates.map(f => f.id)) + 1 : 1
      const chNum = parseInt(chapterRange.split('-')[0])
      foreshadowStates.push({
        id: newId,
        name: fc.description.slice(0, 60),
        status: fc.status,
        chapterPlanted: fc.status === 'planted' ? chNum : null,
        chapterResolved: fc.status === 'resolved' ? chNum : null,
        progress: fc.description,
      })
    }
  }
  tags._foreshadowStates = foreshadowStates

  // ── Character states ──
  const characterStates: CharacterStateTracking[] = Array.isArray(tags._characterStates)
    ? JSON.parse(JSON.stringify(tags._characterStates))
    : []

  for (const cc of parsed.characterChanges) {
    if (!cc.name) continue
    const existing = characterStates.find(c => c.name === cc.name)
    const snapshot: CharacterSnapshot = {
      chapter: parseInt(chapterRange.split('-')[0]),
      location: cc.location,
      emotion: cc.emotion,
      abilities: cc.abilities,
      relationships: cc.relationships,
    }
    if (existing) {
      existing.snapshots.push(snapshot)
      // Keep only last 15 snapshots per character to avoid bloat
      if (existing.snapshots.length > 15) {
        existing.snapshots = existing.snapshots.slice(-15)
      }
    } else {
      characterStates.push({ name: cc.name, snapshots: [snapshot] })
    }
  }
  tags._characterStates = characterStates

  // ── Open threads ──
  const openThreads: OpenThread[] = Array.isArray(tags._openThreads)
    ? JSON.parse(JSON.stringify(tags._openThreads))
    : []

  // New characters and revealed settings that hint at unresolved threads
  for (const nc of parsed.newCharacters) {
    if (!openThreads.find(t => t.desc.includes(nc.name))) {
      openThreads.push({
        desc: `角色「${nc.name}」(${nc.role})：${nc.relationship}`,
        chapterOpened: parseInt(chapterRange.split('-')[0]),
        resolved: false,
      })
    }
  }
  // Keep threads under 30
  tags._openThreads = openThreads.slice(-30)

  // ── Memory updates (append, not overwrite) ──
  const memoryUpdates: MemoryUpdateEntry[] = Array.isArray(tags._memoryUpdates)
    ? [...tags._memoryUpdates]
    : (tags._memoryUpdate ? [{ chapterRange: '1-2', content: tags._memoryUpdate }] : [])

  // Check if this chapter range already exists
  const existingIdx = memoryUpdates.findIndex(m => m.chapterRange === chapterRange)
  if (existingIdx >= 0) {
    memoryUpdates[existingIdx] = { chapterRange, content: rawMemoryText }
  } else {
    memoryUpdates.push({ chapterRange, content: rawMemoryText })
  }
  // Keep last 50 entries
  tags._memoryUpdates = memoryUpdates.slice(-50)

  // Also keep _memoryUpdate for backward compatibility
  tags._memoryUpdate = rawMemoryText

  return tags
}

// ============================================================
// Build tracking tables for prompt injection
// ============================================================
export function buildTrackingTables(tags: Record<string, any>): {
  foreshadowTable: string
  characterTable: string
  openThreads: string
} {
  let foreshadowTable = ''
  let characterTable = ''
  let openThreads = ''

  // ── Foreshadow tracking ──
  const fs: ForeshadowState[] = tags._foreshadowStates || []
  if (fs.length > 0) {
    foreshadowTable = '## 伏笔追踪表（必须逐条对待）\n'
    foreshadowTable += '以下是已埋设的全部伏笔。带有"待回收"标记的伏笔请在本轮或下轮推进或回收：\n\n'
    foreshadowTable += '| # | 伏笔 | 状态 | 进度 |\n'
    foreshadowTable += '|---|------|------|------|\n'
    for (const f of fs) {
      const statusIcon = f.status === 'planted' ? '⏳待回收' : f.status === 'advanced' ? '🔄推进中' : '✅已回收'
      foreshadowTable += `| ${f.id} | ${f.name} | ${statusIcon} | ${f.progress.slice(0, 60) || '—'} |\n`
    }
    const unresolved = fs.filter(f => f.status !== 'resolved')
    if (unresolved.length > 0) {
      foreshadowTable += `\n**未回收伏笔（${unresolved.length}条）**：必须在当前篇章推进其中至少1条。\n`
    }
  }

  // ── Character tracking ──
  const cs: CharacterStateTracking[] = tags._characterStates || []
  if (cs.length > 0) {
    characterTable = '## 角色当前状态（必须保持一致）\n'
    characterTable += '以下为各角色最新状态。角色的行为、对话、能力必须与此表一致。不能回退也不能无理由突变：\n\n'
    for (const c of cs) {
      const latest = c.snapshots[c.snapshots.length - 1]
      if (latest) {
        characterTable += `- **${c.name}**：位置=${latest.location || '?'} | 情绪=${latest.emotion || '?'} | 能力=${latest.abilities || '?'} | 关系=${latest.relationships || '?'}`
        // Show evolution if significant
        if (c.snapshots.length >= 3) {
          const first = c.snapshots[0]
          const changes: string[] = []
          if (first.emotion !== latest.emotion) changes.push(`情绪：${first.emotion}→${latest.emotion}`)
          if (first.abilities !== latest.abilities) changes.push(`能力：${first.abilities}→${latest.abilities}`)
          if (changes.length > 0) characterTable += `\n  （演变：${changes.join('；')}）`
        }
        characterTable += '\n'
      }
    }
    characterTable += '\n**警告**：角色状态变化必须有情节支撑，不能突然改变。\n'
  }

  // ── Open threads ──
  const threads: OpenThread[] = tags._openThreads || []
  const unresolved = threads.filter(t => !t.resolved)
  if (unresolved.length > 0) {
    openThreads = '## 未闭合剧情线\n'
    for (const t of unresolved.slice(0, 10)) {
      openThreads += `- ${t.desc}（第${t.chapterOpened}章开启）\n`
    }
    openThreads += '\n**警告**：以上剧情线均未收束。在当前章节中请至少推进其中一条。\n'
  }

  return { foreshadowTable, characterTable, openThreads }
}

// ============================================================
// 框架表 V2 — 统一结构化追踪（向下兼容旧数据）
// ============================================================

/** Initialize framework from world generation. Called once per novel. */
export function initFramework(existingTags: Record<string, any>, worldviewTags: string, customColumns: string[] = []): Record<string, any> {
  const tags = { ...existingTags }

  // Parse worldview tags to determine genre columns
  const wvList = worldviewTags.split(',').map((s: string) => s.trim()).filter(Boolean)
  const genreCols: string[] = []
  const seen = new Set<string>()
  for (const tag of wvList) {
    const cols = GENRE_COLUMNS[tag]
    if (cols) {
      for (const col of cols) {
        if (!seen.has(col)) {
          seen.add(col)
          genreCols.push(col)
        }
      }
    }
  }

  const columns = [...UNIVERSAL_COLUMNS, ...genreCols, ...customColumns]

  tags._framework = {
    columns,
    rows: [],
  } as Framework

  return tags
}

/** Fill a framework row from parsed memory update. Falls back to old accumulate if no _framework. */
export function fillFrameworkRow(
  existingTags: Record<string, any>,
  parsed: ParsedMemoryUpdate,
  chapterRange: string,
  rawMemoryText: string,
): Record<string, any> {
  // Downward compatibility: fall back to old accumulate if no framework
  if (!existingTags._framework) {
    return accumulateMemoryData(existingTags, parsed, chapterRange, rawMemoryText)
  }

  const tags = { ...existingTags }
  const framework: Framework = JSON.parse(JSON.stringify(tags._framework))

  const cells: Record<string, string> = {}

  // Fill universal columns from parsed data
  cells['角色状态'] = parsed.characterChanges
    .map(c => `${c.name}：位置=${c.location || '?'}，情绪=${c.emotion || '?'}，能力=${c.abilities || '?'}，关系=${c.relationships || '?'}`)
    .join('；') || '—'

  cells['伏笔进度'] = parsed.foreshadowChanges
    .map(f => `#${f.id || '?'} ${f.status === 'planted' ? '已埋' : f.status === 'advanced' ? '推进中' : '已回收'}：${f.description}`)
    .join('；') || '—'

  cells['世界观揭示'] = parsed.revealedSettings.join('；') || '—'

  cells['时间线'] = parsed.timeline || '—'

  cells['未闭合线'] = parsed.newCharacters
    .map(c => `「${c.name}」(${c.role || '?'})：${c.relationship || '?'}`)
    .join('；')
  // Also include any foreshadow that was newly planted
  const newForeshadows = parsed.foreshadowChanges.filter(f => f.status === 'planted')
  if (newForeshadows.length > 0 && cells['未闭合线'] !== '—') {
    cells['未闭合线'] += '；' + newForeshadows.map(f => f.description.slice(0, 40)).join('；')
  }
  if (!cells['未闭合线'] || cells['未闭合线'] === '—') {
    cells['未闭合线'] = newForeshadows.map(f => f.description.slice(0, 40)).join('；') || '—'
  }

  // Genre-specific and custom columns remain empty — AI fills them via memory update
  // The raw text is still stored in _memoryUpdates for backward compatibility

  framework.rows.push({ chapterRange, cells })

  // Keep last 50 rows
  if (framework.rows.length > 50) {
    framework.rows = framework.rows.slice(-50)
  }

  tags._framework = framework

  // Also maintain old tracking data for backward compatibility
  tags._memoryUpdate = rawMemoryText
  const memoryUpdates: MemoryUpdateEntry[] = Array.isArray(tags._memoryUpdates)
    ? [...tags._memoryUpdates]
    : []
  const existingIdx = memoryUpdates.findIndex(m => m.chapterRange === chapterRange)
  if (existingIdx >= 0) {
    memoryUpdates[existingIdx] = { chapterRange, content: rawMemoryText }
  } else {
    memoryUpdates.push({ chapterRange, content: rawMemoryText })
  }
  tags._memoryUpdates = memoryUpdates.slice(-50)

  return tags
}

/** Build framework context string for prompt injection. Hybrid window: long-term foreshadows + recent detail. */
export function buildFrameworkContext(tags: Record<string, any>): string {
  const framework = tags._framework as Framework | undefined

  // Downward compatibility: fall back to old tracking tables
  if (!framework || !framework.columns || framework.rows.length === 0) {
    const tables = buildTrackingTables(tags)
    return [tables.foreshadowTable, tables.characterTable, tables.openThreads]
      .filter(Boolean)
      .join('\n')
  }

  let ctx = '## 框架追踪表（请逐行阅读以保持一致性）\n\n'

  // ── Long-term foreshadow overview: scan ALL rows ──
  const allForeshadows = extractForeshadowsFromFramework(framework)
  // Merge in initial foreshadows from world-gen that aren't in any row
  const initialFs: ForeshadowState[] = tags._foreshadowStates || []
  for (const f of initialFs) {
    const mentioned = allForeshadows.some(af => af.description.includes(f.name) || f.name.includes(af.description.slice(0, 20)))
    if (!mentioned) {
      const statusMap: Record<string, string> = { planted: '已埋', advanced: '推进中', resolved: '已回收' }
      allForeshadows.push({ description: f.name, status: statusMap[f.status] || f.status, chapter: f.chapterPlanted || 0 })
    }
  }
  const unresolvedForeshadows = allForeshadows.filter(f => f.status !== '已回收')
  if (unresolvedForeshadows.length > 0) {
    ctx += '### 长期伏笔总览（全量扫描，以下伏笔必须推进或回收）\n\n'
    ctx += '| # | 伏笔 | 状态 | 最后出现章节 |\n'
    ctx += '|---|------|------|------------|\n'
    for (let i = 0; i < unresolvedForeshadows.length; i++) {
      const f = unresolvedForeshadows[i]
      ctx += `| ${i + 1} | ${f.description.slice(0, 50)} | ${f.status} | ${f.chapter || '?'} |\n`
    }
    ctx += `\n**未回收伏笔共 ${unresolvedForeshadows.length} 条**：必须在当前篇章推进其中至少 1 条。\n\n`
  }

  // ── Open threads: scan ALL rows ──
  const allThreads = extractOpenThreadsFromFramework(framework)
  if (allThreads.length > 0) {
    ctx += '### 未闭合剧情线（全量扫描）\n'
    for (const t of allThreads.slice(0, 12)) {
      ctx += `- ${t}\n`
    }
    ctx += '\n'
  }

  // ── Recent detail: last 8 rows ──
  ctx += '### 近期追踪详情\n\n'
  const recentRows = framework.rows.slice(-8)
  for (const row of recentRows) {
    ctx += `#### 第${row.chapterRange}章\n`
    for (const col of framework.columns) {
      const val = row.cells[col]
      if (val && val !== '—') {
        ctx += `- **${col}**：${val}\n`
      }
    }
    ctx += '\n'
  }

  ctx += '**追踪维度**：' + framework.columns.join(' | ') + '\n'

  return ctx
}

// ── Framework data extractors ──

interface ForeshadowEntry { description: string; status: string; chapter: number }

function extractForeshadowsFromFramework(framework: Framework): ForeshadowEntry[] {
  const entries: ForeshadowEntry[] = []
  for (const row of framework.rows) {
    const val = row.cells['伏笔进度']
    if (!val || val === '—') continue
    const parts = val.split('；')
    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue
      let status = '已埋'
      if (trimmed.includes('已回收')) status = '已回收'
      else if (trimmed.includes('推进中')) status = '推进中'
      const desc = trimmed.replace(/#\S*\s*/, '').replace(/已埋|推进中|已回收/g, '').replace(/[：:]/g, '').trim()
      if (desc) {
        const chNum = parseInt(row.chapterRange.split('-')[0])
        entries.push({ description: desc, status, chapter: chNum || 0 })
      }
    }
  }
  return entries
}

function extractOpenThreadsFromFramework(framework: Framework): string[] {
  const threads: string[] = []
  for (const row of framework.rows) {
    const val = row.cells['未闭合线']
    if (!val || val === '—') continue
    const parts = val.split('；')
    for (const p of parts) {
      const t = p.trim()
      if (t && !threads.some(ex => ex.includes(t.slice(0, 10)))) {
        threads.push(t)
      }
    }
  }
  return threads
}

/** Extract character + foreshadow summary from framework for consistency check. Falls back to old arrays. */
export function extractTrackingSummary(tags: Record<string, any>): { foreshadowText: string; characterText: string } {
  const framework = tags._framework as Framework | undefined

  if (!framework || !framework.columns || framework.rows.length === 0) {
    // Fall back to old arrays
    let ft = ''
    const fs = tags._foreshadowStates
    if (fs && fs.length > 0) {
      for (const f of fs) {
        ft += `- #${f.id} ${f.name}：${f.status === 'planted' ? '待回收' : f.status === 'advanced' ? '推进中' : '已回收'} | ${f.progress || ''}\n`
      }
    }
    let ct = ''
    const cs = tags._characterStates
    if (cs && cs.length > 0) {
      for (const c of cs) {
        const latest = c.snapshots?.[c.snapshots.length - 1]
        if (latest) {
          ct += `- ${c.name}：位置=${latest.location || '?'} | 情绪=${latest.emotion || '?'} | 能力=${latest.abilities || '?'} | 关系=${latest.relationships || '?'}\n`
        }
      }
    }
    return { foreshadowText: ft, characterText: ct }
  }

  // Extract from framework: all rows for foreshadows, recent 10 rows for characters
  let ft = ''
  const allSeen = new Set<string>()
  for (const row of framework.rows) {
    const val = row.cells['伏笔进度']
    if (val && val !== '—') {
      for (const part of val.split('；')) {
        const t = part.trim()
        if (t && !allSeen.has(t.slice(0, 30))) {
          allSeen.add(t.slice(0, 30))
          ft += `- ${t}\n`
        }
      }
    }
  }

  // Also merge initial foreshadows
  const initialFs: ForeshadowState[] = tags._foreshadowStates || []
  for (const f of initialFs) {
    if (!allSeen.has(f.name.slice(0, 30))) {
      allSeen.add(f.name.slice(0, 30))
      const sm: Record<string, string> = { planted: '待回收', advanced: '推进中', resolved: '已回收' }
      ft += `- #${f.id} ${f.name}：${sm[f.status] || f.status} | ${f.progress || ''}\n`
    }
  }

  let ct = ''
  const recentRows = framework.rows.slice(-10)
  const seenChars = new Set<string>()
  for (const row of recentRows) {
    const val = row.cells['角色状态']
    if (val && val !== '—') {
      for (const part of val.split('；')) {
        const t = part.trim()
        if (t) {
          const nameMatch = t.match(/^(\S+)[：:]/)
          const name = nameMatch?.[1] || t.slice(0, 10)
          if (!seenChars.has(name)) {
            seenChars.add(name)
            ct += `- ${t}\n`
          }
        }
      }
    }
  }

  return { foreshadowText: ft, characterText: ct }
}

// ============================================================
// Consistency check — run every 10 chapters
// ============================================================
export async function runConsistencyCheck(
  chapters: { number: number; title: string; content: string; summary: string }[],
  tags: Record<string, any>,
  chapterRange: string,
): Promise<string> {
  const systemPrompt = buildBasePrompt()
  const chaptersText = chapters.map(c => `第${c.number}章 ${c.title}\n${c.summary || c.content.slice(0, 500)}`).join('\n\n---\n\n')
  const summary = extractTrackingSummary(tags)
  const userPrompt = buildConsistencyCheckPrompt(chaptersText, summary.foreshadowText, summary.characterText, chapterRange)

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  try {
    const response: any = await callDeepSeek(messages, false, 4000, 'consistency_check')
    return response.choices[0].message.content || ''
  } catch {
    return '（一致性检测暂时不可用）'
  }
}

export { generateTitle }
