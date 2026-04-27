export function formatMoneyFromCents(
  value: number | null | undefined,
  currency: string = 'USD'
): string {
  const safe = Number(value || 0)
  const amount = safe / 100

  const hasFraction = safe % 100 !== 0

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount)

  if (currency === 'USD') {
    return `$${formatted}`
  }

  return `${formatted} ${currency}`
}

export function formatMoney(
  value: number | null | undefined,
  currency: string = 'USD'
): string {
  const safe = Number(value || 0)
  const roundedToCents = Math.round(safe * 100) / 100
  const hasFraction = Math.abs(roundedToCents % 1) > 0.000001

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(roundedToCents)

  if (currency === 'USD') {
    return `$${formatted}`
  }

  return `${formatted} ${currency}`
}