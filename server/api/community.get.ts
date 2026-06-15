import prisma from '../utils/prisma'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const sort = (query.sort as string) || 'new'
  const page = parseInt(query.page as string) || 1
  const limit = Math.min(parseInt(query.limit as string) || 50, 100)

  const where: any = {
    isPublic: true,
    status: { in: ['completed', 'ongoing'] },
  }

  // Build orderBy based on sort
  let orderBy: any = { createdAt: 'desc' }

  const [novels, total] = await Promise.all([
    prisma.novel.findMany({
      where,
      include: {
        user: { select: { id: true, nickname: true, avatar: true } },
        _count: { select: { likes: true, comments: true, favorites: true } },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.novel.count({ where }),
  ])

  // Compute hot score and sort if needed
  const enriched = novels.map(n => ({
    ...n,
    hotScore: (n._count?.likes || 0) * 3 + (n._count?.comments || 0) * 2 + (n._count?.favorites || 0) * 5,
  }))

  if (sort === 'hot') {
    enriched.sort((a, b) => b.hotScore - a.hotScore)
  }

  return {
    novels: enriched,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  }
})
