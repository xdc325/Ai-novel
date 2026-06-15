import { verifyToken } from '../../../utils/auth'
import { buildBasePrompt, buildChapterPrompt } from '../../../services/generation/prompt'
import { buildMemoryContext, buildFrameworkContext, parseMemoryUpdate, fillFrameworkRow, runConsistencyCheck } from '../../../services/generation/engine'
import { generateReWOOPlan } from '../../../services/generation/rewoo'
import { runReflexion, buildReflexionContext } from '../../../services/generation/reflexion'
import { detectClimaxChapter, generateGoTBranches, evaluateGoTBranches, buildGoTContext } from '../../../services/generation/graph-of-thoughts'
import type { GoTBranch } from '../../../services/generation/graph-of-thoughts'
import prisma from '../../../utils/prisma'
import { getModelConfig } from '../../../utils/model'

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  if (!auth?.startsWith('Bearer ')) throw createError({ statusCode: 401, message: '请先登录' })
  const userId = await verifyToken(auth.slice(7))
  if (!userId) throw createError({ statusCode: 401, message: '登录已过期' })

  const novelId = getRouterParam(event, 'id')
  if (!novelId) throw createError({ statusCode: 400, message: '缺少小说ID' })

  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    include: { chapters: { orderBy: { number: 'asc' }, select: { number: true, title: true, content: true, summary: true, status: true } } },
  })

  if (!novel) throw createError({ statusCode: 404, message: '小说不存在' })
  if (novel.userId !== userId) throw createError({ statusCode: 403, message: '无权操作' })
  if (novel.type !== 'long') throw createError({ statusCode: 400, message: '仅支持长篇小说续写' })

  // Find next chapter number
  const completedChapters = novel.chapters.filter(c => c.status === 'completed')
  const nextChapterNumber = completedChapters.length + 1
  const nextChapterTitle = novel.chapters.find(c => c.number === nextChapterNumber)?.title || `第${nextChapterNumber}章`

  // Read planned chapters for writing inertia
  const plannedInertia: { number: number; title: string; firstChars: string }[] = []
  for (let offset = 0; offset < 2; offset++) {
    const planned = novel.chapters.find(c => c.number === nextChapterNumber + offset && c.status === 'planned')
    if (planned?.content) {
      plannedInertia.push({
        number: planned.number,
        title: planned.title,
        firstChars: planned.content.slice(0, 300),
      })
    }
  }

  // Build memory context
  const tags = novel.tags as any
  const previousChapters = completedChapters.map(c => ({
    number: c.number,
    title: c.title,
    summary: c.summary || c.content.slice(0, 200),
    endingHint: c.content.replace(/【记忆更新】[\s\S]*$/, '').slice(-400),
  }))

  // Build framework context (V2 unified table, auto-falls back to old tracking)
  const frameworkContext = buildFrameworkContext(tags || {})

  const memoryContext = buildMemoryContext({
    worldSetting: tags?._worldSetting || '',
    characters: tags?._characters || '',
    arcs: tags?._arcs || '',
    conflict: tags?._conflict || '',
    foreshadowing: tags?._foreshadowing || '',
    previousChapters: previousChapters.slice(-6), // Last 6 chapters for context
    previousMemoryUpdates: Array.isArray(tags?._memoryUpdates)
      ? tags._memoryUpdates.slice(-5).map((m: any) => m.content).filter(Boolean).join('\n')
      : (tags?._memoryUpdate || ''),
    frameworkContext,
  })

  // Read active instructions for prompt injection
  const allInstructions: any[] = Array.isArray(tags?._instructions) ? tags._instructions : []
  const activeInstructions = allInstructions.filter((i: any) =>
    (i.type === 'soft' && i.status === 'pending') ||
    (i.type === 'hard' && i.status === 'confirmed')
  )

  // ── Agent Framework: ReWOO planning, Reflexion lessons, GoT detection ──

  // ReWOO: lightweight planning step (Flash, ~300-500 tokens)
  const reflexionLessons = buildReflexionContext(
    Array.isArray(tags?._reflexionLessons) ? tags._reflexionLessons : []
  )
  const rewooPlan = (await generateReWOOPlan(nextChapterNumber, memoryContext, reflexionLessons || undefined)).planText

  // Graph of Thoughts: detect climax chapters
  let gotContext = ''
  let selectedGotBranch: GoTBranch | null = null
  const climaxCheck = detectClimaxChapter(nextChapterNumber, tags?._arcs || '')
  if (climaxCheck.isClimax) {
    const { branches } = await generateGoTBranches(nextChapterNumber, nextChapterTitle, memoryContext, plannedInertia.length > 0 ? plannedInertia : undefined)
    if (branches.length >= 2) {
      const evaluation = await evaluateGoTBranches(branches, nextChapterNumber, memoryContext)
      if (evaluation) {
        selectedGotBranch = branches.find(b => b.id === evaluation.selectedBranch) || branches[0]
        gotContext = buildGoTContext(selectedGotBranch)
      }
    }
  }

  // Set up SSE response
  setHeader(event, 'Content-Type', 'text/event-stream; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-cache')
  setHeader(event, 'Connection', 'keep-alive')
  setHeader(event, 'X-Accel-Buffering', 'no')

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: any) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        send({ type: 'meta', novelId: novel.id, title: novel.title, chapterNumber: nextChapterNumber })

        // Update novel status
        await prisma.novel.update({ where: { id: novel.id }, data: { status: 'generating' } })

        const systemPrompt = buildBasePrompt()
        const userPrompt = buildChapterPrompt(nextChapterNumber, nextChapterTitle, memoryContext, plannedInertia.length > 0 ? plannedInertia : undefined, activeInstructions.length > 0 ? activeInstructions : undefined, rewooPlan || undefined, gotContext || undefined)

        const contConfig = getModelConfig('chapter_gen')
        const response = await fetch(`${contConfig.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${contConfig.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: contConfig.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.85,
            max_tokens: 16000,
            stream: true,
          }),
        })

        if (!response.ok) {
          const errText = await response.text()
          send({ type: 'error', message: `API 错误: ${response.status}` })
          await prisma.novel.update({ where: { id: novel.id }, data: { status: 'ongoing' } })
          return
        }

        let fullContent = ''
        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta?.content
              if (delta) {
                fullContent += delta
                send({ type: 'chunk', content: delta })
              }
            } catch {}
          }
        }

        // Parse and save chapters — first 2 are final, next 2 are planned
        if (fullContent) {
          // Strip 【记忆更新】 section from display content before splitting
          const cleanContent = fullContent.replace(/【记忆更新】[\s\S]*$/, '').trim()
          // Split by chapter end markers: handles "---第3章完---", "---第3章完", "---\n第3章完"
          const parts = cleanContent.split(/\n*[-]{2,}\s*\n?\s*第\d+章.*?完\s*[-]*\n*/).map((p: string) => p.trim()).filter(Boolean)

          const saveChapter = async (i: number, status: 'completed' | 'planned') => {
            const content = parts[i]
            if (!content) return
            const chNumber = nextChapterNumber + i
            // Strip 【记忆更新】 from individual chapter content (in case it leaked)
            const titleMatch = content.match(/^#\s*第[^章]+章[：:\s]+(.+)/m)
            const chTitle = titleMatch?.[1]?.trim() || `第${chNumber}章`

            const existing = await prisma.chapter.findFirst({
              where: { novelId: novel.id, number: chNumber },
            })

            if (existing) {
              await prisma.chapter.update({
                where: { id: existing.id },
                data: { title: chTitle, content, status, summary: content.slice(0, 300) },
              })
            } else {
              await prisma.chapter.create({
                data: {
                  novelId: novel.id, number: chNumber, title: chTitle,
                  content, status, summary: content.slice(0, 300),
                },
              })
            }
          }

          // Save final chapters (0, 1) as completed
          await saveChapter(0, 'completed')
          await saveChapter(1, 'completed')
          // Save planned chapters (2, 3) as planned (for writing inertia next round)
          await saveChapter(2, 'planned')
          await saveChapter(3, 'planned')

          // Update word count (final chapters only)
          const finalContent = parts.slice(0, 2).join('')
          const totalContent = [...completedChapters.map(c => c.content), finalContent].join('')
          const wordCount = totalContent.replace(/\s/g, '').length
          await prisma.novel.update({
            where: { id: novel.id },
            data: { wordCount, status: 'ongoing' },
          })
        }

        // Save memory update — accumulate structured tracking data
        const memoryMatch = fullContent.match(/【记忆更新】\n([\s\S]*?)$/)
        const chapterRange = `${nextChapterNumber}-${nextChapterNumber + 1}`
        if (memoryMatch) {
          const currentTags = (await prisma.novel.findUnique({ where: { id: novel.id }, select: { tags: true } }))?.tags as any || {}
          const parsed = parseMemoryUpdate(memoryMatch[1], nextChapterNumber)
          const updatedTags = fillFrameworkRow(currentTags, parsed, chapterRange, memoryMatch[1])
          await prisma.novel.update({
            where: { id: novel.id },
            data: { tags: updatedTags as any },
          })
        }

        // Run consistency check every 10 chapters (at chapter 10, 20, 30, ...)
        let consistencyReport = ''
        // Trigger at each 10-chapter boundary (nextChapterNumber lands on 11, 21, 31...)
        if ((nextChapterNumber - 1) % 10 === 0) {
          const checkChapter = Math.floor(nextChapterNumber / 10) * 10
          if (checkChapter >= 10) {
            const checkStart = Math.max(1, checkChapter - 9)
            const checkRange = `${checkStart}-${checkChapter}`
            const recentChapters = completedChapters.filter(c => c.number >= checkStart && c.number <= checkChapter)
            if (recentChapters.length >= 3) {
              send({ type: 'status', message: `正在进行第${checkChapter}章一致性审阅...` })
              const currentTags = (await prisma.novel.findUnique({ where: { id: novel.id }, select: { tags: true } }))?.tags as any || {}
              consistencyReport = await runConsistencyCheck(
                recentChapters.map(c => ({ number: c.number, title: c.title, content: c.content || '', summary: c.summary || '' })),
                currentTags,
                checkRange,
              )
              // Save the consistency report
              const existingChecks = Array.isArray(currentTags._consistencyChecks) ? currentTags._consistencyChecks : []
              if (!existingChecks.find((c: any) => c.checkedAtChapter === checkChapter)) {
                existingChecks.push({ checkedAtChapter: checkChapter, report: consistencyReport, issues: [] })
              }
              await prisma.novel.update({
                where: { id: novel.id },
                data: { tags: { ...currentTags, _consistencyChecks: existingChecks.slice(-20) } as any },
              })
              if (consistencyReport) {
                send({ type: 'consistency', report: consistencyReport, chapter: checkChapter })
              }

              // Reflexion: if audit found issues, analyze root cause
              if (consistencyReport && (consistencyReport.includes('❌') || consistencyReport.includes('⚠️'))) {
                send({ type: 'status', message: '正在反思一致性问题根因...' })
                const { updatedLessons } = await runReflexion(
                  consistencyReport,
                  checkRange,
                  recentChapters.map(c => ({ number: c.number, title: c.title, summary: c.summary || c.content.slice(0, 300) })),
                  currentTags,
                )
                // Save reflexion lessons
                const tagsWithLessons = {
                  ...(await prisma.novel.findUnique({ where: { id: novel.id }, select: { tags: true } }))?.tags as any || {},
                  _reflexionLessons: updatedLessons,
                }
                await prisma.novel.update({
                  where: { id: novel.id },
                  data: { tags: tagsWithLessons as any },
                })
              }
            }
          }
        }

        // Mark active instructions as applied
        if (activeInstructions.length > 0) {
          const latestTags = (await prisma.novel.findUnique({ where: { id: novel.id }, select: { tags: true } }))?.tags as any || {}
          const instrs: any[] = Array.isArray(latestTags?._instructions) ? [...latestTags._instructions] : []
          let changed = false
          for (const inst of instrs) {
            if ((inst.type === 'soft' && inst.status === 'pending') || (inst.type === 'hard' && inst.status === 'confirmed')) {
              inst.status = 'applied'
              inst.chapterApplied = nextChapterNumber
              changed = true
            }
          }
          if (changed) {
            await prisma.novel.update({
              where: { id: novel.id },
              data: { tags: { ...latestTags, _instructions: instrs } as any },
            })
          }
        }

        send({ type: 'done', hasMore: true, nextChapter: nextChapterNumber + 2, message: '点击继续生成下一批章节' })

      } catch (err: any) {
        send({ type: 'error', message: err.message || '生成失败' })
        await prisma.novel.update({ where: { id: novel.id }, data: { status: 'ongoing' } }).catch(() => {})
      } finally {
        controller.close()
      }
    },
  })

  return sendStream(event, stream)
})
