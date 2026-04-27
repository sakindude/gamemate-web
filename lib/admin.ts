export function normalizeAdminEmail(email: string | null | undefined) {
  return (email || '').trim().toLowerCase()
}

export function isAdminEmail(_email: string | null | undefined) {
  return false
}