import prisma from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  const novelId = getRouterParam(event, 'id')
  if (!novelId) throw createError({ statusCode: 400 })

  const comments = await prisma.comment.findMany({
    where: { novelId },
    include: { user: { select: { id: true, nickname: true, avatar: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return { comments }
})
