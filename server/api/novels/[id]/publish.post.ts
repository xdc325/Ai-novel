import prisma from '../../../utils/prisma'
import { verifyToken } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  if (!auth?.startsWith('Bearer ')) throw createError({ statusCode: 401, message: '请先登录' })
  const userId = await verifyToken(auth.slice(7))
  if (!userId) throw createError({ statusCode: 401, message: '登录已过期' })

  const novelId = getRouterParam(event, 'id')
  if (!novelId) throw createError({ statusCode: 400, message: '缺少小说ID' })

  const novel = await prisma.novel.findUnique({ where: { id: novelId } })
  if (!novel) throw createError({ statusCode: 404, message: '小说不存在' })
  if (novel.userId !== userId) throw createError({ statusCode: 403, message: '无权操作' })

  if (novel.status !== 'completed' && novel.status !== 'ongoing') {
    throw createError({ statusCode: 400, message: '只能发布已完成或连载中的小说' })
  }

  const updated = await prisma.novel.update({
    where: { id: novelId },
    data: { isPublic: !novel.isPublic },
  })

  return { isPublic: updated.isPublic }
})
