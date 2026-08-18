/**
 * AI content for supplier product listing fields.
 *
 * Providers (first match wins):
 * 1. OPENROUTER_API_KEY → https://openrouter.ai (free models available)
 * 2. OPENAI_API_KEY → https://api.openai.com
 * 3. otherwise → local template fallback
 */
import { env, isProduction } from '../config/env.js'

const AI_FIELDS = new Set([
  'description',
  'feature',
  'additionalInfo',
  'specifications',
])

export function isAiField(field) {
  return AI_FIELDS.has(String(field || ''))
}

function buildPrompt(title, field) {
  const t = String(title || '').trim()
  switch (field) {
    case 'description':
      return `Write a professional marketplace product description (2-3 short paragraphs) for this construction product: "${t}". Focus on use cases, quality, and buyer benefits. No markdown headings.`
    case 'feature':
      return `List 5-7 key selling features for this construction product: "${t}". Return plain text, one feature per line, no bullets or numbers.`
    case 'additionalInfo':
      return `Write short additional product information (storage, handling, compatibility, warranty tips) for: "${t}". 1-2 short paragraphs. No markdown headings.`
    case 'specifications':
      return `Write technical specifications for this construction product: "${t}". Use plain lines like "Key: Value". Include typical construction-relevant attributes. No markdown headings.`
    default:
      return `Write marketplace copy for: "${t}"`
  }
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

function resolveProvider() {
  const openRouterKey = env.ai.openRouter.apiKey
  if (openRouterKey) {
    return {
      name: 'openrouter',
      apiKey: openRouterKey,
      url: 'https://openrouter.ai/api/v1/chat/completions',
      model: env.ai.openRouter.model,
      headers: {
        Authorization: `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': env.apiUrl,
        'X-Title': 'CONSTRUPRECO',
      },
    }
  }

  const openAiKey = env.ai.openAi.apiKey
  if (openAiKey) {
    return {
      name: 'openai',
      apiKey: openAiKey,
      url: 'https://api.openai.com/v1/chat/completions',
      model: env.ai.openAi.model,
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
    }
  }

  return null
}

async function callChatCompletions(prompt) {
  const provider = resolveProvider()
  if (!provider) return null

  const res = await fetch(provider.url, {
    method: 'POST',
    headers: provider.headers,
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content:
            'You write concise construction marketplace product copy in clear English. Avoid markdown headings and marketing fluff.',
        },
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
    const fromAi = await callChatCompletions(prompt)
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
