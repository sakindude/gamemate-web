// FILE START: lib/money.ts
export function formatMoney(cents: number | null | undefined, currencySymbol = '₺') {
  const safe = Number(cents || 0)
  return `${currencySymbol}${(safe / 100).toFixed(2)}`
}

export function toCents(amount: number | string) {
  const numeric = typeof amount === 'string' ? Number(amount) : amount
  if (!Number.isFinite(numeric)) return 0
  return Math.round(numeric * 100)
}

export function fromCents(cents: number | null | undefined) {
  return Number(cents || 0) / 100
}
// FILE END: lib/money.ts