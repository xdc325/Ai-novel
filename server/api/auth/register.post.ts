import prisma from '../../utils/prisma'
import { hashPassword, createToken } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const { email, password, nickname } = await readBody(event)

  if (!email || !password || !nickname) {
    throw createError({ statusCode: 400, message: '请填写所有字段' })
  }
  if (password.length < 6) {
    throw createError({ statusCode: 400, message: '密码至少6位' })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw createError({ statusCode: 400, message: '该邮箱已注册' })
  }

  const user = await prisma.user.create({
    data: {
      email,
      password: await hashPassword(password),
      nickname,
    },
  })

  const token = await createToken(user.id)

  return {
    token,
    user: { id: user.id, email: user.email, nickname: user.nickname, avatar: user.avatar },
  }
})
