import prisma from '../../../../lib/prisma.js'
import { liveListingWhere } from '../../listings/includes.js'
import { generateText } from '../../../lib/ai.js'

const DEFAULT_LANGUAGE = 'pt'

const LANGUAGE_MARKERS = {
  pt: [
    'não', 'você', 'preciso', 'quero', 'obra', 'obras', 'qual', 'quanto', 'onde', 'para', 'uma', 'com',
    'por', 'mais', 'muito', 'também', 'produto', 'produtos', 'saco', 'sacos', 'excelente', 'ideal',
    'cimento', 'azulejo', 'azulejos', 'tijolo', 'tijolos', 'telhado', 'tinta', 'parede', 'paredes',
    'chão', 'piso', 'pisos', 'cola', 'madeira', 'areia', 'betão', 'isolamento', 'tubo', 'casa',
    'recomendo', 'recomendamos', 'olá', 'obrigado', 'obrigada', 'é', 'são', 'os', 'as', 'do', 'da', 'no', 'na',
  ],
  es: [
    'necesito', 'quiero', 'hola', 'gracias', 'cuánto', 'cuanto', 'dónde', 'donde', 'el', 'los', 'las',
    'del', 'muy', 'también', 'pared', 'suelo', 'ladrillo', 'ladrillos', 'techo', 'pintura', 'arena',
    'hormigón', 'yeso', 'producto', 'productos', 'saco', 'sacos', 'recomiendo', 'es', 'son', 'y', 'tu', 'su',
  ],
  en: [
    'the', 'i', 'need', 'want', 'for', 'my', 'what', 'how', 'which', 'is', 'are', 'and', 'to', 'of',
    'with', 'you', 'your', 'this', 'that', 'it', 'we', 'recommend', 'product', 'products', 'bag', 'bags',
    'cement', 'tile', 'tiles', 'brick', 'bricks', 'roof', 'paint', 'wall', 'walls', 'floor', 'floors',
    'adhesive', 'wood', 'sand', 'concrete', 'insulation', 'waterproof', 'pipe', 'house', 'hello', 'thanks',
  ],
}

/** Best-effort pt/en/es detection; ambiguous text falls back to Portuguese (the site language). */
export function detectLanguage(text) {
  const raw = String(text || '').toLowerCase()
  const scores = { pt: 0, es: 0, en: 0 }
  if (/[ãõç]/.test(raw)) scores.pt += 3
  if (/[ñ¿¡]/.test(raw)) scores.es += 3
  const words = raw.split(/[^a-z\u00C0-\u017F]+/).filter(Boolean)
  for (const word of words) {
    for (const [lang, markers] of Object.entries(LANGUAGE_MARKERS)) {
      if (markers.includes(word)) scores[lang] += 1
    }
  }
  const [best, bestScore] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
  return bestScore > 0 ? best : DEFAULT_LANGUAGE
}

const FALLBACK_TEXT = {
  pt: {
    withProduct: (msg, title) =>
      `Para "${msg}", recomendamos o produto ${title}, bem como outros materiais compatíveis do nosso catálogo apresentados abaixo. Se precisar de conselhos técnicos ou de calcular quantidades, é só perguntar!`,
    noProduct: (msg) =>
      `Recebemos o seu pedido sobre "${msg}". Veja as opções do catálogo abaixo ou dê-nos mais detalhes sobre a sua obra para o ajudarmos a escolher os materiais certos.`,
    empty: 'Diga-me de que material ou projeto precisa de ajuda!',
  },
  en: {
    withProduct: (msg, title) =>
      `For "${msg}", we recommend taking a look at ${title}, as well as other compatible materials from our catalog shown below. Feel free to ask if you need technical advice or quantity estimation!`,
    noProduct: (msg) =>
      `We have received your requirement for "${msg}". Browse our catalog options below or let us know more details about your project so we can help you choose the right materials.`,
    empty: 'Please let me know what material or project you need help with!',
  },
  es: {
    withProduct: (msg, title) =>
      `Para "${msg}", te recomendamos ${title}, así como otros materiales compatibles de nuestro catálogo que ves abajo. ¡Pregunta si necesitas asesoramiento técnico o calcular cantidades!`,
    noProduct: (msg) =>
      `Hemos recibido tu solicitud sobre "${msg}". Mira las opciones del catálogo abajo o danos más detalles de tu obra para ayudarte a elegir los materiales adecuados.`,
    empty: '¡Dime con qué material o proyecto necesitas ayuda!',
  },
}

/**
 * Assistant AI Service:
 * Matches user requirements/problems with active marketplace products,
 * and generates conversational advice with direct product suggestions.
 */
