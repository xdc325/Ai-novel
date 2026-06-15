export function useUser() {
  const user = useState<User | null>('user', () => null)
  const token = useCookie('auth_token', {
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
    sameSite: 'lax',
  })

  async function fetchUser() {
    if (!token.value) return
    try {
      const data = await $fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token.value}` },
      }) as { user: User }
      user.value = data.user
    } catch {
      token.value = null
      user.value = null
    }
  }

  async function login(email: string, password: string) {
    const data = await $fetch('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    }) as { token: string; user: User }
    token.value = data.token
    user.value = data.user
  }

  async function register(email: string, password: string, nickname: string) {
    const data = await $fetch('/api/auth/register', {
      method: 'POST',
      body: { email, password, nickname },
    }) as { token: string; user: User }
    token.value = data.token
    user.value = data.user
  }

  function logout() {
    token.value = null
    user.value = null
    navigateTo('/')
  }

  return { user, fetchUser, login, register, logout }
}

export interface User {
  id: string
  email: string
  nickname: string
  avatar: string | null
}
