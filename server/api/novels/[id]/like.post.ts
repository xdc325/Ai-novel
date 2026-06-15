import prisma from '../../../utils/prisma'
import { verifyToken } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  if (!auth?.startsWith('Bearer ')) throw createError({ statusCode: 401 })
  const userId = await verifyToken(auth.slice(7))
  if (!userId) throw createError({ statusCode: 401 })

  const novelId = getRouterParam(event, 'id')
  if (!novelId) throw createError({ statusCode: 400 })

  const existing = await prisma.like.findUnique({
    where: { userId_novelId: { userId, novelId } },
  })

  if (existing) {
    await prisma.like.delete({ where: { id: existing.id } })
    return { liked: false }
  } else {
    await prisma.like.create({ data: { userId, novelId } })
    return { liked: true }
  }
})
