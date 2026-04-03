export function formatMoneyFromCents(
  value: number | null | undefined,
  currency: string = "USD"
): string {
  const amount = (Number(value || 0) / 100).toFixed(2)

  if (currency === "USD") {
    return `$${amount}`
  }

  // fallback (ileride başka currency açarsan)
  return `${amount} ${currency}`
}

export function formatMoney(
  value: number | null | undefined,
  currency: string = "USD"
): string {
  const amount = Number(value || 0).toFixed(2)

  if (currency === "USD") {
    return `$${amount}`
  }

  return `${amount} ${currency}`
}