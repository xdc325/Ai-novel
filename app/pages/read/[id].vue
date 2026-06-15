<script setup lang="ts">
const route = useRoute()
const novelId = route.params.id as string
const autoContinue = route.query.continue === '1'

const novel = ref<any>(null)
const currentChapter = ref<any>(null)
const chapterIndex = ref(0)
const loading = ref(true)
const error = ref('')

// Continue generation state
const generating = ref(false)
const genContent = ref('')
const genDone = ref(false)
const genHasMore = ref(false)
const genError = ref('')

// Interactions
const isLiked = ref(false)
const isFavorited = ref(false)
const likeCount = ref(0)
const favCount = ref(0)
const commentCount = ref(0)
const liking = ref(false)
const favoriting = ref(false)
const comments = ref<any[]>([])
const commentText = ref('')
const postingComment = ref(false)

// Instruction panel
const showInstructions = ref(false)
const instructionType = ref<'soft' | 'hard'>('soft')
const instructionContent = ref('')
const submittingInstruction = ref(false)
const instructionError = ref('')
const instructionResult = ref<any>(null)

// Immersive reading
const immersive = useState('immersive-reading', () => false)
const showToolbar = ref(true)
const hideToolbarTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const brightness = ref(90)
const imFontSize = ref('text-lg')
const imTheme = ref<'dark' | 'light' | 'sepia'>('dark')
const fontSizes = ['text-base', 'text-lg', 'text-xl', 'text-2xl']
const fontSizeLabels = ['小', '中', '大', '特大']
const fontIdx = ref(1)

const { user } = useUser()

async function fetchNovel() {
  try {
    const data = await $fetch(`/api/novels/${novelId}`) as any
    novel.value = data
    isLiked.value = data.isLiked || false
    isFavorited.value = data.isFavorited || false
    likeCount.value = data._count?.likes || 0
    favCount.value = data._count?.favorites || 0
    commentCount.value = data._count?.comments || 0
    if (data.chapters?.length > 0) {
      const completedChapters = data.chapters.filter((c: any) => c.status === 'completed')
      if (completedChapters.length > 0) {
        const lastIdx = data.chapters.indexOf(completedChapters[completedChapters.length - 1])
        chapterIndex.value = lastIdx
        currentChapter.value = data.chapters[lastIdx]
      } else {
        currentChapter.value = data.chapters[0]
        chapterIndex.value = 0
      }
    }
  } catch (e: any) {
    error.value = e.data?.message || '加载失败'
  } finally { loading.value = false }
}

async function fetchComments() {
  try {
    const data = await $fetch(`/api/novels/${novelId}/comments`) as any
    comments.value = data.comments || []
  } catch {}
}

function selectChapter(idx: number) {
  chapterIndex.value = idx
  currentChapter.value = novel.value.chapters[idx]
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function downloadNovel() {
  const completedChapters = novel.value.chapters.filter((c: any) => c.status === 'completed')
  const content = completedChapters.map((c: any) => `第${c.number}章 ${c.title}\n\n${c.content}`).join('\n\n')
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${novel.value.title}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

async function toggleLike() {
  if (!user.value || liking.value) return
  liking.value = true
  try {
    const token = useCookie('auth_token').value
    const res = await $fetch(`/api/novels/${novelId}/like`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }) as any
    isLiked.value = res.liked
    likeCount.value += res.liked ? 1 : -1
  } catch {} finally { liking.value = false }
}

async function toggleFavorite() {
  if (!user.value || favoriting.value) return
  favoriting.value = true
  try {
    const token = useCookie('auth_token').value
    const res = await $fetch(`/api/novels/${novelId}/favorite`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }) as any
    isFavorited.value = res.favorited
    favCount.value += res.favorited ? 1 : -1
  } catch {} finally { favoriting.value = false }
}

