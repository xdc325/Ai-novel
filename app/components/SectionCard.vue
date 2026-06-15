<script setup lang="ts">
defineProps<{ title: string; required?: boolean }>()
</script>

<template>
  <section class="section-card">
    <div class="section-head">
      <div class="flex items-center gap-2">
        <span class="section-indicator"></span>
        <h2 class="section-title">{{ title }}</h2>
      </div>
      <span v-if="required" class="section-required">必选</span>
      <span v-else class="section-optional">可选</span>
    </div>
    <div class="section-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.section-card {
  background: linear-gradient(135deg, var(--bg-card), rgba(26,29,40,0.85));
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 1.25rem;
  box-shadow: var(--shadow-card);
  transition: border-color var(--transition-normal);
}
.section-card:hover {
  border-color: #353848;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}

.section-indicator {
  width: 3px;
  height: 14px;
  background: linear-gradient(to bottom, var(--accent-gold), transparent);
  border-radius: 2px;
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.02em;
}

.section-required {
  font-size: 0.6875rem;
  background: rgba(201,75,75,0.12);
  color: var(--accent-red);
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-weight: 500;
}

.section-optional {
  font-size: 0.6875rem;
  color: var(--text-muted);
}

.section-body {
  /* slot content */
}
</style>
