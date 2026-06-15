type ModelTask = 'world_gen' | 'chapter_gen' | 'consistency_check' | 'impact_assessment' | 'climax_chapter' | 'rewoo_plan' | 'reflexion' | 'got_evaluate'

interface ModelConfig {
  model: string
  apiKey: string
  baseUrl: string
}

const PRO_TASKS: ModelTask[] = ['world_gen', 'consistency_check', 'impact_assessment', 'climax_chapter', 'reflexion', 'got_evaluate']

export function getModelConfig(task: ModelTask): ModelConfig {
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
  const proKey = process.env.DEEPSEEK_API_KEY_PRO
  const flashKey = process.env.DEEPSEEK_API_KEY || ''

  if (proKey && PRO_TASKS.includes(task)) {
    return { model: 'deepseek-v4-pro', apiKey: proKey, baseUrl }
  }

  return { model: 'deepseek-v4-flash', apiKey: flashKey, baseUrl }
}
