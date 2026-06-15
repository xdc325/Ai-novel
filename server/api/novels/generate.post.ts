import prisma from '../../utils/prisma'
import { verifyToken } from '../../utils/auth'
import { generateShortStory, generateLongStoryWorld, generateTitle } from '../../services/generation/engine'

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  if (!auth?.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, message: '请先登录' })
  }
  const userId = await verifyToken(auth.slice(7))
  if (!userId) {
    throw createError({ statusCode: 401, message: '登录已过期' })
  }

  const params = await readBody(event)
  if (!params.worldview) {
    throw createError({ statusCode: 400, message: '请选择世界观' })
  }

  const title = generateTitle(params)

  if (params.type === 'short') {
    const novel = await prisma.novel.create({
      data: { userId, title, summary: '', type: 'short', tags: params, status: 'generating' },
    })

    try {
      const result = await generateShortStory(params, title)

      await prisma.chapter.create({
        data: {
          novelId: novel.id, number: 1, title,
          content: result.content, status: 'completed',
          summary: result.content.slice(0, 500),
        },
      })

      await prisma.novel.update({
        where: { id: novel.id },
        data: {
          summary: result.content.slice(0, 200),
          status: 'completed',
          wordCount: result.content.length,
        },
      })

      return { novelId: novel.id, status: 'completed' }
    } catch (err: any) {
      console.error('Generation failed:', err)
      await prisma.novel.update({ where: { id: novel.id }, data: { status: 'failed' } })
      throw createError({ statusCode: 500, message: `生成失败: ${err.message || '未知错误'}` })
    }
  } else {
    const novel = await prisma.novel.create({
      data: { userId, title, summary: '', type: 'long', tags: params, status: 'generating' },
    })

    try {
      const world = await generateLongStoryWorld(params, title)
      const chapters = world.chapters
      if (!chapters.length) {
        await prisma.novel.update({ where: { id: novel.id }, data: { status: 'failed' } })
        throw createError({ statusCode: 500, message: '生成大纲失败' })
      }

      for (const ch of chapters) {
        await prisma.chapter.create({
          data: { novelId: novel.id, number: ch.number, title: ch.title, content: '', status: 'draft', summary: ch.summary },
        })
      }

      await prisma.novel.update({
        where: { id: novel.id },
        data: {
          summary: world.worldSetting?.slice(0, 200) || chapters.slice(0, 3).map((c: any) => c.summary).join(' '),
          status: 'ongoing',
          tags: {
            ...params,
            _worldSetting: world.worldSetting,
            _characters: world.characters,
            _arcs: JSON.stringify(world.arcs || []),
            _conflict: world.conflict,
            _foreshadowing: world.foreshadowing,
            _rawWorldContext: world.rawWorldContext,
          } as any,
        },
      })

      return { novelId: novel.id, status: 'ongoing' }
    } catch (err: any) {
      console.error('World generation failed:', err)
      await prisma.novel.update({ where: { id: novel.id }, data: { status: 'failed' } })
      throw createError({ statusCode: 500, message: `生成失败: ${err.message || '未知错误'}` })
    }
  }
})
