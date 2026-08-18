export function addMonths(date, months) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + Number(months || 0))
  return d
}

export function startOfMonth(date = new Date()) {
  const d = new Date(date)
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

/** `YYYYMMDD` stamp used inside generated document numbers. */
export function dateStamp(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10).replace(/-/g, '')
}
