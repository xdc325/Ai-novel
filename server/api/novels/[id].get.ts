import prisma from '../../utils/prisma'
import { verifyToken } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: '缺少小说ID' })

  // Try to get current user for interaction status
  let userId: string | null = null
  const auth = getHeader(event, 'authorization')
  if (auth?.startsWith('Bearer ')) {
    userId = await verifyToken(auth.slice(7))
  }

  const novel = await prisma.novel.findUnique({
    where: { id },
    include: {
      chapters: { orderBy: { number: 'asc' } },
      user: { select: { id: true, nickname: true, avatar: true } },
      _count: { select: { likes: true, comments: true, favorites: true } },
    },
  })

  if (!novel) throw createError({ statusCode: 404, message: '小说不存在' })

  // Check if current user has liked/favorited
  let isLiked = false, isFavorited = false
  if (userId) {
    const [like, favorite] = await Promise.all([
      prisma.like.findUnique({ where: { userId_novelId: { userId, novelId: id } } }),
      prisma.favorite.findUnique({ where: { userId_novelId: { userId, novelId: id } } }),
    ])
    isLiked = !!like
    isFavorited = !!favorite
  }

  return { ...novel, isLiked, isFavorited }
})
