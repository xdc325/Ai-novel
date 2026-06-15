export function useApi() {
  const token = useCookie('auth_token')

  async function api<T>(path: string, opts: Record<string, unknown> = {}) {
    const headers: Record<string, string> = {}
    if (token.value) {
      headers.Authorization = `Bearer ${token.value}`
    }
    return $fetch<T>(path, { headers, ...opts })
  }

  return { api, token }
}
