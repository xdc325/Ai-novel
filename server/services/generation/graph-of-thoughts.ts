// ============================================================
// Graph of Thoughts — 关键节点多路径探索与评估
// 仅在篇章转折、高潮章节、伏笔回收点启用（约占 5-10% 的续写轮次）
// ============================================================

import { getModelConfig } from '../../utils/model'

export interface GoTBranch {
  id: number
  direction: string
  summary: string
  pros: string[]
  cons: string[]
}

interface GoTEvaluation {
  selectedBranch: number
  reasoning: string
  scores: { branchId: number; coherence: number; tension: number; originality: number; total: number }[]
}

/**
 * Detect if current chapter is a climax or arc-transition chapter.
 * Criteria: arc boundary (first/last 3 chapters of an arc), user-marked, or every ~30 chapters.
 */
export function detectClimaxChapter(
  chapterNumber: number,
  arcs: string,
): { isClimax: boolean; reason: string } {
  // Every 30 chapters is a natural arc boundary
  if (chapterNumber > 5 && chapterNumber % 30 === 0) {
    return { isClimax: true, reason: `第${chapterNumber}章为30章节点，建议多路径探索` }
  }
  if (chapterNumber > 5 && chapterNumber % 30 <= 2) {
    return { isClimax: true, reason: `第${chapterNumber}章靠近30章节点，建议多路径探索` }
  }

  // Check if near arc boundaries from stored arcs data
  try {
    const arcsList = typeof arcs === 'string' ? JSON.parse(arcs) : arcs
    if (Array.isArray(arcsList)) {
      for (const arc of arcsList) {
        const rangeMatch = arc.chapterRange?.match(/(\d+)[-~—–]\s*(\d+)/)
        if (rangeMatch) {
          const start = parseInt(rangeMatch[1])
          const end = parseInt(rangeMatch[2])
          // First 3 or last 3 chapters of an arc are transition points
          if (chapterNumber >= start && chapterNumber <= start + 2) {
            return { isClimax: true, reason: `进入新篇章「${arc.name}」，建议多路径探索` }
          }
          if (chapterNumber >= end - 2 && chapterNumber <= end) {
            return { isClimax: true, reason: `篇章「${arc.name}」收束节点，建议多路径探索` }
          }
        }
      }
    }
  } catch {}

  return { isClimax: false, reason: '' }
}

/**
 * Generate 2-3 alternative narrative branches for a key chapter.
 * Uses Pro model for creative exploration.
 */
export async function generateGoTBranches(
  chapterNumber: number,
  chapterTitle: string,
  memoryContext: string,
  plannedChapters?: { number: number; title: string; firstChars: string }[],
): Promise<{ branches: GoTBranch[]; rawText: string }> {
  let inertiaSection = ''
  if (plannedChapters && plannedChapters.length > 0) {
    inertiaSection = '\n## 写作惯性\n'
    for (const pc of plannedChapters) {
      inertiaSection += `已规划第${pc.number}章方向：${pc.firstChars.slice(0, 200)}\n`
    }
  }

  const gotPrompt = `你是一位创意小说家。第${chapterNumber}章「${chapterTitle}」是一个关键节点，需要你探索 3 条不同的叙事走向。

【记忆库】
${memoryContext.slice(0, 5000)}${inertiaSection}

## 要求
请为第${chapterNumber}章构思3条有本质区别的叙事方向。每条方向：
- 给出方向名称（不超过10个字）
- 用3-5句话概括该方向下本章会发生什么
- 列出2个优点和2个缺点
- 方向之间的差异应该足够大（不同的冲突推进方式、不同的角色选择、不同的信息揭示顺序）

### 评估标准
- 连贯性：与已有章节设定一致
- 张力：制造悬念和冲突的能力
- 原创性：不是套路化的发展

请按以下格式输出：
【方向1】名称
概述：XXX
优点：XXX | XXX
缺点：XXX | XXX

【方向2】名称
概述：XXX
优点：XXX | XXX
缺点：XXX | XXX

【方向3】名称
概述：XXX
优点：XXX | XXX
缺点：XXX | XXX`

  try {
    const config = getModelConfig('climax_chapter')
    const response = await $fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: config.model,
        messages: [
          { role: 'system', content: '你是一位富有创造力的小说家，擅长在关键情节节点构思多种可能性。' },
          { role: 'user', content: gotPrompt },
        ],
        temperature: 0.9,
        max_tokens: 4000,
      },
    })

    const rawText = (response as any).choices?.[0]?.message?.content || ''
    const branches = parseBranches(rawText)

    return { branches, rawText }
  } catch {
    return { branches: [], rawText: '' }
  }
}

/**
 * Evaluate branches and select the best one.
 * Uses Pro model for evaluation.
 */
