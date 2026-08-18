/**
 * English ordinal suffix: 1 -> 1st, 12 -> 12th, 23 -> 23rd.
 */
export function ordinal(n) {
  const num = Number(n) || 0
  const mod100 = num % 100
  if (mod100 >= 11 && mod100 <= 13) return `${num}th`
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[num % 10] || 'th'
  return `${num}${suffix}`
}

export function ordinalLabel(n, noun = 'Installment') {
  return `${ordinal(n)} ${noun}`
}
