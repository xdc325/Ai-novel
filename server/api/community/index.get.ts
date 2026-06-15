import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = parseInt(query.page as string) || 1
  const limit = Math.min(parseInt(query.limit as string) || 20, 50)

  const where: any = {
    isPublic: true,
    status: 'completed',
  }

  const [novels, total] = await Promise.all([
    prisma.novel.findMany({
      where,
      include: {
        user: { select: { id: true, nickname: true } },
        _count: { select: { likes: true, comments: true, favorites: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.novel.count({ where }),
  ])

  return { novels, total, page, totalPages: Math.ceil(total / limit) }
})
