import { verifyToken } from '../../utils/auth'
import { buildBasePrompt, buildShortStoryPrompt, buildFirstChaptersPrompt } from '../../services/generation/prompt'
import { generateTitle, generateLongStoryWorld, generateFirstChapters, parseInitialForeshadowing, parseMemoryUpdate, initFramework, fillFrameworkRow } from '../../services/generation/engine'
import prisma from '../../utils/prisma'
import { getModelConfig } from '../../utils/model'

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  if (!auth?.startsWith('Bearer ')) throw createError({ statusCode: 401, message: '请先登录' })
  const userId = await verifyToken(auth.slice(7))
  if (!userId) throw createError({ statusCode: 401, message: '登录已过期' })

  const params = await readBody(event)
  if (!params.worldview) throw createError({ statusCode: 400, message: '请选择世界观' })

  const title = generateTitle(params)
  const isLong = params.type === 'long'

  // Create novel record
  const novel = await prisma.novel.create({
    data: {
      userId,
      title,
      summary: '',
      type: isLong ? 'long' : 'short',
      tags: params,
      status: 'generating',
    },
  })

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
        send({ type: 'meta', novelId: novel.id, title, novelType: isLong ? 'long' : 'short' })

        if (isLong) {
          // === LONG NOVEL: Generate world first, then first 2 chapters ===
          send({ type: 'status', message: '正在构建世界观和大纲...' })

          const world = await generateLongStoryWorld(params, title)

          // Save world outline as chapter entries (35 placeholder chapters for first arc)
          for (const ch of world.chapterOutlines) {
            await prisma.chapter.create({
              data: {
                novelId: novel.id,
                number: ch.number,
                title: ch.title,
                content: '',
                status: 'draft',
                summary: ch.summary,
              },
            })
          }

          // Parse initial foreshadow states from world generation
          const initialForeshadowStates = parseInitialForeshadowing(world.foreshadowing)

          // Save world data to novel (including context for later continuation)
          let initTags: any = {
            ...params,
            _worldSetting: world.worldSetting,
            _characters: world.characters,
            _arcs: JSON.stringify(world.arcs || []),
            _conflict: world.conflict,
            _foreshadowing: world.foreshadowing,
            _rawWorldContext: world.rawWorldContext,
            _foreshadowStates: initialForeshadowStates,
            _characterStates: [],
            _openThreads: [],
            _memoryUpdates: [],
            _consistencyChecks: [],
          }
          // Initialize V2 framework table from worldview tags
          initTags = initFramework(initTags, params.worldview || '', params.customColumns || [])

          await prisma.novel.update({
            where: { id: novel.id },
            data: {
              summary: world.worldSetting.slice(0, 500),
              status: 'ongoing',
              tags: initTags as any,
            },
          })

          send({ type: 'status', message: '开始创作第1-2章...' })

          const systemPrompt = buildBasePrompt()
          const userPrompt = buildFirstChaptersPrompt(params, title, world.rawWorldContext)

          // Call DeepSeek with streaming
          const chapterConfig = getModelConfig('chapter_gen')
          const response = await fetch(`${chapterConfig.baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${chapterConfig.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: chapterConfig.model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.85,
              max_tokens: 10000,
              stream: true,
            }),
          })

          if (!response.ok) {
            const errText = await response.text()
            send({ type: 'error', message: `API 错误: ${response.status}` })
            await prisma.novel.update({ where: { id: novel.id }, data: { status: 'failed' } })
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

          // Parse and save chapters 1-2 from fullContent
          if (fullContent) {
            // Strip 【记忆更新】 section from display content before splitting
            const cleanContent = fullContent.replace(/【记忆更新】[\s\S]*$/, '').trim()
            // Split by chapter end markers: handles "---第1章完---", "---第1章完", "---\n第1章完"
            const parts = cleanContent.split(/\n*[-]{2,}\s*\n?\s*第\d+章.*?完\s*[-]*\n*/).map((p: string) => p.trim()).filter(Boolean)
            for (let i = 0; i < parts.length && i < 2; i++) {
              const content = parts[i].trim()
              if (content) {
                const titleMatch = content.match(/^#\s*第[^章]+章[：:\s]+(.+)/m)
                const chTitle = titleMatch?.[1]?.trim() || `第${i + 1}章`
                const chNumber = i + 1

                // Update the existing draft chapter or create new
                const existing = await prisma.chapter.findFirst({
                  where: { novelId: novel.id, number: chNumber },
                })
                if (existing) {
                  await prisma.chapter.update({
                    where: { id: existing.id },
                    data: { title: chTitle, content, status: 'completed', summary: content.slice(0, 300) },
                  })
                } else {
                  await prisma.chapter.create({
                    data: {
                      novelId: novel.id, number: chNumber, title: chTitle,
                      content, status: 'completed', summary: content.slice(0, 300),
                    },
                  })
                }
              }
            }

            // Update total word count
            const wordCount = fullContent.replace(/\s/g, '').length
            await prisma.novel.update({
              where: { id: novel.id },
              data: { wordCount },
            })
          }

          // Save memory update — fill V2 framework row (auto-falls back to old logic)
          const memoryMatch = fullContent.match(/【记忆更新】\n([\s\S]*?)$/)
          if (memoryMatch) {
            const currentNovel = await prisma.novel.findUnique({ where: { id: novel.id }, select: { tags: true } })
            const existingTags = (currentNovel?.tags || {}) as Record<string, any>
            const parsed = parseMemoryUpdate(memoryMatch[1], 1)
            const updatedTags = fillFrameworkRow(existingTags, parsed, '1-2', memoryMatch[1])
            await prisma.novel.update({
              where: { id: novel.id },
              data: { tags: updatedTags as any },
            })
          }

          send({ type: 'done', hasMore: true, message: '前2章已完成，点击"继续生成"创作下一批章节' })

        } else {
          // === SHORT STORY: existing flow ===
          const systemPrompt = buildBasePrompt()
          const userPrompt = buildShortStoryPrompt(params, title)

          const shortConfig = getModelConfig('chapter_gen')
          const response = await fetch(`${shortConfig.baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${shortConfig.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: shortConfig.model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.85,
              max_tokens: 12000,
              stream: true,
            }),
          })

          if (!response.ok) {
            const errText = await response.text()
            send({ type: 'error', message: `API 错误: ${response.status}` })
            await prisma.novel.update({ where: { id: novel.id }, data: { status: 'failed' } })
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

          if (fullContent) {
            await prisma.chapter.create({
              data: {
                novelId: novel.id, number: 1, title,
                content: fullContent, status: 'completed',
                summary: fullContent.slice(0, 500),
              },
            })
            await prisma.novel.update({
              where: { id: novel.id },
              data: { summary: fullContent.slice(0, 200), status: 'completed', wordCount: fullContent.length },
            })
          }

          send({ type: 'done' })
        }
      } catch (err: any) {
        send({ type: 'error', message: err.message || '生成失败' })
        await prisma.novel.update({ where: { id: novel.id }, data: { status: 'failed' } }).catch(() => {})
      } finally {
        controller.close()
      }
    },
  })

  return sendStream(event, stream)
})
