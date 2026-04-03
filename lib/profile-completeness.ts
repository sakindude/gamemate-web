export type BuyerProfileCompletenessInput = {
  country?: string | null
  gender?: string | null
  languages?: string[] | null
  communication_methods?: string[] | null
  primary_games?: string[] | null
}

export type ProfileCompletenessResult = {
  ok: boolean
  missing: string[]
}

export function checkBuyerProfileCompleteness(
  profile: BuyerProfileCompletenessInput | null | undefined
): ProfileCompletenessResult {
  const missing: string[] = []

  const country = (profile?.country || '').trim()
  const gender = (profile?.gender || '').trim()
  const languages = Array.isArray(profile?.languages) ? profile.languages : []
  const communicationMethods = Array.isArray(profile?.communication_methods)
    ? profile.communication_methods
    : []
  const primaryGames = Array.isArray(profile?.primary_games)
    ? profile.primary_games
    : []

  if (!country) missing.push('country')
  if (!gender) missing.push('gender')
  if (languages.length === 0) missing.push('languages')
  if (communicationMethods.length === 0) missing.push('communication_methods')
  if (primaryGames.length === 0) missing.push('primary_games')

  return {
    ok: missing.length === 0,
    missing,
  }
}