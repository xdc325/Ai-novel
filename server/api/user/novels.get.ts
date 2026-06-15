import prisma from '../../utils/prisma'
import { verifyToken } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  if (!auth?.startsWith('Bearer ')) throw createError({ statusCode: 401 })
  const userId = await verifyToken(auth.slice(7))
  if (!userId) throw createError({ statusCode: 401 })

  const novels = await prisma.novel.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
  return { novels }
})
