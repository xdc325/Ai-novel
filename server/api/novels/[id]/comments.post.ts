import prisma from '../../../utils/prisma'
import { verifyToken } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  if (!auth?.startsWith('Bearer ')) throw createError({ statusCode: 401 })
  const userId = await verifyToken(auth.slice(7))
  if (!userId) throw createError({ statusCode: 401 })

  const novelId = getRouterParam(event, 'id')
  if (!novelId) throw createError({ statusCode: 400 })

  const { content } = await readBody(event)
  if (!content) throw createError({ statusCode: 400, message: '评论不能为空' })

  const comment = await prisma.comment.create({
    data: { userId, novelId, content },
    include: { user: { select: { id: true, nickname: true, avatar: true } } },
  })

  return comment
})
