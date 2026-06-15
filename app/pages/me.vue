<script setup lang="ts">
const { user, logout } = useUser()
const { api } = useApi()
const myNovels = ref<any[]>([])
const favorites = ref<any[]>([])
const tab = ref<'novels' | 'favorites'>('novels')
const publishing = ref<string | null>(null)

async function fetchData() {
  try {
    const [novelsData, favsData] = await Promise.all([
      api('/api/user/novels'),
      api('/api/user/favorites'),
    ])
    myNovels.value = (novelsData as any).novels || []
    favorites.value = (favsData as any).novels || []
  } catch {}
}

async function togglePublish(novel: any) {
  publishing.value = novel.id
  try {
    const token = useCookie('auth_token').value
    const res = await $fetch(`/api/novels/${novel.id}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }) as any
    novel.isPublic = res.isPublic
  } catch {} finally {
    publishing.value = null
  }
}

const statusLabel: Record<string, string> = {
  completed: '已完成', ongoing: '连载中', generating: '生成中', failed: '失败', draft: '草稿',
}
const statusBadge: Record<string, string> = {
  completed: 'badge-success', ongoing: 'badge-info', generating: 'badge-warning', failed: 'badge-error', draft: '',
}

onMounted(fetchData)
</script>

<template>
  <div v-if="!user" class="flex min-h-[60vh] flex-col items-center justify-center">
    <div class="text-4xl opacity-20 mb-4" style="color: var(--accent-gold)">◇</div>
    <p class="text-sm" style="color: var(--text-muted)">请先登录以查看个人中心</p>
    <NuxtLink to="/auth" class="btn-primary mt-4 !text-sm">去登录</NuxtLink>
  </div>

  <div v-else class="mx-auto max-w-3xl space-y-6 animate-fade-in">
    <!-- Profile card -->
    <div class="card card-accent !p-5">
      <div class="flex items-center gap-4">
        <div class="profile-avatar">
          {{ user.nickname?.[0] || '?' }}
        </div>
        <div class="flex-1 min-w-0">
          <h2 class="text-lg font-bold" style="color: var(--text-primary)">{{ user.nickname }}</h2>
          <p class="text-sm truncate" style="color: var(--text-muted)">{{ user.email }}</p>
          <div class="mt-2 flex items-center gap-3 text-xs" style="color: var(--text-muted)">
            <span>{{ myNovels.length }} 部作品</span>
            <span class="w-px h-3" style="background: var(--border-color)"></span>
            <span>{{ favorites.length }} 个收藏</span>
          </div>
        </div>
        <button class="btn-ghost !text-xs" @click="logout()">退出</button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tab-bar">
      <button
        class="tab-item" :class="{ active: tab === 'novels' }"
        @click="tab = 'novels'"
      >我的小说</button>
      <button
        class="tab-item" :class="{ active: tab === 'favorites' }"
        @click="tab = 'favorites'"
      >我的收藏</button>
    </div>

    <!-- My novels -->
    <div v-if="tab === 'novels'" class="grid gap-3 sm:grid-cols-2 stagger-children">
      <div v-for="novel in myNovels" :key="novel.id" class="novel-card card !p-4">
        <NuxtLink :to="`/read/${novel.id}`" class="block">
          <div class="flex items-center justify-between gap-2">
            <h3 class="font-bold truncate transition-colors" style="color: var(--text-primary)">{{ novel.title }}</h3>
            <span class="badge shrink-0" :class="statusBadge[novel.status]">{{ statusLabel[novel.status] || novel.status }}</span>
          </div>
          <p class="mt-1 text-xs" style="color: var(--text-muted)">
            {{ novel.type === 'short' ? '短篇' : '长篇' }} · {{ (novel.wordCount || 0).toLocaleString() }}字
          </p>
        </NuxtLink>
        <div class="mt-3 flex items-center justify-between border-t pt-3" style="border-color: var(--border-color)">
          <span v-if="novel.isPublic" class="flex items-center gap-1 text-xs" style="color: var(--accent-green)">
            <span class="inline-block w-1.5 h-1.5 rounded-full" style="background: var(--accent-green)"></span>
            已在社区发布
          </span>
          <span v-else class="text-xs" style="color: var(--text-muted)">仅自己可见</span>
          <button
            v-if="novel.status === 'completed' || novel.status === 'ongoing'"
            class="btn-gold-outline !text-xs !py-1"
            :disabled="publishing === novel.id"
            @click="togglePublish(novel)"
          >{{ publishing === novel.id ? '处理中...' : novel.isPublic ? '取消发布' : '发布到社区' }}</button>
        </div>
      </div>
      <div v-if="myNovels.length === 0" class="col-span-2 py-16 text-center">
        <div class="text-3xl opacity-20 mb-3" style="color: var(--accent-gold)">◇</div>
        <p class="text-sm" style="color: var(--text-muted)">还没有生成过小说</p>
        <NuxtLink to="/" class="mt-2 inline-block text-sm font-medium transition-colors hover:underline" style="color: var(--accent-gold)">去创作</NuxtLink>
      </div>
    </div>

    <!-- Favorites -->
    <div v-if="tab === 'favorites'" class="grid gap-3 sm:grid-cols-2 stagger-children">
      <NuxtLink v-for="fav in favorites" :key="fav.id" :to="`/read/${fav.id}`" class="novel-card card !p-4">
        <h3 class="font-bold truncate" style="color: var(--text-primary)">{{ fav.title }}</h3>
        <p class="mt-1.5 line-clamp-2 text-sm" style="color: var(--text-secondary)">{{ fav.summary || '暂无简介' }}</p>
        <div class="mt-3 flex items-center gap-4 text-xs" style="color: var(--text-muted)">
          <span>{{ fav.user?.nickname || '匿名' }}</span>
          <span class="flex items-center gap-1"><span class="opacity-50">♥</span> {{ fav._count?.likes || 0 }}</span>
        </div>
      </NuxtLink>
      <div v-if="favorites.length === 0" class="col-span-2 py-16 text-center">
        <div class="text-3xl opacity-20 mb-3" style="color: var(--accent-gold)">◇</div>
        <p class="text-sm" style="color: var(--text-muted)">还没有收藏过小说</p>
        <NuxtLink to="/community" class="mt-2 inline-block text-sm font-medium transition-colors hover:underline" style="color: var(--accent-gold)">去发现</NuxtLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Profile avatar */
.profile-avatar {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--accent-gold), var(--accent-gold-dark));
  color: #1a1a1a;
  font-weight: 700;
  font-size: 1.25rem;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 20px rgba(201,169,110,0.15);
}

/* Tab bar */
.tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border-color);
}
.tab-item {
  padding: 0.75rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  margin-bottom: -1px;
}
.tab-item:hover {
  color: var(--text-primary);
}
.tab-item.active {
  color: var(--accent-gold);
  border-bottom-color: var(--accent-gold);
}

/* Novel card */
.novel-card {
  transition: all var(--transition-normal);
  text-decoration: none;
  color: inherit;
}
.novel-card:hover {
  transform: translateY(-1px);
}
.novel-card:hover h3 {
  color: var(--accent-gold-light) !important;
}
</style>
