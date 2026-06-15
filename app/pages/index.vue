<script setup lang="ts">
const { user } = useUser()
const { api } = useApi()
const loading = ref(false)
const error = ref('')
const streaming = ref(false)
const streamContent = ref('')
const streamTitle = ref('')
const streamNovelId = ref('')
const streamNovelType = ref('')
const streamDone = ref(false)
const streamHasMore = ref(false)

const form = reactive({
  orientation: '' as string,
  worldview: [] as string[],
  maleLeads: 1, femaleLeads: 1,
  romance: '' as string, personality: '' as string, relationship: '' as string,
  scene: [] as string[], era: '' as string,
  style: [] as string[], pace: '' as string,
  freeTags: '' as string, extraPrompt: '' as string,
  type: 'short' as 'short' | 'long',
})

const worldviews: Record<string, string[]> = {
  '男频': ['玄幻', '仙侠', '都市', '历史', '科幻', '游戏电竞', '军事', '悬疑灵异', '武侠', '轻小说', '末世', '无限流', '盗墓', '克苏鲁'],
  '女频': ['现代言情', '古代言情', '纯爱', '浪漫青春', '仙侠奇缘', '宫斗宅斗', '穿越重生', '女尊', '悬疑言情', '校园'],
}
const activeWorldviews = computed(() => {
  if (form.orientation === '男频') return worldviews['男频']
  if (form.orientation === '女频') return worldviews['女频']
  return [...worldviews['男频'], ...worldviews['女频']]
})
const romances = ['无感情线', '单女主', '多女主', '单男主', '多男主', '纯剧情', '后宫', '纯爱1v1']
const relationships = ['陌生人', '青梅竹马', '宿敌', '师徒', '主仆', '契约', '相亲', '重逢', '随机']
const scenes = ['宗门', '学院', '都市', '荒野', '宫廷', '星际', '江湖', '末日废墟', '地下城', '深海', '虚拟世界', '随机']
const eras = ['古代', '近现代', '当代', '近未来', '远未来', '架空', '随机']
const styles = ['爽文', '虐文', '甜宠', '热血', '轻松日常', '暗黑', '烧脑', '治愈', '搞笑', '正剧', '文艺']
const paces = ['快节奏', '慢热', '张弛有度']

// Framework table — genre columns mapping (mirrors server engine.ts)
const GENRE_COLUMNS: Record<string, string[]> = {
  '玄幻': ['修炼进度', '势力格局', '血脉天赋'],
  '仙侠': ['修炼进度', '宗门关系', '法宝灵兽'],
  '都市': ['社会关系', '职业发展', '城市变迁'],
  '历史': ['历史事件', '朝局变化', '民生经济'],
  '科幻': ['科技设定', '组织派系', '星际格局'],
  '游戏电竞': ['竞技水平', '团队关系', '赛事进度'],
  '军事': ['战役进程', '装备科技', '军队部署'],
  '悬疑灵异': ['谜题揭秘', '线索汇总', '超自然规则'],
  '武侠': ['武功进境', '门派恩怨', '江湖格局'],
  '末世': ['生存资源', '势力分布', '环境异变'],
  '无限流': ['副本进度', '能力获取', '队伍变动'],
  '盗墓': ['墓穴探索', '机关破解', '队伍状态'],
  '克苏鲁': ['认知侵蚀', '不可名状', '精神状态'],
  '现代言情': ['感情进度', '家庭关系', '社交圈'],
  '古代言情': ['感情进度', '家族关系', '宫廷朝局'],
  '仙侠奇缘': ['修炼进度', '情感羁绊', '仙界格局'],
  '宫斗宅斗': ['宫斗进度', '派系分布', '权力格局'],
  '穿越重生': ['前世因果', '今生改变', '时间线偏差'],
  '校园': ['学业进度', '人际圈子', '成长阶段'],
  '轻小说': ['能力等级', '伙伴关系', '冒险进度'],
}
const UNIVERSAL_COLUMNS = ['角色状态', '伏笔进度', '世界观揭示', '时间线', '未闭合线']

