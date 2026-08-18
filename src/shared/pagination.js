/**
 * Normalizes `page`/`limit` query params into Prisma `skip`/`take`.
 * Defaults differ per listing, so callers pass their own.
 */
export function parsePagination(query = {}, { defaultLimit = 10, maxLimit = 50 } = {}) {
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(maxLimit, Math.max(1, Number(query.limit) || defaultLimit))
  return { page, limit, skip: (page - 1) * limit, take: limit }
}

export function paginationMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}

/** Case-insensitive `contains` filters across the given fields. */
export function searchFilter(search, fields) {
  const term = String(search || '').trim()
  if (!term) return null
  return fields.map((field) => {
    const parts = String(field).split('.')
    return parts.reduceRight(
      (acc, key) => ({ [key]: acc }),
      { contains: term, mode: 'insensitive' },
    )
  })
}
