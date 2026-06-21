// Fallback headshot URLs for drivers whose headshot_url from OpenF1 is missing or broken.
// Keyed by name_acronym (uppercase).
const HEADSHOT_FALLBACKS: Record<string, string> = {
  'LIN': 'https://media.formula1.com/image/upload/c_fill,w_720/q_auto/v1740000001/common/f1/2026/racingbulls/arvlin01/2026racingbullsarvlin01right.webp',
}

/**
 * Returns the best available headshot URL for a driver.
 * Priority: fallback map → OpenF1 headshot_url → null
 */
export function getHeadshotUrl(acronym: string, openf1Url: string | null | undefined): string | null {
  const key = acronym?.toUpperCase()
  if (HEADSHOT_FALLBACKS[key]) return HEADSHOT_FALLBACKS[key]
  return openf1Url || null
}
