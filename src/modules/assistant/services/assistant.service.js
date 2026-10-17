import prisma from '../../../../lib/prisma.js'
import { liveListingWhere } from '../../listings/includes.js'
import { generateText } from '../../../lib/ai.js'



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
Reply in the same language as the user (e.g. English, Portuguese, Spanish).`

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
      if (result?.content) return result.content
    } catch (err) {
      console.error('[assistant] AI generation error:', err.message)
    }

    return this.generateFallbackText(userMessage, candidateProducts)
  }

  generateFallbackText(userMessage, candidateProducts) {
    if (candidateProducts.length > 0) {
      const top = candidateProducts[0]
      return `For "${userMessage}", we recommend taking a look at ${top.title}, as well as other compatible materials from our catalog shown below. Feel free to ask if you need technical advice or quantity estimation!`
    }
    return `We have received your requirement for "${userMessage}". Browse our catalog options below or let us know more details about your project so we can help you choose the right materials.`
  }

  async getChatHistory(userId) {
    if (!userId) return []

    const rows = await prisma.assistantChatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: 50,
    })

    return rows.map((r) => ({
      id: r.id,
      role: r.role,
      type: r.type,
      text: r.text || '',
      products: r.products || [],
      time: new Date(r.createdAt).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }),
    }))
  }

  async processChat(message, history = [], baseUrl = '', auth = null) {
    const cleanMessage = String(message || '').trim()
    if (!cleanMessage) {
      return {
        reply: 'Please let me know what material or project you need help with!',
        products: [],
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
    }
  }
}

export default new AssistantService()

