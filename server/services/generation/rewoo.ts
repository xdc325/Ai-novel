// ============================================================
// ReWOO (Reasoning Without Observation) — 规划先行，批量执行
// 每轮续写前用 Flash 做轻量规划，节省中间思考链的 token 消耗
// ============================================================

import { getModelConfig } from '../../utils/model'

interface ReWOOPlan {
  /** Which foreshadows to advance or resolve this round */
  foreshadowMoves: string[]
  /** Character state directions — who changes, how, why */
  characterBeats: string[]
  /** Worldbuilding elements to reveal to the reader */
  settingReveals: string[]
  /** Concrete plot beats that must happen in these 2 chapters */
  plotBeats: string[]
  /** What to avoid — things that would contradict established facts */
  guardrails: string[]
}

function formatPlan(plan: ReWOOPlan): string {
  let p = '## 本轮创作计划（ReWOO 规划）\n\n'
  p += '请按以下计划推进本批4章。计划提供方向框架，具体细节由你发挥：\n\n'

  if (plan.plotBeats.length > 0) {
    p += '### 必须覆盖的情节节拍\n'
    for (const beat of plan.plotBeats) p += `- ${beat}\n`
    p += '\n'
  }

  if (plan.foreshadowMoves.length > 0) {
    p += '### 伏笔推进目标\n'
    for (const f of plan.foreshadowMoves) p += `- ${f}\n`
    p += '\n'
  }

  if (plan.characterBeats.length > 0) {
    p += '### 角色状态变化\n'
    for (const c of plan.characterBeats) p += `- ${c}\n`
    p += '\n'
  }

  if (plan.settingReveals.length > 0) {
    p += '### 世界观揭示\n'
    for (const s of plan.settingReveals) p += `- ${s}\n`
    p += '\n'
  }

  if (plan.guardrails.length > 0) {
    p += '### 禁止事项（不可违反）\n'
    for (const g of plan.guardrails) p += `- ${g}\n`
    p += '\n'
  }

  return p
}

/**
 * Generate a lightweight planning step before each continue round.
 * Uses Flash (cheap) — ~300-500 tokens output.
 */
export async function generateReWOOPlan(
  chapterNumber: number,
  memoryContext: string,
  reflexionLessons?: string,
): Promise<{ planText: string; plan: ReWOOPlan }> {
  const lessonSection = reflexionLessons
    ? `\n## 历史反思教训（必须吸取）\n${reflexionLessons}\n`
    : ''

  const planningPrompt = `你是一位小说创作规划师。在正式写作前，请为第${chapterNumber}-${chapterNumber + 1}章（及其后续2章规划版）制定简洁的创作计划。

【记忆库】
${memoryContext.slice(0, 4000)}${lessonSection}

## 规划要求

请分析记忆库后，输出一个结构化的4步计划。每步只写关键要点，不要展开细节：

### 1. 情节节拍（必须有3-5个）
列出本章必须发生的具体事件。每个节拍一句话。
- 必须推进主线冲突至少一步
- 至少一个节拍制造新悬念

### 2. 伏笔推进
从记忆库中的伏笔追踪表选择 1-2 条未回收伏笔，写明如何推进或回收。
- 如果所有伏笔都已推进过一轮，可以埋新伏笔

### 3. 角色状态变化
列出本轮中状态会发生变化的主要角色（最多3人）。
- 位置/情绪/能力/关系中至少一项有情节支撑的变化

### 4. 世界观揭示
本轮应该向读者展示哪些之前未揭示的世界观信息？（最多2条）

### 5. 禁止事项
根据记忆库中的"已写章节摘要"，列出本轮绝对不能做的事：
- 不要重复已写过的具体场景/对话/事件
- 不要让角色做出与当前状态矛盾的行为

请用紧凑格式输出，每行以"- "开头，共15-25行。不要写完整的段落。`

  try {
    const config = getModelConfig('rewoo_plan')
    const response = await $fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: config.model,
        messages: [
          { role: 'system', content: '你是一位高效的小说创作规划师。输出简洁、具体、可执行的创作计划。只输出要点，不展开论述。' },
          { role: 'user', content: planningPrompt },
        ],
        temperature: 0.6,
        max_tokens: 2000,
      },
    })

    const rawText = (response as any).choices?.[0]?.message?.content || ''

    // Parse the plan text into structured form
    const plan: ReWOOPlan = {
      plotBeats: parseSection(rawText, '情节节拍'),
      foreshadowMoves: parseSection(rawText, '伏笔推进'),
      characterBeats: parseSection(rawText, '角色状态变化'),
      settingReveals: parseSection(rawText, '世界观揭示'),
      guardrails: parseSection(rawText, '禁止事项'),
    }

    return { planText: formatPlan(plan), plan }
  } catch {
    // Plan failure is non-fatal — return empty plan
    return { planText: '', plan: { plotBeats: [], foreshadowMoves: [], characterBeats: [], settingReveals: [], guardrails: [] } }
  }
}

function parseSection(text: string, label: string): string[] {
  const lines = text.split('\n')
  const items: string[] = []
  let inSection = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) { inSection = false; continue }

    // Detect section header: "### 1. 情节节拍" or "情节节拍："
    if (trimmed.includes(label)) {
      inSection = true
      // Check if the header itself contains a list item
      const afterColon = trimmed.split(/[：:]/).slice(1).join(':').trim()
      if (afterColon && afterColon.startsWith('-')) {
        items.push(afterColon.replace(/^-\s*/, '').trim())
      }
      continue
    }

    if (inSection && (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.match(/^\d+[\.\)]/))) {
      const item = trimmed.replace(/^[-•\d]+[\.\)]\s*/, '').trim()
      if (item && !item.startsWith('#')) {
        items.push(item)
      }
    }
  }

  // If no items found with section headers, try loose parsing
  if (items.length === 0 && text.includes(label)) {
    const idx = text.indexOf(label)
    const after = text.slice(idx + label.length)
    for (const line of after.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
        items.push(trimmed.replace(/^[-•]\s*/, '').trim())
      }
    }
  }

  return items.slice(0, 12)
}