// Computed genre columns from selected worldview tags
const availableGenreColumns = computed(() => {
  const cols: string[] = []
  const seen = new Set<string>()
  for (const tag of form.worldview) {
    const mapped = GENRE_COLUMNS[tag]
    if (mapped) {
      for (const col of mapped) {
        if (!seen.has(col)) { seen.add(col); cols.push(col) }
      }
    }
  }
  return cols
})

// Tracking dimension state
const trackingGenreCols = ref<string[]>([])
const customColumnInput = ref('')
const customColumns = ref<string[]>([])

// Sync genre columns when worldview changes
watch(() => form.worldview, (newVal) => {
  const available = new Set<string>()
  for (const tag of newVal) {
    const mapped = GENRE_COLUMNS[tag]
    if (mapped) { for (const col of mapped) available.add(col) }
  }
  // Remove deselected, keep previously selected
  trackingGenreCols.value = trackingGenreCols.value.filter(c => available.has(c))
  // Auto-select all new available columns
  for (const col of available) {
    if (!trackingGenreCols.value.includes(col)) {
      trackingGenreCols.value = [...trackingGenreCols.value, col]
    }
  }
})

function addCustomColumn() {
  const name = customColumnInput.value.trim()
  if (!name || customColumns.value.includes(name)) return
  customColumns.value = [...customColumns.value, name]
  customColumnInput.value = ''
}

function removeCustomColumn(name: string) {
  customColumns.value = customColumns.value.filter(c => c !== name)
}

function toggleGenreCol(col: string) {
  if (trackingGenreCols.value.includes(col)) {
    trackingGenreCols.value = trackingGenreCols.value.filter(c => c !== col)
  } else {
    trackingGenreCols.value = [...trackingGenreCols.value, col]
  }
}

