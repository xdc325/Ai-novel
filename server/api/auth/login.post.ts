import prisma from '../../utils/prisma'
import { verifyPassword, createToken } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const { email, password } = await readBody(event)

  if (!email || !password) {
    throw createError({ statusCode: 400, message: '请填写邮箱和密码' })
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    throw createError({ statusCode: 400, message: '邮箱或密码错误' })
  }

  const valid = await verifyPassword(password, user.password)
  if (!valid) {
    throw createError({ statusCode: 400, message: '邮箱或密码错误' })
  }

  const token = await createToken(user.id)

  return {
    token,
    user: { id: user.id, email: user.email, nickname: user.nickname, avatar: user.avatar },
  }
})
