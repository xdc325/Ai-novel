<script setup lang="ts">
const user = useUser()
const isLogin = ref(true)
const email = ref('')
const password = ref('')
const nickname = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  loading.value = true
  error.value = ''
  try {
    if (isLogin.value) {
      await user.login(email.value, password.value)
    } else {
      await user.register(email.value, password.value, nickname.value)
    }
    navigateTo('/')
  } catch (e: any) {
    error.value = e.data?.message || '操作失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-[80vh] items-center justify-center">
    <div class="w-full max-w-sm animate-scale-in">
      <!-- Logo -->
      <div class="mb-8 text-center">
        <div class="auth-logo-icon">
          <span>墨</span>
        </div>
        <h1 class="mt-3 text-2xl font-bold tracking-wider text-glow" style="color: var(--accent-gold)">墨语</h1>
        <p class="mt-2 text-sm" style="color: var(--text-secondary)">
          {{ isLogin ? '欢迎回来，继续你的创作之旅' : '创建账号，开始你的故事' }}
        </p>
      </div>

      <!-- Form card -->
      <form class="card card-accent !p-6 space-y-4" @submit.prevent="submit">
        <div v-if="!isLogin">
          <label class="mb-1.5 block text-sm font-medium" style="color: var(--text-secondary)">昵称</label>
          <input v-model="nickname" required class="input-dark" placeholder="你的笔名" autocomplete="nickname" />
        </div>
        <div>
          <label class="mb-1.5 block text-sm font-medium" style="color: var(--text-secondary)">邮箱</label>
          <input v-model="email" type="email" required class="input-dark" placeholder="your@email.com" autocomplete="email" />
        </div>
        <div>
          <label class="mb-1.5 block text-sm font-medium" style="color: var(--text-secondary)">密码</label>
          <input v-model="password" type="password" required minlength="6" class="input-dark" placeholder="至少6位" autocomplete="current-password" />
        </div>

        <div v-if="error" class="badge badge-error w-full text-center !rounded-lg !py-2.5 animate-fade-in">{{ error }}</div>

        <button type="submit" :disabled="loading" class="btn-primary w-full py-2.5 !text-sm">
          <span v-if="loading">
            <span class="inline-block h-2 w-2 animate-pulse rounded-full mr-2" style="background:currentColor"></span>
            处理中...
          </span>
          <span v-else>{{ isLogin ? '登录' : '注册' }}</span>
        </button>

        <div class="ornament-divider text-xs">或</div>

        <p class="text-center text-sm" style="color: var(--text-secondary)">
          {{ isLogin ? '没有账号？' : '已有账号？' }}
          <button type="button" class="font-semibold transition-colors hover:underline" style="color: var(--accent-gold)" @click="isLogin = !isLogin; error = ''">
            {{ isLogin ? '立即注册' : '去登录' }}
          </button>
        </p>
      </form>
    </div>
  </div>
</template>

<style scoped>
.auth-logo-icon {
  width: 52px;
  height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(201,169,110,0.18), rgba(201,169,110,0.04));
  border: 1px solid rgba(201,169,110,0.2);
  border-radius: 14px;
  color: var(--accent-gold);
  font-size: 1.4rem;
  font-weight: 700;
}
</style>