function downloadNovel() {
  const blob = new Blob([streamContent.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${streamTitle.value || '小说'}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

function readNovel() {
  if (streamNovelId.value) navigateTo(`/read/${streamNovelId.value}`)
}

function continueNovel() {
  if (streamNovelId.value) navigateTo(`/read/${streamNovelId.value}?continue=1`)
}

async function generate() {
  if (form.worldview.length === 0) { error.value = '请选择世界观'; return }
  if (!user.value) { error.value = '请先登录'; window.scrollTo({ top: 0 }); return }

  loading.value = true
  streaming.value = true
  streamContent.value = ''
  streamDone.value = false
  error.value = ''

  try {
    const token = useCookie('auth_token').value
    const response = await fetch('/api/novels/generate-stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ ...form, worldview: form.worldview.join(','), scene: form.scene.join(','), style: form.style.join(','), customColumns: customColumns.value }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: '请求失败' }))
      error.value = err.message || `HTTP ${response.status}`
      streaming.value = false
      loading.value = false
      return
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6))
          if (data.type === 'meta') {
            streamNovelId.value = data.novelId
            streamTitle.value = data.title
            streamNovelType.value = data.novelType || ''
          } else if (data.type === 'chunk') {
            streamContent.value += data.content
          } else if (data.type === 'done') {
            streamDone.value = true
            streamHasMore.value = !!data.hasMore
          } else if (data.type === 'error') {
            error.value = data.message
            streaming.value = false
          }
        } catch {}
      }
    }

    streamDone.value = true
  } catch (e: any) {
    error.value = e.message || '连接失败'
    streaming.value = false
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-5">
    <!-- Header -->
    <div v-if="!streaming" class="creation-header">
      <div class="header-icon">✧</div>
      <h1 class="text-xl font-bold text-glow" style="color: var(--text-primary)">AI 小说创作</h1>
      <p class="mt-1.5 text-sm" style="color: var(--text-muted)">选择标签，AI 为你创造一个独一无二的故事</p>
    </div>

    <!-- Streaming output -->
    <div v-if="streaming" class="animate-fade-in space-y-4">
      <div class="card card-accent !p-5">
        <!-- Stream header -->
        <div class="flex items-center justify-between">
          <div class="min-w-0 flex-1">
            <h2 v-if="streamDone && streamNovelId"
              class="cursor-pointer truncate font-bold transition-all hover:underline"
              style="color: var(--accent-gold)" @click="readNovel">
              ✦ {{ streamTitle }}
            </h2>
            <h2 v-else class="truncate font-bold" style="color: var(--text-primary)">
              {{ streamTitle || '生成中...' }}
            </h2>
          </div>
          <div class="ml-3 flex shrink-0 gap-2">
            <button v-if="streamDone" class="btn-primary !py-1.5 !text-xs" @click="readNovel">阅读模式</button>
            <button v-if="streamDone && streamContent" class="btn-gold-outline !py-1.5 !text-xs" @click="downloadNovel">下载 TXT</button>
          </div>
        </div>

        <!-- Live indicator -->
        <div v-if="!streamDone" class="mt-3 flex items-center gap-2">
          <span class="live-dot"></span>
          <span class="text-xs" style="color: var(--text-muted)">AI 正在创作 · {{ streamContent.length }}字</span>
        </div>

        <!-- Content -->
        <div class="mt-4">
          <div class="prose-reading">
            <pre class="whitespace-pre-wrap font-sans text-sm leading-relaxed">{{ streamContent }}</pre>
          </div>
        </div>

        <!-- Done actions -->
        <template v-if="streamDone && streamHasMore">
          <div class="mt-5 border-t pt-5 text-center" style="border-color: var(--border-color)">
            <p class="mb-3 text-sm font-medium" style="color: var(--accent-green)">前2章已完成！支持 150-200 章的长篇架构</p>
            <button class="btn-primary" @click="continueNovel">继续生成下两章 →</button>
            <p class="mt-2.5 text-xs" style="color: var(--text-muted)">或点击上方"阅读模式"查看已生成章节</p>
          </div>
        </template>
        <div v-else-if="streamDone" class="mt-5 text-center">
          <span class="inline-flex items-center gap-1.5 text-sm" style="color: var(--accent-green)">
            <span style="font-size:1.1em">✓</span> 生成完成
          </span>
        </div>
      </div>
    </div>

    <!-- Tag form -->
    <template v-if="!streaming">
      <!-- Orientation -->
      <SectionCard title="阅读倾向" required>
        <div class="flex gap-3">
          <button v-for="o in ['男频', '女频']" :key="o"
            class="orient-btn"
            :class="{ active: form.orientation === o }"
            @click="form.orientation = form.orientation === o ? '' : o; form.worldview = []"
          >{{ o }}</button>
        </div>
      </SectionCard>

      <!-- Worldview -->
      <SectionCard title="世界观（可多选，首位为主线）" required>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="w in activeWorldviews" :key="w"
            class="tag-chip" :class="{ active: form.worldview.includes(w) }"
            :style="form.worldview[0] === w ? { boxShadow: '0 0 0 1.5px var(--accent-gold), 0 0 10px rgba(201,169,110,0.3)' } : {}"
            @click="form.worldview.includes(w)
              ? form.worldview = form.worldview.filter(x => x !== w)
              : form.worldview = [...form.worldview, w]"
          >{{ w }}{{ form.worldview[0] === w ? ' ·主' : '' }}</button>
        </div>
        <div v-if="form.worldview.length > 1" class="highlight-box mt-3">
          <p class="text-xs" style="color: var(--accent-gold-light)">
            <span style="opacity:0.7">◆</span> 主标签「{{ form.worldview[0] }}」定世界观骨架，次标签提供氛围和冲突风格
          </p>
        </div>
        <input v-model="form.freeTags" placeholder="+ 补充标签，如：赛博修仙、末日废土"
          class="input-dark mt-3 text-xs" />
      </SectionCard>

      <!-- Characters -->
      <SectionCard title="人物配置" required>
        <div class="space-y-3">
          <div class="flex items-center gap-3">
            <span class="w-20 shrink-0 text-sm" style="color: var(--text-secondary)">男主</span>
            <button v-for="n in [0,1,2,3]" :key="'m'+n"
              class="count-btn"
              :class="{ active: form.maleLeads === n }"
              @click="form.maleLeads = n"
            >{{ n === 3 ? '3+' : n }}</button>
          </div>
          <div class="flex items-center gap-3">
            <span class="w-20 shrink-0 text-sm" style="color: var(--text-secondary)">女主</span>
            <button v-for="n in [0,1,2,3]" :key="'f'+n"
              class="count-btn"
              :class="{ active: form.femaleLeads === n }"
              @click="form.femaleLeads = n"
            >{{ n === 3 ? '3+' : n }}</button>
          </div>
          <div>
            <span class="mb-1.5 block text-sm" style="color: var(--text-secondary)">感情线</span>
            <div class="flex flex-wrap gap-1.5">
              <button v-for="r in romances" :key="r" class="tag-chip" :class="{ active: form.romance === r }"
                @click="form.romance = r">{{ r }}</button>
            </div>
          </div>
          <div>
            <span class="mb-1.5 block text-sm" style="color: var(--text-secondary)">主角性格</span>
            <input v-model="form.personality" placeholder="如：腹黑 正直 疯批 温柔 冷酷" class="input-dark" />
          </div>
          <div>
            <span class="mb-1.5 block text-sm" style="color: var(--text-secondary)">关系起点</span>
            <div class="flex flex-wrap gap-1.5">
              <button v-for="r in relationships" :key="r" class="tag-chip" :class="{ active: form.relationship === r }"
                @click="form.relationship = r">{{ r }}</button>
            </div>
          </div>
        </div>
      </SectionCard>

      <!-- Scene -->
      <SectionCard title="场景偏好">
        <div class="space-y-2">
          <span class="text-sm" style="color: var(--text-secondary)">主要场景（可多选）</span>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="s in scenes" :key="s" class="tag-chip" :class="{ active: form.scene.includes(s) }"
              @click="form.scene.includes(s) ? form.scene = form.scene.filter(x => x !== s) : form.scene = [...form.scene, s]">{{ s }}</button>
          </div>
          <span class="text-sm" style="color: var(--text-secondary)">时代背景</span>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="e in eras" :key="e" class="tag-chip" :class="{ active: form.era === e }"
              @click="form.era = form.era === e ? '' : e">{{ e }}</button>
          </div>
        </div>
        <input v-model="form.extraPrompt" placeholder="+ 补充场景描述，如：废土风格的上海、海底仙门"
          class="input-dark mt-3 text-xs" />
      </SectionCard>

      <!-- Style -->
      <SectionCard title="故事风格">
        <div class="space-y-2">
          <span class="text-sm" style="color: var(--text-secondary)">基调（可多选）</span>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="s in styles" :key="s" class="tag-chip" :class="{ active: form.style.includes(s) }"
              @click="form.style.includes(s) ? form.style = form.style.filter(x => x !== s) : form.style = [...form.style, s]">{{ s }}</button>
          </div>
          <span class="text-sm" style="color: var(--text-secondary)">节奏</span>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="p in paces" :key="p" class="tag-chip" :class="{ active: form.pace === p }"
              @click="form.pace = form.pace === p ? '' : p">{{ p }}</button>
          </div>
        </div>
      </SectionCard>

      <!-- Length -->
      <SectionCard title="篇幅">
        <div class="flex gap-3">
          <button class="tag-chip" :class="{ active: form.type === 'short' }"
            @click="form.type = 'short'">短篇 (≈8000字)</button>
          <button class="tag-chip" :class="{ active: form.type === 'long' }"
            @click="form.type = 'long'">长篇 (多章节)</button>
        </div>
      </SectionCard>

      <!-- Tracking Dimensions (Framework Table) — only for long novels -->
      <SectionCard v-if="form.type === 'long'" title="追踪维度（AI 记忆框架表列）">
        <div class="space-y-3">
          <!-- Universal columns (locked) -->
          <div>
            <span class="text-xs" style="color: var(--text-muted)">通用列（固定，所有长篇自动包含）</span>
            <div class="flex flex-wrap gap-1.5 mt-1.5">
              <span v-for="col in UNIVERSAL_COLUMNS" :key="col" class="tag-chip active"
                style="opacity:0.6; cursor:default">{{ col }}</span>
            </div>
          </div>

          <!-- Genre columns (checkable) -->
          <div v-if="availableGenreColumns.length > 0">
            <span class="text-xs" style="color: var(--text-muted)">类型专属列（按世界观匹配，可点选取消不需要的维度）</span>
            <div class="flex flex-wrap gap-1.5 mt-1.5">
              <button v-for="col in availableGenreColumns" :key="col" class="tag-chip"
                :class="{ active: trackingGenreCols.includes(col) }"
                @click="toggleGenreCol(col)">{{ col }}</button>
            </div>
          </div>

          <!-- Custom columns -->
          <div>
            <span class="text-xs" style="color: var(--text-muted)">自定义列（添加你想让 AI 专门追踪的维度）</span>
            <div class="flex flex-wrap gap-1.5 mt-1.5">
              <span v-for="col in customColumns" :key="col" class="tag-chip active"
                style="background: rgba(201,169,110,0.12); color: var(--accent-gold)">
                {{ col }}
                <button class="ml-1 opacity-60 hover:opacity-100" @click="removeCustomColumn(col)">&times;</button>
              </span>
            </div>
            <div class="flex gap-2 mt-2">
              <input v-model="customColumnInput" class="input flex-1 !text-xs !py-1.5"
                placeholder="输入追踪维度，如「丹药收集」" @keyup.enter="addCustomColumn" />
              <button class="btn-primary !text-xs !py-1.5 !px-3" @click="addCustomColumn"
                :disabled="!customColumnInput.trim()">添加</button>
            </div>
          </div>
        </div>
      </SectionCard>

      <!-- Error -->
      <div v-if="error" class="badge badge-error w-full text-center !rounded-lg !py-3 animate-fade-in">{{ error }}</div>

      <!-- Submit -->
      <button class="btn-primary w-full py-3 text-base" :disabled="loading || !form.worldview.length"
        @click="generate">
        <span v-if="!user">请先登录后生成</span>
        <span v-else-if="loading">
          <span class="inline-block h-2 w-2 animate-pulse rounded-full mr-2" style="background:currentColor"></span>
          AI 正在创作...
        </span>
        <span v-else>✦ 开始生成</span>
      </button>

      <div v-if="!user" class="text-center">
        <NuxtLink to="/auth" class="text-sm font-medium transition-colors hover:underline" style="color: var(--accent-gold)">去登录</NuxtLink>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Header */
.creation-header {
  text-align: center;
  padding-top: 0.75rem;
}
.header-icon {
  font-size: 1.5rem;
  color: var(--accent-gold);
  margin-bottom: 0.25rem;
  opacity: 0.6;
}

/* Orientation buttons */
.orient-btn {
  flex: 1;
  padding: 0.625rem 1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: var(--bg-input);
  color: var(--text-secondary);
  font-weight: 500;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.orient-btn:hover {
  border-color: #4a4d58;
  color: var(--text-primary);
}
.orient-btn.active {
  background: linear-gradient(135deg, rgba(201,169,110,0.18), rgba(201,169,110,0.04));
  border-color: var(--accent-gold);
  color: var(--accent-gold);
  box-shadow: 0 0 12px rgba(201,169,110,0.08);
}

/* Count buttons */
.count-btn {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  background: var(--bg-input);
  color: var(--text-secondary);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all var(--transition-fast);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.count-btn:hover {
  border-color: var(--accent-gold);
  color: var(--text-primary);
}
.count-btn.active {
  background: linear-gradient(135deg, var(--accent-gold), var(--accent-gold-dark));
  color: #1a1a1a;
  font-weight: 700;
  border-color: transparent;
  box-shadow: 0 0 12px rgba(201,169,110,0.2);
}

/* Live dot */
.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-gold);
  animation: pulse-glow 1.5s ease-in-out infinite;
}
</style>
