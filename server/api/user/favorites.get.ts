import prisma from '../../utils/prisma'
import { verifyToken } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  if (!auth?.startsWith('Bearer ')) throw createError({ statusCode: 401 })
  const userId = await verifyToken(auth.slice(7))
  if (!userId) throw createError({ statusCode: 401 })

  const favorites = await prisma.favorite.findMany({
    where: { userId },
    include: {
      novel: {
        include: {
          user: { select: { id: true, nickname: true } },
          _count: { select: { likes: true, comments: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return { novels: favorites.map(f => f.novel) }
})
