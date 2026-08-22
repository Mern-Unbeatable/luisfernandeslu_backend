/**
 * Static payload matching frontend DEMO_SUPPLIER_REVIEWS display fields.
 */
const PAGE = {
  summary: {
    averageRating: 4.5,
    totalReviews: 184,
    positivePercent: 90,
  },
  distribution: [
    { stars: 5, count: 125, percent: 68 },
    { stars: 4, count: 39, percent: 21 },
    { stars: 3, count: 11, percent: 6 },
    { stars: 2, count: 5, percent: 3 },
    { stars: 1, count: 4, percent: 2 },
  ],
  reviews: [
    {
      id: 'rev-001',
      customerName: 'John Doe',
      customerType: 'regular',
      productName: 'Premium Steel Sheets',
      orderId: 'ORD-1001',
      date: '2026-05-01',
      rating: 5,
      comment:
        'Excellent quality steel sheets. Exactly as described and delivered on time. Will order again for our next project.',
      avatarColor: '#14B8A6',
    },
    {
      id: 'rev-002',
      customerName: 'Sarah Johnson',
      customerType: 'company',
      productName: 'Heavy Machinery - Excavator',
      orderId: 'ORD-1002',
      date: '2026-04-28',
      rating: 5,
      comment:
        'Outstanding service from start to finish. The excavator arrived in perfect condition and the team was very professional.',
      avatarColor: '#3B82F6',
    },
    {
      id: 'rev-003',
      customerName: 'Michael Chen',
      customerType: 'regular',
      productName: 'Portland Cement - 500 Bags',
      orderId: 'ORD-1003',
      date: '2026-04-25',
      rating: 4,
      comment:
        'Good quality cement at a fair price. Delivery was slightly delayed but the product itself is top-notch.',
      avatarColor: '#8B5CF6',
    },
    {
      id: 'rev-004',
      customerName: 'Metro Construction',
      customerType: 'company',
      productName: 'Structural Steel Beams',
      orderId: 'ORD-1004',
      date: '2026-04-20',
      rating: 5,
      comment:
        'We have been sourcing steel from this supplier for over a year. Consistent quality and reliable delivery every time.',
      avatarColor: '#0EA5E9',
    },
    {
      id: 'rev-005',
      customerName: 'Emily Rodriguez',
      customerType: 'regular',
      productName: 'Clay Bricks - 10,000 Units',
      orderId: 'ORD-1005',
      date: '2026-04-15',
      rating: 4,
      comment:
        'Bricks were well packaged and arrived without damage. Happy with the purchase overall.',
      avatarColor: '#F59E0B',
    },
  ],
}

export class SupplierReviewsService {
  async list() {
    return {
      status: 200,
      body: PAGE,
    }
  }
}

export default new SupplierReviewsService()
