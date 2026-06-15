<script setup lang="ts">
const novels = ref<any[]>([])
const loading = ref(true)
const page = ref(1)
const totalPages = ref(1)
const sort = ref<'hot' | 'new'>('hot')
const showTags = ref(false)
const activeTag = ref('全部')

const worldviews = [
  '全部',
  '玄幻', '仙侠', '都市', '历史', '科幻', '游戏电竞', '军事', '悬疑灵异', '武侠', '轻小说', '末世', '无限流', '盗墓', '克苏鲁',
  '现代言情', '古代言情', '纯爱', '浪漫青春', '仙侠奇缘', '宫斗宅斗', '穿越重生', '女尊', '悬疑言情', '校园',
]

async function fetchNovels() {
  loading.value = true
  try {
    const data = await $fetch(`/api/community?sort=${sort.value}&page=${page.value}`) as any
    novels.value = data.novels || []
    totalPages.value = data.totalPages || 1
  } catch {} finally { loading.value = false }
}

function getWorldview(novel: any): string {
  const tags = novel.tags
  if (!tags) return '其他'
  if (typeof tags === 'string') {
    try { return JSON.parse(tags).worldview || '其他' } catch { return '其他' }
  }
  return tags.worldview || '其他'
}

function getPrimaryWorldview(novel: any): string {
  const wv = getWorldview(novel)
  return wv.split(',')[0].trim() || wv
}

function hasWorldview(novel: any, tag: string): boolean {
  const wv = getWorldview(novel)
  return wv.split(',').some((t: string) => t.trim() === tag)
}

const groupedNovels = computed(() => {
  const groups: Record<string, any[]> = {}
  const filtered = activeTag.value === '全部'
    ? novels.value
    : novels.value.filter(n => hasWorldview(n, activeTag.value))
  for (const novel of filtered) {
    const wv = getPrimaryWorldview(novel)
    if (!groups[wv]) groups[wv] = []
    groups[wv].push(novel)
  }
  return groups
})

const hotNovels = computed(() => {
  return [...novels.value].sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0)).slice(0, 12)
})

const filteredHot = computed(() => {
  if (activeTag.value === '全部') return hotNovels.value
  return hotNovels.value.filter(n => hasWorldview(n, activeTag.value))
})

function switchSort(s: 'hot' | 'new') {
  sort.value = s
  page.value = 1
  fetchNovels()
}

function selectTag(tag: string) { activeTag.value = tag }

watch(sort, () => { page.value = 1; fetchNovels() })

onMounted(fetchNovels)
</script>

