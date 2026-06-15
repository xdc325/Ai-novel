import { verifyToken } from '../../../utils/auth'
import { buildBasePrompt } from '../../../services/generation/prompt'
import prisma from '../../../utils/prisma'
import { getModelConfig } from '../../../utils/model'

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  if (!auth?.startsWith('Bearer ')) throw createError({ statusCode: 401, message: '请先登录' })
  const userId = await verifyToken(auth.slice(7))
  if (!userId) throw createError({ statusCode: 401, message: '登录已过期' })

  const novelId = getRouterParam(event, 'id')
  if (!novelId) throw createError({ statusCode: 400, message: '缺少小说ID' })

  const body = await readBody(event)
  const type = body.type as string
  const content = (body.content as string)?.trim()

  if (!type || !['soft', 'hard'].includes(type)) throw createError({ statusCode: 400, message: '指令类型必须是 soft 或 hard' })
  if (!content || content.length < 5) throw createError({ statusCode: 400, message: '指令内容至少5个字' })
  if (content.length > 2000) throw createError({ statusCode: 400, message: '指令内容不能超过2000字' })

  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    include: { chapters: { orderBy: { number: 'asc' }, select: { number: true, title: true, content: true, summary: true, status: true } } },
  })

  if (!novel) throw createError({ statusCode: 404, message: '小说不存在' })
  if (novel.userId !== userId) throw createError({ statusCode: 403, message: '无权操作' })
  if (novel.type !== 'long') throw createError({ statusCode: 400, message: '仅支持长篇小说中途指令' })

  const tags = (novel.tags || {}) as Record<string, any>
  const instructions: any[] = Array.isArray(tags._instructions) ? [...tags._instructions] : []

  const instruction: any = {
    id: `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    content,
    status: 'pending',
    chapterApplied: null,
    createdAt: new Date().toISOString(),
  }

  // For hard instructions: run impact assessment first
  if (type === 'hard') {
    const completedChapters = novel.chapters.filter(c => c.status === 'completed')
    if (completedChapters.length === 0) {
      // No chapters yet — can't assess, just store
      instruction.status = 'pending'
      instruction.impactAssessment = '（尚无已完成的章节，无法进行影响评估。将在下一轮续写时作为硬指令注入。）'
    } else {
      // Build impact assessment prompt
      const chaptersSample = completedChapters.slice(-10).map(c =>
        `第${c.number}章 ${c.title}\n${c.summary || c.content.slice(0, 400)}`
      ).join('\n\n')

      const worldSetting = tags._worldSetting || ''
      const characters = tags._characters || ''
      const arcs = tags._arcs || ''
      const foreshadowing = tags._foreshadowing || ''

      const assessmentPrompt = `你是一位资深小说编辑。用户正在创作一部长篇小说，现在用户希望做出以下设定变更。请评估此变更对已有章节的影响。

## 当前小说信息

### 世界观
${worldSetting.slice(0, 800)}

### 角色档案
${characters.slice(0, 600)}

### 篇章规划
${arcs.slice(0, 600)}

### 伏笔计划
${foreshadowing.slice(0, 400)}

### 已写章节摘要
${chaptersSample}

## 用户提出的设定变更
${content}

## 评估要求
请从以下角度分析此变更的影响：

1. **角色一致性**：已有角色的行为、性格、关系是否需要调整？哪些具体章节/情节会受影响？
2. **伏笔影响**：已埋设的伏笔中，哪些会被此变更破坏或需要修改？
3. **情节连贯性**：已有事件的时间线、因果关系是否会断裂？
4. **世界观一致性**：此变更是否符合已有世界观设定？如有冲突，冲突点在哪里？
5. **建议方案**：如果变更确实需要，如何最小化对已有内容的影响？是否有折中方案？

请用中文输出，条理清晰，便于用户决策。如果变更影响较小，也应明确说明"影响可控"。
在报告末尾，用单独一行给出总结：**总体评估：影响较小 / 影响中等 / 影响较大，需谨慎**。`

      try {
        const config = getModelConfig('impact_assessment')
        const response = await $fetch(`${config.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: {
            model: config.model,
            messages: [
              { role: 'system', content: buildBasePrompt() },
              { role: 'user', content: assessmentPrompt },
            ],
            temperature: 0.6,
            max_tokens: 4000,
          },
        })

        const assessment = (response as any).choices?.[0]?.message?.content || '（影响评估暂时不可用）'
        instruction.impactAssessment = assessment
      } catch (err: any) {
        instruction.impactAssessment = `（影响评估失败：${err.message || '未知错误'}。指令已保存，可在后续手动确认执行。）`
      }
    }
  }

  instructions.push(instruction)

  // Keep last 100 instructions
  const trimmed = instructions.slice(-100)

  await prisma.novel.update({
    where: { id: novel.id },
    data: { tags: { ...tags, _instructions: trimmed } as any },
  })

  return {
    instruction,
    assessment: instruction.impactAssessment || null,
  }
})
