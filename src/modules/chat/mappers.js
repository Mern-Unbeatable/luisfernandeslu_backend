export function mapThreadSummary(thread) {
  const participants = (thread.participants || []).map((p) => ({
    id: p.userId,
    name: p.user?.profile?.companyName || p.user?.name || p.user?.email || 'Unknown User',
    role: p.user?.role || 'Unknown',
  }))

  return {
    id: thread.id,
    type: thread.type,
    quoteRequestId: thread.quoteRequestId,
    orderId: thread.orderId,
    productId: thread.productId,
    peerUserId: thread.peerUserId,
    participants,
    participantIds: (thread.participants || []).map((p) => p.userId),
    lastMessage: thread.messages && thread.messages.length > 0 ? thread.messages[0] : null,
    updatedAt: thread.updatedAt,
  }
}
