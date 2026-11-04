import prisma from '../../../../lib/prisma.js'

export class SupplierReviewsService {
  async list(supplierId) {
    if (!supplierId) {
      return {
        status: 200,
        body: {
          summary: { averageRating: 0, totalReviews: 0, positivePercent: 0 },
          distribution: [
            { stars: 5, count: 0, percent: 0 },
            { stars: 4, count: 0, percent: 0 },
            { stars: 3, count: 0, percent: 0 },
            { stars: 2, count: 0, percent: 0 },
            { stars: 1, count: 0, percent: 0 },
          ],
          reviews: [],
        },
      }
    }

    const reviews = await prisma.review.findMany({
      where: {
        product: {
          sellerId: supplierId,
        },
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        product: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    const totalReviews = reviews.length
    let totalRatingSum = 0
    let positiveCount = 0
    const starCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

    for (const r of reviews) {
      const rating = Math.min(Math.max(Number(r.rating) || 0, 1), 5)
      totalRatingSum += rating
      starCounts[rating] = (starCounts[rating] || 0) + 1
      if (rating >= 4) {
        positiveCount += 1
      }
    }

    const averageRating =
      totalReviews > 0 ? Number((totalRatingSum / totalReviews).toFixed(1)) : 0
    const positivePercent =
      totalReviews > 0
        ? Math.round((positiveCount / totalReviews) * 100)
        : 0

    const distribution = [5, 4, 3, 2, 1].map((stars) => {
      const count = starCounts[stars] || 0
      const percent =
        totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0
      return { stars, count, percent }
    })

    const mappedReviews = reviews.map((r) => {
      const authorName = r.author?.name || 'Cliente'
      const isCompany = String(r.author?.role || '').toLowerCase() === 'company'
      return {
        id: r.id,
        customerName: authorName,
        customerType: isCompany ? 'company' : 'regular',
        productName: r.product?.title || '',
        orderId: '',
        date: r.createdAt ? r.createdAt.toISOString().slice(0, 10) : '',
        rating: r.rating,
        comment: r.comment || '',
        avatarColor: '#14B8A6',
      }
    })

    return {
      status: 200,
      body: {
        summary: {
          averageRating,
          totalReviews,
          positivePercent,
        },
        distribution,
        reviews: mappedReviews,
      },
    }
  }
}

export default new SupplierReviewsService()