async function postComment() {
  if (!user.value || !commentText.value.trim() || postingComment.value) return
  postingComment.value = true
  try {
    const token = useCookie('auth_token').value
    const comment = await $fetch(`/api/novels/${novelId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: { content: commentText.value.trim() },
    }) as any
    comments.value.unshift(comment)
    commentCount.value++
    commentText.value = ''
  } catch {} finally { postingComment.value = false }
}

const canContinue = computed(() => {
  return novel.value?.type === 'long'
    && (novel.value?.status === 'ongoing' || novel.value?.status === 'generating')
})

async function continueNovel() {
  if (generating.value) return
  generating.value = true
  genContent.value = ''
  genDone.value = false
  genHasMore.value = false
  genError.value = ''

  try {
    const token = useCookie('auth_token').value
    const response = await fetch(`/api/novels/${novelId}/continue-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: '请求失败' }))
      genError.value = err.message || `HTTP ${response.status}`
      generating.value = false
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
          if (data.type === 'chunk') genContent.value += data.content
          else if (data.type === 'done') { genDone.value = true; genHasMore.value = !!data.hasMore }
          else if (data.type === 'error') genError.value = data.message
        } catch {}
      }
    }
    genDone.value = true
    await fetchNovel()
  } catch (e: any) {
    genError.value = e.message || '连接失败'
  } finally { generating.value = false }
}

function viewLatestChapter() {
  if (novel.value?.chapters) {
    const completed = novel.value.chapters.filter((c: any) => c.status === 'completed')
    if (completed.length > 0) {
      const latest = completed[completed.length - 1]
      const idx = novel.value.chapters.indexOf(latest)
      selectChapter(idx)
    }
  }
  genContent.value = ''
  genDone.value = false
}

