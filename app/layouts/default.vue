<script setup lang="ts">
const { user, logout } = useUser()
const { fetchUser } = useUser()
const route = useRoute()

// Immersive reading mode — hide sidebar when reading
const isReadingPage = computed(() => route.path.startsWith('/read/'))
const immersiveReading = useState('immersive-reading', () => false)
const hideSidebar = computed(() => isReadingPage.value && immersiveReading.value)

const navItems = [
  { to: '/', label: '创作', icon: '✏️' },
  { to: '/community', label: '社区', icon: '🏠' },
  { to: '/me', label: '我的', icon: '👤' },
]

// ── Particle streamline canvas ──
const particleCanvas = ref<HTMLCanvasElement | null>(null)
let particleAnimId = 0

interface Particle {
  x: number; y: number; size: number; speedX: number; speedY: number
  opacity: number; life: number; maxLife: number; side: 'left' | 'right'
  reset(): void
}

function initParticles() {
  const canvas = particleCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const resize = () => {
    const dpr = window.devicePixelRatio || 1
    canvas.width = window.innerWidth * dpr
    canvas.height = window.innerHeight * dpr
    canvas.style.width = window.innerWidth + 'px'
    canvas.style.height = window.innerHeight + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  window.addEventListener('resize', resize)

  const W = () => window.innerWidth
  const H = () => window.innerHeight

  const particles: Particle[] = []
  const PARTICLE_COUNT = 50

  const createParticle = (side: 'left' | 'right'): Particle => ({
    x: 0, y: 0, size: 0, speedX: 0, speedY: 0,
    opacity: 0, life: 0, maxLife: 0, side,
    reset() {
      this.x = side === 'left'
        ? Math.random() * W() * 0.28
        : W() * 0.72 + Math.random() * W() * 0.28
      this.y = H() + 10
      this.size = Math.random() * 2.2 + 0.6
      this.speedX = (Math.random() - 0.5) * 0.35
      this.speedY = -(Math.random() * 0.55 + 0.25)
      this.opacity = Math.random() * 0.7 + 0.15
      this.maxLife = Math.random() * 350 + 200
      this.life = Math.random() * this.maxLife
    },
  })

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(createParticle(i < PARTICLE_COUNT / 2 ? 'left' : 'right'))
  }

  // Streamline control points — gently drifting
  const streamLines: { baseX: number; baseY: number; offset: number; x: number; y: number }[][] = [[], []]
  for (let s = 0; s < 2; s++) {
    for (let i = 0; i < 5; i++) {
      const bx = s === 0
        ? 15 + Math.random() * 160
        : W() - 15 - Math.random() * 160
      streamLines[s].push({
        baseX: bx, baseY: Math.random() * H(),
        offset: Math.random() * Math.PI * 2,
        x: bx, y: 0,
      })
    }
  }

  let frame = 0
  function animate() {
    ctx.clearRect(0, 0, W(), H())
    frame++

    // Update & draw particles
    for (const p of particles) {
      p.x += p.speedX + Math.sin(frame * 0.015 + p.life * 0.01) * 0.25
      p.y += p.speedY
      p.life--
      if (p.life <= 0 || p.y < -20) p.reset()

      const alpha = p.opacity * Math.min(p.life / 40, (p.maxLife - p.life) / 25, 1)
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(201,169,110,${Math.min(alpha, 0.85)})`
      ctx.fill()

      // Glow halo for larger particles
      if (p.size > 1.5) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(201,169,110,${Math.min(alpha * 0.25, 0.2)})`
        ctx.fill()
      }
    }

    // Draw connection lines between nearby particles on same side
    for (let side = 0; side < 2; side++) {
      const sideP = particles.filter(p => p.side === (side === 0 ? 'left' : 'right'))
      for (let i = 0; i < sideP.length; i++) {
        for (let j = i + 1; j < sideP.length; j++) {
          const dx = sideP[i].x - sideP[j].x
          const dy = sideP[i].y - sideP[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 130) {
            const alpha = (1 - dist / 130) * 0.12
            ctx.beginPath()
            ctx.moveTo(sideP[i].x, sideP[i].y)
            ctx.lineTo(sideP[j].x, sideP[j].y)
            ctx.strokeStyle = `rgba(201,169,110,${alpha})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }

      // Draw flowing streamline
      const line = streamLines[side]
      for (const pt of line) {
        pt.x = pt.baseX + Math.sin(frame * 0.008 + pt.offset) * 35
        pt.y = pt.baseY + Math.cos(frame * 0.006 + pt.offset) * 50
        if (pt.y < -100) pt.baseY = H() + 100
        if (pt.y > H() + 100) pt.baseY = -100
      }
      line.sort((a, b) => a.y - b.y)

      ctx.beginPath()
      ctx.moveTo(line[0].x, line[0].y)
      for (let i = 0; i < line.length - 1; i++) {
        const cx = (line[i].x + line[i + 1].x) / 2
        const cy = (line[i].y + line[i + 1].y) / 2
        ctx.quadraticCurveTo(line[i].x, line[i].y, cx, cy)
      }
      ctx.strokeStyle = 'rgba(201,169,110,0.07)'
      ctx.lineWidth = 1.2
      ctx.stroke()

      // Slightly wider glow line behind it
      ctx.beginPath()
      ctx.moveTo(line[0].x, line[0].y)
      for (let i = 0; i < line.length - 1; i++) {
        const cx = (line[i].x + line[i + 1].x) / 2
        const cy = (line[i].y + line[i + 1].y) / 2
        ctx.quadraticCurveTo(line[i].x, line[i].y, cx, cy)
      }
      ctx.strokeStyle = 'rgba(201,169,110,0.03)'
      ctx.lineWidth = 4
      ctx.stroke()
    }

    particleAnimId = requestAnimationFrame(animate)
  }

  animate()
}

onMounted(() => {
  fetchUser()
  nextTick(() => initParticles())
})

onUnmounted(() => {
  if (particleAnimId) cancelAnimationFrame(particleAnimId)
})
</script>

<template>
  <div class="app-root flex min-h-screen">
    <!-- Ambient glow -->
    <div class="ambient-glow"></div>
    <!-- Particle streamline canvas -->
    <canvas ref="particleCanvas" class="particle-canvas"></canvas>

    <!-- Sidebar -->
    <aside v-if="!hideSidebar" class="sidebar">
      <!-- Logo area -->
      <div class="logo-area">
        <div class="logo-icon">
          <span style="font-size:1.4rem;line-height:1">墨</span>
        </div>
        <div class="logo-text">
          <span class="text-lg font-bold tracking-wider" style="color: var(--accent-gold); text-shadow: 0 0 30px rgba(201,169,110,0.2)">墨语</span>
          <span class="logo-badge">AI</span>
        </div>
      </div>

      <!-- Decorative divider -->
      <div class="px-5">
        <div class="ornament-divider gold" style="font-size:0.625rem">✦</div>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 space-y-0.5 px-3">
        <NuxtLink
          v-for="item in navItems" :key="item.to" :to="item.to"
          class="nav-item" :class="{ active: route.path === item.to }"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
          <span v-if="route.path === item.to" class="nav-dot" />
        </NuxtLink>
      </nav>

      <!-- Bottom section -->
      <div class="sidebar-bottom">
        <div class="ornament-divider" style="margin-bottom:0.75rem;font-size:0.5rem">◆</div>
        <template v-if="user">
          <NuxtLink to="/me" class="user-card">
            <div class="user-avatar">
              {{ user.nickname?.[0] || '?' }}
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium" style="color: var(--text-primary)">{{ user.nickname }}</p>
              <p class="truncate text-xs" style="color: var(--text-muted)">{{ user.email }}</p>
            </div>
            <span class="user-arrow">›</span>
          </NuxtLink>
          <button class="logout-btn" @click="logout()">退出登录</button>
        </template>
        <NuxtLink v-else to="/auth" class="btn-primary flex w-full items-center justify-center text-sm !py-2.5">
          登录 / 注册
        </NuxtLink>
      </div>
    </aside>

    <!-- Main content area -->
    <main class="main-area" :class="{ 'main-immersive': hideSidebar }">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  width: 220px;
  height: 100vh;
  background: linear-gradient(180deg, rgba(18,20,30,0.92) 0%, rgba(22,24,36,0.88) 100%);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-right: 1px solid rgba(201,169,110,0.08);
}

/* App root — transparent wrapper */
.app-root {
  background: transparent;
}

/* Main area sits above ambient glow */
.main-area {
  position: relative;
  z-index: 1;
}

/* Particle canvas */
.particle-canvas {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

/* Logo */
.logo-area {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 1.25rem 1.25rem 1rem;
}
.logo-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(201,169,110,0.2), rgba(201,169,110,0.05));
  border: 1px solid rgba(201,169,110,0.2);
  border-radius: 10px;
  color: var(--accent-gold);
}
.logo-text {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.logo-badge {
  background: linear-gradient(135deg, rgba(201,169,110,0.15), rgba(201,169,110,0.04));
  border: 1px solid rgba(201,169,110,0.15);
  border-radius: 4px;
  padding: 0.0625rem 0.375rem;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--accent-gold-light);
}

/* Nav items */
.nav-icon {
  font-size: 1.05rem;
  width: 1.5rem;
  text-align: center;
}
.nav-dot {
  margin-left: auto;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent-gold);
  box-shadow: 0 0 6px rgba(201,169,110,0.5);
}

/* Bottom */
.sidebar-bottom {
  border-top: 1px solid rgba(201,169,110,0.08);
  padding: 0.75rem 1rem 1rem;
}
.user-card {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem;
  border-radius: 0.625rem;
  transition: background var(--transition-fast);
  text-decoration: none;
  color: inherit;
}
.user-card:hover {
  background: var(--bg-hover);
}
.user-avatar {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--accent-gold), var(--accent-gold-dark));
  color: #1a1a1a;
  font-weight: 700;
  font-size: 0.875rem;
  border-radius: 50%;
  flex-shrink: 0;
}
.user-arrow {
  color: var(--text-muted);
  font-size: 1.1rem;
  transition: color var(--transition-fast);
}
.user-card:hover .user-arrow {
  color: var(--accent-gold);
}
.logout-btn {
  display: block;
  width: 100%;
  background: none;
  border: none;
  color: rgba(201,75,75,0.45);
  font-size: 0.75rem;
  padding: 0.375rem 0.5rem;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all var(--transition-fast);
  margin-top: 0.25rem;
  text-align: left;
}
.logout-btn:hover {
  background: rgba(201,75,75,0.06);
  color: rgba(201,75,75,0.75);
}

/* Main area */
.main-area {
  flex: 1;
  margin-left: 220px;
  padding: 2rem;
  transition: all 0.3s ease;
  min-height: 100vh;
}
.main-immersive {
  margin-left: 0;
  padding: 0;
}
</style>
