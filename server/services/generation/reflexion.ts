// ============================================================
// Reflexion — 一致性审计失败后反思根因，累积教训
// 每一轮反思产生"教训"存入 _reflexionLessons，注入后续 prompt
// ============================================================

import { getModelConfig } from '../../utils/model'

export interface ReflexionResult {
  /** Root cause analysis */
  rootCause: string
  /** Concrete lessons learned */
  lessons: string[]
  /** Suggested prompt strategy adjustment */
  promptAdjustment: string
  /** Severity — how urgently this needs to be addressed */
  severity: 'low' | 'medium' | 'high'
}

export interface ReflexionLesson {
  chapter: number
  rootCause: string
  lessons: string[]
  promptAdjustment: string
  severity: string
}

/**
 * Run reflexion when consistency audit finds issues.
 * Uses Pro model for deep root-cause analysis.
 */
export async function runReflexion(
  auditReport: string,
  chapterRange: string,
  recentChapters: { number: number; title: string; summary: string }[],
  tags: Record<string, any>,
): Promise<{ result: ReflexionResult; updatedLessons: ReflexionLesson[] }> {
  const chaptersText = recentChapters.map(c =>
    `第${c.number}章 ${c.title}：${c.summary}`
  ).join('\n')

  const worldSetting = tags._worldSetting?.slice(0, 600) || ''
  const characters = tags._characters?.slice(0, 400) || ''

  const reflexionPrompt = `你是一位资深小说编辑，需要对一致性审计发现的问题进行根因分析。

## 审计报告
${auditReport}

## 受影响章节
${chaptersText}

## 小说设定参考
世界观：${worldSetting}
角色：${characters}

## 反思要求

请深入分析以下问题：

### 1. 根因分析
这些问题不是偶然的。请找出导致一致性问题的根本原因。是以下哪种（可多选）：
- 世界观设定本身有内在矛盾
- AI 缺乏足够的前文背景（记忆库信息不完整）
- 角色弧线设计有问题（成长路线不清晰）
- 伏笔系统杂乱（埋太多、回收不及时）
- 叙事节奏导致的信息断层

### 2. 具体教训（每条一句话，3-5条）
格式："教训：XXX"

### 3. Prompt 调整建议
基于以上分析，后续续写时应该在 prompt 中增加什么约束或提醒？写一段可以直接注入 prompt 的指导性文字。

### 4. 严重程度
给一个总体判断：低（不影响主线）/ 中（需要下轮纠正）/ 高（必须立即处理）

## 输出格式要求
请在末尾单独一行输出严重程度，格式固定为：
【严重程度】高
或
【严重程度】中
或
【严重程度】低

请紧凑输出，不要写废话。`

  try {
    const config = getModelConfig('reflexion')
    const response = await $fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: config.model,
        messages: [
          { role: 'system', content: '你是一位犀利的文学编辑，擅长找出问题的根本原因而非表面症状。' },
          { role: 'user', content: reflexionPrompt },
        ],
        temperature: 0.5,
        max_tokens: 3000,
      },
    })

    const rawText = (response as any).choices?.[0]?.message?.content || ''

    // Parse result
    const rootCause = extractSection(rawText, '根因分析')
    const lessons = extractList(rawText, '教训')
    const promptAdjustment = extractSection(rawText, '调整建议') || extractSection(rawText, 'Prompt')

    let severity: 'low' | 'medium' | 'high' = 'medium'
    const severityMatch = rawText.match(/【严重程度】\s*(高|中|低)/)
    if (severityMatch) {
      if (severityMatch[1] === '高') severity = 'high'
      else if (severityMatch[1] === '低') severity = 'low'
    }

    const result: ReflexionResult = {
      rootCause: rootCause || '（无法确定根因）',
      lessons: lessons.length > 0 ? lessons : ['需要加强对前文设定的回顾'],
      promptAdjustment: promptAdjustment || '请在创作前仔细核对角色状态表和伏笔追踪表。',
      severity,
    }

    // Accumulate lessons in tags
    const chapterNum = parseInt(chapterRange.split('-')[0])
    const existingLessons: ReflexionLesson[] = Array.isArray(tags._reflexionLessons)
      ? tags._reflexionLessons
      : []

    existingLessons.push({
      chapter: chapterNum,
      rootCause: result.rootCause,
      lessons: result.lessons,
      promptAdjustment: result.promptAdjustment,
      severity: result.severity,
    })

    // Keep last 20 lessons; older ones are less relevant
    const updatedLessons = existingLessons.slice(-20)

    return { result, updatedLessons }
  } catch {
    return {
      result: {
        rootCause: '（反思分析暂时不可用）',
        lessons: ['请人工检查一致性问题的来源'],
        promptAdjustment: '',
        severity: 'medium',
      },
      updatedLessons: Array.isArray(tags._reflexionLessons) ? tags._reflexionLessons : [],
    }
  }
}

/** Format accumulated reflexion lessons for prompt injection */
export function buildReflexionContext(lessons: ReflexionLesson[]): string {
  if (!lessons || lessons.length === 0) return ''

  // Only include medium+ severity, last 5
  const relevant = lessons
    .filter(l => l.severity === 'high' || l.severity === 'medium')
    .slice(-5)

  if (relevant.length === 0) return ''

  let ctx = '## 历史反思教训（必须吸取）\n\n'
  ctx += '以下是之前一致性审计中发现的模式问题及应对策略。请在本轮创作中避免重蹈覆辙：\n\n'

  for (const l of relevant) {
    ctx += `### 第${l.chapter}章审计反思\n`
    ctx += `- 根因：${l.rootCause}\n`
    for (const lesson of l.lessons) {
      ctx += `- 教训：${lesson}\n`
    }
    if (l.promptAdjustment) {
      ctx += `- 执行策略：${l.promptAdjustment}\n`
    }
    ctx += '\n'
  }

  return ctx
}

// ── Parse helpers ──

function extractSection(text: string, label: string): string {
  const idx = text.indexOf(label)
  if (idx < 0) return ''
  const after = text.slice(idx + label.length).replace(/^[：:]\s*/, '')
  // Take until next numbered section or end
  const nextMatch = after.match(/\n\s*###\s*\d/)
  if (nextMatch && nextMatch.index !== undefined) {
    return after.slice(0, nextMatch.index).trim()
  }
  // Take until double newline or end
  const doubleBreak = after.indexOf('\n\n')
  if (doubleBreak >= 0) return after.slice(0, doubleBreak).trim()
  return after.trim()
}

function extractList(text: string, label: string): string[] {
  const section = extractSection(text, label)
  if (!section) {
    // Try to match lines containing the label
    const items: string[] = []
    for (const line of text.split('\n')) {
      if (line.includes('教训') && line.includes('：')) {
        items.push(line.split(/[：:]/).slice(1).join(':').trim())
      }
    }
    return items
  }
  const items: string[] = []
  for (const line of section.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.match(/^\d+[\.\)]/)) {
      const item = trimmed.replace(/^[-•\d]+[\.\)]\s*/, '').trim()
      if (item) items.push(item)
    }
  }
  return items
}
