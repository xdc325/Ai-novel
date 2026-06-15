import * as jose from 'jose'
import bcrypt from 'bcryptjs'

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET 环境变量未设置，服务无法启动')
const secret = new TextEncoder().encode(process.env.JWT_SECRET)

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

export async function createToken(userId: string) {
  return new jose.SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret)
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jose.jwtVerify(token, secret)
    return payload.sub as string
  } catch {
    return null
  }
}

export async function requireAuth(event: any): Promise<string> {
  const auth = getHeader(event, 'authorization')
  if (!auth?.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, message: '请先登录' })
  }
  const userId = await verifyToken(auth.slice(7))
  if (!userId) {
    throw createError({ statusCode: 401, message: '登录已过期' })
  }
  return userId
}
