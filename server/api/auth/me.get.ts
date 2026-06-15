import prisma from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  if (!auth?.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, message: '请先登录' })
  }

  const { verifyToken } = await import('../../utils/auth')
  const userId = await verifyToken(auth.slice(7))
  if (!userId) {
    throw createError({ statusCode: 401, message: '登录已过期' })
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    throw createError({ statusCode: 404, message: '用户不存在' })
  }

  return {
    user: { id: user.id, email: user.email, nickname: user.nickname, avatar: user.avatar },
  }
})
