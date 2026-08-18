export function mapThreadSummary(thread) {
  return {
    id: thread.id,
    type: thread.type,
    quoteRequestId: thread.quoteRequestId,
    orderId: thread.orderId,
    productId: thread.productId,
    peerUserId: thread.peerUserId,
    participantIds: (thread.participants || []).map((p) => p.userId),
  }
}
