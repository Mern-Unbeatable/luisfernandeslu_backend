/**
 * AI content for supplier / factory product listing fields.
 *
 * Provider selection:
 * - production  → GEMINI_API_KEY (Google Gemini)
 * - development → OPENROUTER_API_KEY (free/dev models)
 * Fallbacks: other configured keys, then local template (dev only on error).
 */
import { env, isProduction } from '../config/env.js'

const AI_FIELDS = new Set([
  'description',
  'feature',
  'additionalInfo',
  'specifications',
])

const SYSTEM_PROMPT =
  'You write concise construction marketplace product copy in clear English. Avoid markdown headings and marketing fluff.'

export function isAiField(field) {
  return AI_FIELDS.has(String(field || ''))
}

function buildPrompt(title, field) {
  const t = String(title || '').trim()
  switch (field) {
    case 'description':
      return `Product: "${t}". Write 2 short marketplace paragraphs (max ~120 words). Use cases + buyer benefits. No headings.`
    case 'feature':
      return `Product: "${t}". List exactly 6 selling features, one per line. No bullets/numbers.`
    case 'additionalInfo':
      return `Product: "${t}". Write 1 short paragraph on storage, handling, and warranty tips. No headings.`
    case 'specifications':
      return `Product: "${t}". Write 6 lines as "Key: Value" technical specs for construction use. No headings.`
    default:
      return `Write short marketplace copy for: "${t}"`
  }
}

/** Cap reply length so generation finishes faster. */
function maxOutputTokensFor(field) {
  switch (field) {
    case 'description':
      return 220
    case 'feature':
      return 160
    case 'additionalInfo':
      return 140
    case 'specifications':
      return 180
    default:
      return 200
  }
}

/**
 * Product copy is simple — keep thinking as low as the model allows.
 * gemini-flash-latest defaults to heavy thinking (often 20–50s + hundreds of thought tokens).
 */
function geminiThinkingConfig(model) {
  const id = String(model || '').toLowerCase()
  if (id.includes('2.5') || id.includes('2.0')) {
    return { thinkingBudget: 0 }
  }
  // Gemini 3 / *-latest: MINIMAL ≈ no thinking on flash-lite; some ids only accept LOW.
  return { thinkingLevel: 'MINIMAL' }
}

function templateFallback(title, field) {
  const t = String(title || 'Product').trim()
  switch (field) {
    case 'description':
      return `${t} is a reliable construction marketplace product selected for consistent performance on site. It is suitable for professional contractors and builders who need predictable quality and clear application guidance.\n\nUse according to project requirements and local standards. Pair with compatible materials from the same category for best results.`
    case 'feature':
      return [
        'Consistent site performance',
        'Suitable for professional construction use',
        'Clear application guidance',
        'Compatible with common project workflows',
        'Quality-focused marketplace listing',
      ].join('\n')
    case 'additionalInfo':
      return `Store ${t} in a dry, protected area away from moisture and extreme temperatures. Follow manufacturer guidance for handling and application. Verify quantity and packaging on delivery before use.`
    case 'specifications':
      return [
        `Product: ${t}`,
        'Category: Construction materials',
        'Intended use: Professional / commercial projects',
        'Compliance: Follow local building standards',
        'Packaging: As supplied by seller',
      ].join('\n')
    default:
      return t
  }
}

function geminiProvider() {
  const apiKey = env.ai.gemini.apiKey
  if (!apiKey) return null
  return {
    name: 'gemini',
    kind: 'gemini',
    apiKey,
    model: env.ai.gemini.model,
  }
}

function openRouterProvider() {
  const apiKey = env.ai.openRouter.apiKey
  if (!apiKey) return null
  return {
    name: 'openrouter',
    kind: 'openai',
    apiKey,
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: env.ai.openRouter.model,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': env.apiUrl,
      'X-Title': 'CONSTRUPRECO',
    },
  }
}

function openAiProvider() {
  const apiKey = env.ai.openAi.apiKey
  if (!apiKey) return null
  return {
    name: 'openai',
    kind: 'openai',
    apiKey,
    url: 'https://api.openai.com/v1/chat/completions',
    model: env.ai.openAi.model,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  }
}

/**
 * Prod → Gemini first. Dev → OpenRouter first.
 * Remaining configured providers are fallbacks.
 */
function resolveProvider() {
  if (isProduction) {
    return geminiProvider() || openAiProvider() || openRouterProvider()
  }
  return openRouterProvider() || geminiProvider() || openAiProvider()
}

async function callGemini(provider, prompt, field, { thinkingConfig } = {}) {
  const model = encodeURIComponent(provider.model)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  const thinking = thinkingConfig || geminiThinkingConfig(provider.model)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': provider.apiKey,
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: maxOutputTokensFor(field),
        thinkingConfig: thinking,
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (
      res.status === 400 &&
      thinking.thinkingLevel === 'MINIMAL' &&
      /thinking/i.test(text)
    ) {
      return callGemini(provider, prompt, field, {
        thinkingConfig: { thinkingLevel: 'LOW' },
      })
    }
    if (
      res.status === 400 &&
      thinking.thinkingBudget === 0 &&
      /thinking|invalid/i.test(text)
    ) {
      return callGemini(provider, prompt, field, {
        thinkingConfig: { thinkingLevel: 'MINIMAL' },
      })
    }
    const err = new Error(
      `${provider.name} request failed (${res.status}): ${text.slice(0, 200)}`,
    )
    err.status = 502
    err.code = 'AiProviderError'
    throw err
  }

  const data = await res.json()
  const parts = data?.candidates?.[0]?.content?.parts
  const content = Array.isArray(parts)
    ? parts
        .filter((p) => !p?.thought)
        .map((p) => p?.text || '')
        .join('')
        .trim()
    : ''
  return content ? { content, provider: provider.name } : null
}

async function callOpenAiCompatible(provider, prompt) {
  const res = await fetch(provider.url, {
    method: 'POST',
    headers: provider.headers,
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.5,
      max_tokens: 220,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(
      `${provider.name} request failed (${res.status}): ${text.slice(0, 200)}`,
    )
    err.status = 502
    err.code = 'AiProviderError'
    throw err
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  return content
    ? { content: String(content).trim(), provider: provider.name }
    : null
}

async function callProvider(prompt, field) {
  const provider = resolveProvider()
  if (!provider) return null

  if (provider.kind === 'gemini') {
    return callGemini(provider, prompt, field)
  }
  return callOpenAiCompatible(provider, prompt)
}

/**
 * @param {{ title: string, field: string }} input
 * @returns {Promise<{ field: string, content: string, provider: string }>}
 */
export async function generateProductCopy({ title, field }) {
  if (!title?.trim()) {
    const err = new Error('Title is required for AI generation')
    err.status = 400
    err.code = 'ValidationError'
    throw err
  }
  if (!isAiField(field)) {
    const err = new Error(
      'field must be one of: description, feature, additionalInfo, specifications',
    )
    err.status = 400
    err.code = 'ValidationError'
    throw err
  }

  const prompt = buildPrompt(title, field)
  const configured = resolveProvider()

  try {
    const fromAi = await callProvider(prompt, field)
    if (fromAi) {
      return { field, content: fromAi.content, provider: fromAi.provider }
    }
  } catch (err) {
    if (isProduction && configured) {
      throw err
    }
    console.error('[ai] fallback to template:', err.message)
  }

  return {
    field,
    content: templateFallback(title, field),
    provider: 'template',
  }
}

export default { generateProductCopy, isAiField }