export class AssistantService {
  /**
   * Search relevant products from the marketplace catalog based on user query
   */
  async findRelevantProducts(queryText, limit = 4, baseUrl = '') {
    const rawTokens = String(queryText || '')
      .toLowerCase()
      .replace(/[^\w\s\u00C0-\u017F]/gi, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3)

    // Stop words to ignore
    const stopWords = new Set([
      'need', 'want', 'looking', 'please', 'help', 'with', 'some', 'good', 'best',
      'para', 'preciso', 'quero', 'ajuda', 'onde', 'como', 'com', 'mais', 'melhor',
      'para', 'uma', 'uns', 'umas', 'este', 'esta', 'isto', 'that', 'this', 'from'
    ])
    const keywords = rawTokens.filter((k) => !stopWords.has(k)).slice(0, 5)

    const baseWhere = liveListingWhere()

    let products = []
    if (keywords.length > 0) {
      const orClauses = keywords.flatMap((kw) => [
        { title: { contains: kw, mode: 'insensitive' } },
        { shortDescription: { contains: kw, mode: 'insensitive' } },
        { category: { name: { contains: kw, mode: 'insensitive' } } },
        { category: { parentCategory: { name: { contains: kw, mode: 'insensitive' } } } },
      ])

      products = await prisma.product.findMany({
        where: {
          AND: [baseWhere, { OR: orClauses }],
        },
        include: {
          media: { orderBy: { sortOrder: 'asc' }, take: 2 },
          category: { select: { id: true, name: true, slug: true } },
        },
        orderBy: [{ isFeatured: 'desc' }, { updatedAt: 'desc' }],
        take: limit,
      })
    }

    // Fallback: If no exact keyword match, fetch top featured or active products
    if (products.length === 0) {
      products = await prisma.product.findMany({
        where: baseWhere,
        include: {
          media: { orderBy: { sortOrder: 'asc' }, take: 2 },
          category: { select: { id: true, name: true, slug: true } },
        },
        orderBy: [{ isFeatured: 'desc' }, { updatedAt: 'desc' }],
        take: limit,
      })
    }

    return products.map((p) => {
      const publicSlug = p.slug?.includes('__') ? p.slug.split('__').pop() : p.slug
      const firstMedia = p.media?.[0]
      const imageUrl = firstMedia
        ? (firstMedia.mediaUrl?.startsWith('http') ? firstMedia.mediaUrl : `${baseUrl}${firstMedia.mediaUrl}`)
        : null

      return {
        id: p.id,
        title: p.title,
        slug: publicSlug,
        sku: p.sku,
        basePrice: Number(p.basePrice) || 0,
        unitOfMeasure: p.unitOfMeasure || 'unit',
        image: imageUrl,
        category: p.category ? { id: p.category.id, name: p.category.name } : null,
      }
    })
  }

  /**
   * Generates AI advice based on user query and candidate products
   */
  async generateAiResponse(userMessage, candidateProducts, conversationHistory = []) {
    const productCatalogSummary = candidateProducts.map((p, i) => 
      `${i + 1}. "${p.title}" (${p.category?.name || 'General'}) - €${p.basePrice.toFixed(2)}/${p.unitOfMeasure}`
    ).join('\n')

    const systemPrompt = `You are the Construction & Building Materials AI Assistant for "Construpreço", an online construction marketplace.
Your goal is to assist contractors, builders, and homeowners with their building problems and material needs.
Be friendly, professional, practical, and helpful.
Recommend materials and mention specifically how the available products from our store can solve their requirement.
Keep your response concise (2 to 4 sentences maximum).
Never invent products that are not in the list.
Write the whole reply in the same language as the user's message (English, Portuguese or Spanish). For Portuguese, use European Portuguese. Keep product names exactly as listed, but write everything else in the user's language.
Use plain text only: no Markdown, no asterisks, no bullet points.`

    const userPrompt = `User asks: "${userMessage}"

Available products in our catalog for this request:
${productCatalogSummary || 'No exact products found.'}

Please advise the user briefly and recommend the best matching product(s) from the list.`

    try {
      const result = await generateText({
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.6,
        maxTokens: 250,
      })
      if (result?.content) return result.content.replace(/\*\*|__/g, '').trim()
    } catch (err) {
      console.error('[assistant] AI generation error:', err.message)
    }

    return this.generateFallbackText(userMessage, candidateProducts)
  }

  generateFallbackText(userMessage, candidateProducts) {
    const texts = FALLBACK_TEXT[detectLanguage(userMessage)]
    if (candidateProducts.length > 0) {
      return texts.withProduct(userMessage, candidateProducts[0].title)
    }
    return texts.noProduct(userMessage)
  }

  async getChatHistory(userId) {
    if (!userId) return []

    const rows = await prisma.assistantChatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: 50,
    })

    // Product cards follow the assistant reply they belong to, so they share its language.
    let lastReplyLanguage = DEFAULT_LANGUAGE
    return rows.map((r) => {
      if (r.role === 'assistant' && r.type === 'text') {
        lastReplyLanguage = detectLanguage(r.text)
      }
      return {
        id: r.id,
        role: r.role,
        type: r.type,
        text: r.text || '',
        products: r.products || [],
        language: r.role === 'assistant' ? lastReplyLanguage : undefined,
        time: new Date(r.createdAt).toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        }),
      }
    })
  }

  async processChat(message, history = [], baseUrl = '', auth = null) {
    const cleanMessage = String(message || '').trim()
    if (!cleanMessage) {
      return {
        reply: FALLBACK_TEXT[DEFAULT_LANGUAGE].empty,
        products: [],
        language: DEFAULT_LANGUAGE,
      }
    }

    const candidateProducts = await this.findRelevantProducts(cleanMessage, 4, baseUrl)
    const replyText = await this.generateAiResponse(cleanMessage, candidateProducts, history)

    // If user is logged in, persist the messages into database
    const userId = auth?.id
    if (userId) {
      try {
        await prisma.$transaction([
          // Save user prompt
          prisma.assistantChatMessage.create({
            data: {
              userId,
              role: 'user',
              type: 'text',
              text: cleanMessage,
            },
          }),
          // Save assistant AI text reply
          prisma.assistantChatMessage.create({
            data: {
              userId,
              role: 'assistant',
              type: 'text',
              text: replyText,
            },
          }),
          // Save product recommendation cards if any
          ...(candidateProducts && candidateProducts.length > 0
            ? [
                prisma.assistantChatMessage.create({
                  data: {
                    userId,
                    role: 'assistant',
                    type: 'products',
                    products: candidateProducts,
                  },
                }),
              ]
            : []),
        ])
      } catch (err) {
        console.error('[assistant] Error persisting chat history:', err.message)
      }
    }

    return {
      reply: replyText,
      products: candidateProducts,
      language: detectLanguage(replyText),
    }
  }
}

export default new AssistantService()