export async function evaluateGoTBranches(
  branches: GoTBranch[],
  chapterNumber: number,
  memoryContext: string,
): Promise<GoTEvaluation | null> {
  if (branches.length < 2) return null

  const branchesText = branches.map(b =>
    `【方向${b.id}】${b.direction}\n概述：${b.summary}\n优点：${b.pros.join(' | ')}\n缺点：${b.cons.join(' | ')}`
  ).join('\n\n')

  const evalPrompt = `你是一位资深编辑，请为第${chapterNumber}章选择最佳叙事方向。

## 候选方向
${branchesText}

## 评估标准
请从以下维度给每个方向打分（1-10分）：
- 连贯性：是否与已有设定和前文一致
- 张力：能否制造有效的悬念和冲突
- 原创性：是否避免了套路化发展

## 输出格式
对每个方向给出三项分数和简短理由，最后选择最佳方向并解释原因。

【评估结果】
方向1：连贯性=X 张力=X 原创性=X（总分=X/30）— 理由
方向2：连贯性=X 张力=X 原创性=X（总分=X/30）— 理由
方向3：连贯性=X 张力=X 原创性=X（总分=X/30）— 理由

【选择】方向X — （一句话原因）`

  try {
    const config = getModelConfig('got_evaluate')
    const response = await $fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: config.model,
        messages: [
          { role: 'system', content: '你是一位严谨的文学编辑，公正、细致地评估每条叙事路径。' },
          { role: 'user', content: evalPrompt },
        ],
        temperature: 0.4,
        max_tokens: 2000,
      },
    })

    const rawText = (response as any).choices?.[0]?.message?.content || ''
    return parseEvaluation(rawText, branches)
  } catch {
    // On evaluation failure, default to first branch
    return {
      selectedBranch: 1,
      reasoning: '（评估不可用，默认选择方向1）',
      scores: [],
    }
  }
}

/**
 * Build the prompt injection for the selected GoT branch.
 */
export function buildGoTContext(branch: GoTBranch): string {
  if (!branch) return ''

  return `## 叙事方向选择（Graph of Thoughts）

经过多路径探索与评估，本轮选定的叙事方向为：

**${branch.direction}**
> ${branch.summary}

请在创作中贯彻此方向，特别是利用以下优点：
${branch.pros.map(p => `- ${p}`).join('\n')}

注意规避以下风险：
${branch.cons.map(c => `- ${c}`).join('\n')}
`
}

// ── Parse helpers ──

function parseBranches(rawText: string): GoTBranch[] {
  const branches: GoTBranch[] = []
  const blocks = rawText.split(/【方向(\d+)】/)

  for (let i = 1; i < blocks.length; i += 2) {
    const id = parseInt(blocks[i])
    const content = blocks[i + 1] || ''

    const nameMatch = content.match(/^([^\n]+)/)
    const direction = nameMatch?.[1]?.trim() || `方向${id}`

    const summaryMatch = content.match(/概述[：:]\s*([\s\S]*?)(?=优点[：:]|$)/)
    const summary = summaryMatch?.[1]?.trim() || ''

    const prosMatch = content.match(/优点[：:]\s*([\s\S]*?)(?=缺点[：:]|$)/)
    const pros = (prosMatch?.[1] || '').split('|').map(s => s.trim()).filter(Boolean)

    const consMatch = content.match(/缺点[：:]\s*([\s\S]*?)(?=【|$)/)
    const cons = (consMatch?.[1] || '').split('|').map(s => s.trim()).filter(Boolean)

    if (summary) {
      branches.push({ id, direction, summary, pros, cons })
    }
  }

  return branches
}

function parseEvaluation(rawText: string, branches: GoTBranch[]): GoTEvaluation {
  const scores: GoTEvaluation['scores'] = []

  for (const b of branches) {
    const pattern = new RegExp(`方向${b.id}[：:].*?连贯性[=＝]?(\\d+).*?张力[=＝]?(\\d+).*?原创性[=＝]?(\\d+)`)
    const match = rawText.match(pattern)
    if (match) {
      const coherence = parseInt(match[1]) || 0
      const tension = parseInt(match[2]) || 0
      const originality = parseInt(match[3]) || 0
      scores.push({ branchId: b.id, coherence, tension, originality, total: coherence + tension + originality })
    }
  }

  // Find selected branch
  const selectMatch = rawText.match(/【选择】[：:]?\s*方向(\d+)/)
  const selectedBranch = selectMatch ? parseInt(selectMatch[1]) : 1

  const reasoningMatch = rawText.match(/【选择】[：:]?\s*方向\d+\s*[—–-]\s*(.+)/)
  const reasoning = reasoningMatch?.[1]?.trim() || ''

  return { selectedBranch, reasoning, scores }
}