async function submitInstruction() {
  const content = instructionContent.value.trim()
  if (!content || content.length < 5) { instructionError.value = '指令内容至少5个字'; return }
  if (content.length > 2000) { instructionError.value = '指令内容不能超过2000字'; return }

  submittingInstruction.value = true
  instructionError.value = ''
  instructionResult.value = null

  try {
    const token = useCookie('auth_token').value
    const res = await $fetch(`/api/novels/${novelId}/instruction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: { type: instructionType.value, content },
    }) as any
    instructionResult.value = res
    instructionContent.value = ''
    await fetchNovel()
  } catch (e: any) {
    instructionError.value = e.data?.message || e.message || '提交失败'
  } finally { submittingInstruction.value = false }
}

function getInstructions(): any[] {
  const tags = novel.value?.tags
  if (!tags?._instructions || !Array.isArray(tags._instructions)) return []
  return tags._instructions
}

// Immersive toolbar auto-hide
function resetToolbarTimer() {
  showToolbar.value = true
  if (hideToolbarTimer.value) clearTimeout(hideToolbarTimer.value)
  hideToolbarTimer.value = setTimeout(() => { showToolbar.value = false }, 4000)
}

function toggleImmersive() {
  immersive.value = !immersive.value
  if (immersive.value) resetToolbarTimer()
}

function exitImmersive() {
  immersive.value = false
}

function changeFontSize(dir: number) {
  fontIdx.value = Math.max(0, Math.min(fontSizes.length - 1, fontIdx.value + dir))
  imFontSize.value = fontSizes[fontIdx.value]
}

function cycleTheme() {
  const themes: ('dark' | 'light' | 'sepia')[] = ['dark', 'sepia', 'light']
  const idx = themes.indexOf(imTheme.value)
  imTheme.value = themes[(idx + 1) % 3]
}

const imThemeColors: Record<string, { bg: string; text: string; toolbarBg: string; frame: string; frameBorder: string }> = {
  dark:  { bg: '#0a0a0a', text: '#d4cfc4', toolbarBg: 'rgba(10,10,10,0.95)', frame: '#141414', frameBorder: '#2a2a2a' },
  light: { bg: '#f5f0e8', text: '#2c2416', toolbarBg: 'rgba(245,240,232,0.95)', frame: '#fffef9', frameBorder: '#d4c9b0' },
  sepia: { bg: '#f4ecd8', text: '#4a3728', toolbarBg: 'rgba(244,236,216,0.95)', frame: '#faf3e0', frameBorder: '#c4b898' },
}

onMounted(async () => {
  await fetchNovel()
  await fetchComments()
  if (autoContinue && canContinue.value) continueNovel()
})

onUnmounted(() => {
  immersive.value = false
  if (hideToolbarTimer.value) clearTimeout(hideToolbarTimer.value)
})
</script>

<template>
  <div v-if="loading" class="flex justify-center py-20">
    <p style="color: var(--text-muted)">加载中...</p>
  </div>

  <div v-else-if="error" class="badge badge-error w-full text-center !rounded-lg !py-3">{{ error }}</div>

  <div v-else-if="novel" class="mx-auto max-w-6xl">
    <!-- Non-immersive: normal page -->
    <div v-if="!immersive">
      <!-- Header bar -->
      <div class="mb-6 flex items-center justify-between">
        <NuxtLink to="/" class="text-sm transition-colors hover:underline" style="color: var(--text-muted)">&larr; 返回</NuxtLink>
        <div class="flex items-center gap-2">
          <button class="btn-secondary !text-xs" @click="downloadNovel">下载</button>
          <button class="btn-secondary !text-xs" style="color: var(--accent-gold); border-color: var(--accent-gold)" @click="toggleImmersive">沉浸阅读</button>
        </div>
      </div>

      <!-- Title -->
      <div class="mb-8 text-center">
        <h1 class="text-xl font-bold" style="color: var(--text-primary)">{{ novel.title }}</h1>
        <p class="mt-2 text-xs" style="color: var(--text-muted)">
          {{ novel.type === 'short' ? '短篇' : `长篇 · ${novel.chapters?.filter((c: any) => c.status === 'completed').length || 0}/${novel.chapters?.length || 0}章` }}
          · {{ novel.wordCount?.toLocaleString() }}字
          <span v-if="novel.status === 'ongoing'" class="ml-2 badge badge-warning">连载中</span>
          <span v-if="novel.status === 'generating'" class="ml-2 badge badge-warning" style="animation: pulse 2s infinite">生成中</span>
        </p>
        <!-- Author & interactions row -->
        <div class="mt-3 flex items-center justify-center gap-5 text-xs" style="color: var(--text-muted)">
          <span>{{ novel.user?.nickname || '匿名' }}</span>
          <button class="flex items-center gap-1 transition-colors hover:underline" :style="{ color: isLiked ? 'var(--accent-red)' : 'var(--text-muted)' }" @click="toggleLike">
            <span style="font-size:1.05em">{{ isLiked ? '❤️' : '🤍' }}</span> {{ likeCount }}
          </button>
          <button class="flex items-center gap-1 transition-colors hover:underline" :style="{ color: isFavorited ? 'var(--accent-gold)' : 'var(--text-muted)' }" @click="toggleFavorite">
            <span style="font-size:1.05em">{{ isFavorited ? '⭐' : '☆' }}</span> {{ favCount }}
          </button>
          <span>💬 {{ commentCount }}</span>
        </div>
      </div>

      <!-- Two-column: content + comments -->
      <div class="flex flex-col gap-6 lg:flex-row">
        <!-- Left: reading content -->
        <div class="flex-1 min-w-0">
          <div v-if="currentChapter?.content" class="card prose-reading">
            <div class="whitespace-pre-wrap leading-relaxed">{{ currentChapter.content }}</div>
          </div>

          <div v-else-if="novel.status === 'generating'" class="py-16 text-center">
            <div class="inline-block h-3 w-3 animate-pulse rounded-full" style="background: var(--accent-gold)"></div>
            <p class="mt-2 text-sm" style="color: var(--text-muted)">AI 正在创作章节中...</p>
          </div>

          <div v-else-if="novel.chapters?.length > 0" class="py-10 text-center text-sm" style="color: var(--text-muted)">
            请从下方章节列表选择阅读
          </div>

          <!-- Continue button -->
          <div v-if="canContinue" class="mt-6 text-center">
            <div v-if="generating" class="card mb-4 space-y-4">
              <div class="flex items-center justify-center gap-2 text-xs" style="color: var(--text-muted)">
                <span class="inline-block h-2 w-2 animate-pulse rounded-full" style="background: var(--accent-gold)"></span>
                AI 正在创作下一批章节 · {{ genContent.length }}字
              </div>
              <div v-if="genContent" class="prose-reading">
                <pre class="whitespace-pre-wrap font-sans text-sm leading-relaxed">{{ genContent }}</pre>
              </div>
              <div v-if="genDone" class="space-y-3">
                <p class="text-sm" style="color: var(--accent-green)">本批章节已完成！</p>
                <div class="flex justify-center gap-3">
                  <button class="btn-primary !text-sm" @click="viewLatestChapter">阅读最新章节</button>
                  <button v-if="genHasMore" class="btn-secondary" @click="continueNovel">继续生成下一批章节</button>
                </div>
              </div>
              <div v-if="genError" class="badge badge-error w-full !rounded-lg !py-2">{{ genError }}</div>
            </div>
            <button v-else class="btn-secondary w-full !border-dashed !py-3"
              style="border-color: var(--accent-gold); color: var(--accent-gold)"
              @click="continueNovel">+ 继续生成下一批章节</button>
          </div>

          <!-- Instruction Panel -->
          <div v-if="novel.type === 'long'" class="mt-4 card">
            <button class="flex w-full items-center justify-between text-sm font-medium"
              style="color: var(--text-primary)"
              @click="showInstructions = !showInstructions">
              <span>中途指令</span>
              <span class="text-xs" style="color: var(--text-muted)">{{ showInstructions ? '收起' : '展开' }}</span>
            </button>

            <div v-if="showInstructions" class="mt-3 space-y-3">
              <!-- Pending/Applied instructions -->
              <div v-if="getInstructions().length > 0" class="space-y-2">
                <div v-for="inst in getInstructions().slice().reverse().slice(0, 8)" :key="inst.id"
                  class="rounded-lg border px-3 py-2 text-xs"
                  :style="inst.status === 'applied'
                    ? { borderColor: 'var(--accent-green)', background: 'rgba(76,175,80,0.06)' }
                    : inst.type === 'hard' && inst.status === 'pending'
                      ? { borderColor: 'var(--accent-gold)', background: 'rgba(201,169,110,0.08)' }
                      : { borderColor: 'var(--border-color)', background: 'transparent' }">
                  <div class="flex items-center justify-between mb-1">
                    <span class="badge" :class="inst.type === 'hard' ? 'badge-error' : ''"
                      style="font-size:0.65rem">{{ inst.type === 'hard' ? '硬指令' : '软指令' }}</span>
                    <span style="color: var(--text-muted); font-size:0.65rem">
                      {{ inst.status === 'applied' ? `第${inst.chapterApplied}章已应用` : inst.status === 'confirmed' ? '已确认' : '待处理' }}
                    </span>
                  </div>
                  <p style="color: var(--text-secondary)">{{ inst.content }}</p>
                  <!-- Impact assessment for hard instructions -->
                  <div v-if="inst.impactAssessment && inst.status === 'pending'" class="mt-2 rounded p-2 text-xs"
                    style="background: rgba(201,169,110,0.06); color: var(--accent-gold); max-height: 10rem; overflow-y: auto">
                    <p class="whitespace-pre-wrap">{{ inst.impactAssessment }}</p>
                  </div>
                </div>
              </div>

              <!-- Input area -->
              <div>
                <div class="flex gap-3 mb-2">
                  <label class="flex items-center gap-1 text-xs" style="color: var(--text-secondary); cursor:pointer">
                    <input type="radio" v-model="instructionType" value="soft" class="radio" />
                    软指令（偏好调整）
                  </label>
                  <label class="flex items-center gap-1 text-xs" style="color: var(--text-secondary); cursor:pointer">
                    <input type="radio" v-model="instructionType" value="hard" class="radio" />
                    硬指令（设定变更）
                  </label>
                </div>
                <textarea v-model="instructionContent" class="input w-full !text-xs resize-none"
                  rows="3" placeholder="输入中途指令…&#10;软指令：如「希望主角性格更内敛一些」「减少打斗场景，增加心理描写」&#10;硬指令：如「把故事背景从古代改为近未来」「删掉张三这个角色」"
                  :disabled="submittingInstruction"></textarea>
                <div class="mt-2 flex items-center justify-between">
                  <p class="text-xs" style="color: var(--text-muted)">
                    硬指令会先评估对已有章节的影响，确认后执行
                  </p>
                  <button class="btn-primary !text-xs !py-1.5 !px-4"
                    :disabled="submittingInstruction || !instructionContent.trim()"
                    @click="submitInstruction">
                    {{ submittingInstruction ? '提交中...' : '提交指令' }}
                  </button>
                </div>
                <div v-if="instructionError" class="mt-2 text-xs" style="color: var(--accent-red)">{{ instructionError }}</div>
                <div v-if="instructionResult?.assessment" class="mt-2 rounded-lg p-3 text-xs"
                  style="background: rgba(201,169,110,0.08); border: 1px solid var(--accent-gold)">
                  <p class="font-medium mb-1" style="color: var(--accent-gold)">影响评估报告</p>
                  <p class="whitespace-pre-wrap" style="color: var(--text-secondary); max-height: 16rem; overflow-y: auto">{{ instructionResult.assessment }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Chapter list -->
          <div v-if="novel.type === 'long' && novel.chapters?.length > 0" class="mt-6 card">
            <div class="mb-3 flex items-center justify-between">
              <span class="text-sm font-medium" style="color: var(--text-primary)">章节目录</span>
              <span class="text-xs" style="color: var(--text-muted)">{{ novel.chapters.filter((c: any) => c.status === 'completed').length }}章已完成</span>
            </div>
            <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
              <button v-for="(ch, i) in novel.chapters.filter((c: any) => c.status !== 'planned')" :key="ch.id"
                class="rounded-lg px-3 py-2 text-left text-xs transition-all"
                :style="i === chapterIndex
                  ? { background: 'rgba(201,169,110,0.15)', color: 'var(--accent-gold)' }
                  : ch.status === 'completed'
                    ? { color: 'var(--text-secondary)' }
                    : { color: 'var(--text-muted)' }"
                :class="ch.status === 'completed' && i !== chapterIndex ? 'hover:bg-hover' : ''"
                :disabled="ch.status !== 'completed'"
                @click="selectChapter(i)"
              >第{{ ch.number }}章 {{ ch.status === 'draft' ? '(待生成)' : '' }}</button>
            </div>
          </div>
        </div>

        <!-- Right: comments panel -->
        <div class="w-full lg:w-80 shrink-0">
          <div class="card !p-4 space-y-4" style="position:sticky;top:1rem">
            <h3 class="text-sm font-semibold" style="color: var(--text-primary)">评论 ({{ commentCount }})</h3>

            <!-- Comment input -->
            <div v-if="user" class="space-y-2">
              <textarea v-model="commentText" placeholder="写下你的评论..." rows="2"
                class="input-dark resize-none" style="font-size:0.8125rem"></textarea>
              <button class="btn-primary w-full !py-1.5 !text-xs" :disabled="!commentText.trim() || postingComment"
                @click="postComment">{{ postingComment ? '发送中...' : '发表评论' }}</button>
            </div>
            <p v-else class="text-xs" style="color: var(--text-muted)">
              <NuxtLink to="/auth" style="color: var(--accent-gold)">登录</NuxtLink> 后参与评论
            </p>

            <!-- Comment list -->
            <div v-if="comments.length > 0" class="space-y-3 divide-y" style="border-color: var(--border-color)">
              <div v-for="c in comments" :key="c.id" class="pt-3 first:pt-0 first:border-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-xs font-medium" style="color: var(--accent-gold)">{{ c.user?.nickname || '匿名' }}</span>
                  <span class="text-xs" style="color: var(--text-muted)">{{ new Date(c.createdAt).toLocaleDateString('zh-CN') }}</span>
                </div>
                <p class="text-sm leading-relaxed" style="color: var(--text-secondary)">{{ c.content }}</p>
              </div>
            </div>
            <div v-else class="text-center text-xs" style="color: var(--text-muted)">暂无评论</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== IMMERSIVE READING OVERLAY ===== -->
    <Teleport to="body">
      <div v-if="immersive" class="im-overlay"
        :style="{
          backgroundColor: imThemeColors[imTheme].bg,
          color: imThemeColors[imTheme].text,
          filter: `brightness(${brightness / 100})`,
        }"
        @click="resetToolbarTimer" @scroll="resetToolbarTimer">
        <!-- Toolbar -->
        <div class="im-toolbar" :style="{ opacity: showToolbar ? 1 : 0, background: `linear-gradient(to bottom, ${imThemeColors[imTheme].toolbarBg}, transparent)` }">
          <button class="im-tool-btn" @click="exitImmersive">✕ 退出</button>
          <div class="flex items-center gap-3">
            <button class="im-tool-btn" @click="changeFontSize(-1)">A-</button>
            <span class="text-xs" style="opacity:0.6">{{ fontSizeLabels[fontIdx] }}</span>
            <button class="im-tool-btn" @click="changeFontSize(1)">A+</button>
            <div class="mx-1 h-4 w-px" style="background:currentColor;opacity:0.2"></div>
            <button class="im-tool-btn" @click="cycleTheme">
              {{ imTheme === 'dark' ? '🌙' : imTheme === 'sepia' ? '📖' : '☀️' }}
            </button>
            <input type="range" min="40" max="100" v-model.number="brightness"
              class="h-1 w-16 cursor-pointer" style="accent-color: currentColor; opacity: 0.5" />
          </div>
        </div>

        <!-- Content with book frame -->
        <div v-if="currentChapter?.content" class="im-content-wrapper">
          <div class="im-book-frame"
            :style="{
              backgroundColor: imThemeColors[imTheme].frame,
              borderColor: imThemeColors[imTheme].frameBorder,
              color: imThemeColors[imTheme].text,
            }">
            <h2 class="im-chapter-title">{{ currentChapter.title && currentChapter.title !== `第${currentChapter.number}章` ? `第${currentChapter.number}章 ${currentChapter.title}` : `第${currentChapter.number}章` }}</h2>
            <div class="im-book-content" :class="imFontSize">
              <div class="whitespace-pre-wrap leading-relaxed">{{ currentChapter.content }}</div>
            </div>
          </div>

          <!-- Chapter nav -->
          <div class="im-nav">
            <button v-if="chapterIndex > 0" class="im-nav-btn" @click="selectChapter(chapterIndex - 1)">&larr; 上一章</button>
            <div v-else></div>
            <button v-if="chapterIndex < (novel.chapters?.length || 0) - 1 && novel.chapters[chapterIndex + 1]?.status === 'completed'"
              class="im-nav-btn" @click="selectChapter(chapterIndex + 1)">下一章 &rarr;</button>
            <div v-else></div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* === Immersive Reading Styles === */
.im-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  overflow-y: auto;
  transition: background-color 0.4s, color 0.4s;
}

.im-toolbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 101;
  padding: 1rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: opacity 0.3s;
}

.im-tool-btn {
  background: none;
  border: none;
  color: inherit;
  font-size: 0.875rem;
  cursor: pointer;
  opacity: 0.6;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  transition: opacity 0.15s;
}
.im-tool-btn:hover { opacity: 1; }

.im-content-wrapper {
  max-width: 800px;
  margin: 0 auto;
  padding: 5rem 1.5rem 3rem;
}

.im-book-frame {
  border: 1px solid;
  border-radius: 4px;
  padding: 3rem 2.5rem;
  box-shadow: 0 2px 20px rgba(0,0,0,0.15), 0 0 0 8px rgba(0,0,0,0.03);
  min-height: 70vh;
}

.im-chapter-title {
  text-align: center;
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 2.5rem;
  opacity: 0.7;
  letter-spacing: 0.05em;
}

.im-book-content {
  font-family: "Noto Serif SC", "Source Han Serif SC", "SimSun", "STSong", Georgia, serif;
  line-height: 2.1;
  transition: font-size 0.2s;
}

.im-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 2.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid;
  border-color: inherit;
  opacity: 0.3;
}

.im-nav-btn {
  background: none;
  border: none;
  color: inherit;
  font-size: 0.875rem;
  cursor: pointer;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  transition: opacity 0.15s;
}
.im-nav-btn:hover { opacity: 0.7; }

@media (max-width: 640px) {
  .im-book-frame {
    padding: 1.5rem 1rem;
    box-shadow: none;
  }
  .im-content-wrapper {
    padding: 4rem 0.5rem 2rem;
  }
}
</style>