<template>
  <div class="space-y-5">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-lg opacity-50" style="color: var(--accent-gold)">◇</span>
        <h1 class="text-xl font-bold text-glow" style="color: var(--text-primary)">社区广场</h1>
      </div>
      <button class="btn-secondary flex items-center gap-1.5 !text-xs" @click="showTags = !showTags">
        分类筛选
        <span class="transition-transform duration-200" :style="{ transform: showTags ? 'rotate(180deg)' : '' }">▼</span>
      </button>
    </div>

    <!-- Sort tabs -->
    <div class="sort-tabs">
      <button
        class="sort-tab" :class="{ active: sort === 'hot' }"
        @click="switchSort('hot')"
      >热门</button>
      <button
        class="sort-tab" :class="{ active: sort === 'new' }"
        @click="switchSort('new')"
      >最新</button>
    </div>

    <!-- Expandable tags -->
    <div v-if="showTags" class="card !p-3 animate-scale-in">
      <div class="flex flex-wrap gap-1.5">
        <button v-for="tag in worldviews" :key="tag"
          class="tag-chip" :class="{ active: activeTag === tag }"
          @click="selectTag(tag)">{{ tag }}</button>
      </div>
    </div>

    <div v-if="loading" class="flex justify-center py-20">
      <div class="skeleton h-4 w-32"></div>
    </div>

    <div v-else-if="novels.length === 0" class="py-20 text-center">
      <div class="text-3xl opacity-30 mb-3" style="color: var(--accent-gold)">◇</div>
      <p class="text-sm" style="color: var(--text-muted)">社区还没有小说</p>
      <NuxtLink to="/" class="mt-3 inline-block text-sm font-medium transition-colors hover:underline" style="color: var(--accent-gold)">去创作第一篇</NuxtLink>
    </div>

    <!-- Hot ranking -->
    <template v-if="sort === 'hot' && filteredHot.length > 0">
      <div class="space-y-3 stagger-children">
        <div v-for="(novel, idx) in filteredHot" :key="novel.id">
          <NuxtLink :to="`/read/${novel.id}`" class="community-card card !p-4">
            <div class="rank-badge" :class="idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : ''">
              <template v-if="idx === 0">👑</template>
              <template v-else>{{ idx + 1 }}</template>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="font-bold truncate" style="color: var(--text-primary)">{{ novel.title }}</h3>
                <span class="tag-badge">{{ getPrimaryWorldview(novel) }}{{ getWorldview(novel).includes(',') ? ' +' + (getWorldview(novel).split(',').length - 1) : '' }}</span>
                <span class="text-xs" style="color: var(--text-muted)">{{ novel.type === 'short' ? '短篇' : '长篇' }}</span>
              </div>
              <p class="mt-1.5 line-clamp-2 text-sm" style="color: var(--text-secondary)">{{ novel.summary || '暂无简介' }}</p>
              <div class="mt-2.5 flex items-center gap-5 text-xs" style="color: var(--text-muted)">
                <span class="flex items-center gap-1">
                  <span class="opacity-50">✎</span> {{ novel.user?.nickname || '匿名' }}
                </span>
                <span class="flex items-center gap-1">
                  <span class="opacity-50">♥</span> {{ novel._count?.likes || 0 }}
                </span>
                <span class="flex items-center gap-1">
                  <span class="opacity-50">💬</span> {{ novel._count?.comments || 0 }}
                </span>
                <span class="flex items-center gap-1">
                  <span class="opacity-50">☆</span> {{ novel._count?.favorites || 0 }}
                </span>
              </div>
            </div>
          </NuxtLink>
        </div>
      </div>
    </template>

    <!-- New — grouped -->
    <template v-if="sort === 'new'">
      <div v-for="(groupNovels, worldview) in groupedNovels" :key="worldview" class="space-y-3">
        <div class="section-header">
          <h2>{{ worldview }}</h2>
          <span class="accent-line"></span>
          <span class="text-xs" style="color: var(--text-muted)">{{ groupNovels.length }}篇</span>
        </div>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
          <NuxtLink v-for="novel in groupNovels" :key="novel.id" :to="`/read/${novel.id}`" class="community-card card !p-4">
            <div class="flex items-start justify-between gap-2">
              <h3 class="font-bold truncate" style="color: var(--text-primary)">{{ novel.title }}</h3>
              <span class="shrink-0 text-xs" style="color: var(--text-muted)">{{ novel.type === 'short' ? '短篇' : '长篇' }}</span>
            </div>
            <p class="mt-2 line-clamp-3 text-sm" style="color: var(--text-secondary)">{{ novel.summary || '暂无简介' }}</p>
            <div class="mt-3 flex items-center justify-between text-xs" style="color: var(--text-muted)">
              <span>{{ novel.user?.nickname || '匿名' }}</span>
              <div class="flex gap-3">
                <span>{{ novel._count?.likes || 0 }} 赞</span>
                <span>{{ novel._count?.comments || 0 }} 评</span>
              </div>
            </div>
          </NuxtLink>
        </div>
      </div>
    </template>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex justify-center gap-2">
      <button v-for="p in totalPages" :key="p"
        class="page-btn"
        :class="{ active: p === page }"
        @click="page = p; fetchNovels()"
      >{{ p }}</button>
    </div>
  </div>
</template>

<style scoped>
/* Sort tabs */
.sort-tabs {
  display: flex;
  gap: 0.25rem;
  background: var(--bg-input);
  border-radius: 0.625rem;
  padding: 0.25rem;
}
.sort-tab {
  flex: 1;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.sort-tab.active {
  background: linear-gradient(135deg, rgba(201,169,110,0.2), rgba(201,169,110,0.06));
  color: var(--accent-gold);
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
}

/* Community card */
.community-card {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  text-decoration: none;
  transition: all var(--transition-normal);
}
.community-card:hover {
  transform: translateY(-1px);
}
.community-card:hover h3 {
  color: var(--accent-gold-light) !important;
}

/* Rank badges */
.rank-badge {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 700;
  flex-shrink: 0;
  background: var(--bg-input);
  color: var(--text-muted);
}
.rank-badge.gold {
  background: linear-gradient(135deg, #f0c060, #c9a030);
  color: #3d2800;
  box-shadow: 0 0 12px rgba(240,192,96,0.3);
  font-size: 1rem;
}
.rank-badge.silver {
  background: linear-gradient(135deg, #c8c8c8, #a0a0a0);
  color: #2a2a2a;
  box-shadow: 0 0 8px rgba(180,180,180,0.25);
}
.rank-badge.bronze {
  background: linear-gradient(135deg, #d4a574, #b8733a);
  color: #3d1f00;
  box-shadow: 0 0 8px rgba(180,130,80,0.25);
}

/* Tag badge */
.tag-badge {
  background: rgba(201,169,110,0.08);
  color: var(--accent-gold-light);
  border: 1px solid rgba(201,169,110,0.15);
  border-radius: 9999px;
  padding: 0.125rem 0.5rem;
  font-size: 0.6875rem;
  white-space: nowrap;
  font-weight: 500;
}

/* Page buttons */
.page-btn {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.page-btn:hover {
  border-color: var(--accent-gold);
  color: var(--accent-gold);
}
.page-btn.active {
  background: linear-gradient(135deg, var(--accent-gold), var(--accent-gold-dark));
  color: #1a1a1a;
  border-color: transparent;
  font-weight: 600;
}
</style>
