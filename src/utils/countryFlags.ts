// Authoritative CC3 (ISO 3166-1 alpha-3) → CC2 (alpha-2) map for F1 contexts.
// Covers all nationalities on the 2024-2026 F1 grid plus common circuit host nations.
const CC3_TO_2: Record<string, string> = {
  // Drivers — 2024-2026 grid
  GBR:'GB', NLD:'NL', ESP:'ES', FIN:'FI', GER:'DE', DEU:'DE',
  AUS:'AU', MEX:'MX', CAN:'CA', THA:'TH', JPN:'JP', CHN:'CN', FRA:'FR',
  ITA:'IT', BRA:'BR', USA:'US', DNK:'DK', DEN:'DK', NOR:'NO', BEL:'BE',
  CHE:'CH', NZL:'NZ', ARG:'AR', PER:'PE', IRL:'IE', AUT:'AT', POL:'PL',
  ISR:'IL', UAE:'AE', HUN:'HU', SWE:'SE', POR:'PT', RSA:'ZA', IND:'IN',
  // Monaco
  MCO:'MC', MON:'MC',
  // OpenF1 non-standard codes
  ZHO:'CN',   // Zhou Guanyu
  // Circuit host nations (used by SessionHeader country_code)
  BHR:'BH', SAU:'SA', SGP:'SG', AZE:'AZ', QAT:'QA',
  ABU:'AE', MIA:'US',
  // Extra
  GUA:'GT', CUB:'CU', SVN:'SI', CRO:'HR', SVK:'SK',
}

/** Convert a 3-letter country code to a flag emoji.  Returns '' if unknown. */
export function flagEmoji(code: string | null | undefined): string {
  if (!code) return ''
  const two = CC3_TO_2[code.toUpperCase()]
  if (!two) return ''
  return two.split('').map(c => String.fromCodePoint(0x1F1E0 + c.charCodeAt(0) - 65)).join('')
}

/** Convert a 2-letter (or 3-letter) country code to a flag emoji for circuits. */
export function circuitFlag(code: string | null | undefined): string {
  if (!code) return '🏁'
  const upper = code.toUpperCase()
  // If already 2-char, use directly
  if (upper.length === 2) {
    return upper.split('').map(c => String.fromCodePoint(0x1F1E0 + c.charCodeAt(0) - 65)).join('')
  }
  const two = CC3_TO_2[upper]
  if (!two) return '🏁'
  return two.split('').map(c => String.fromCodePoint(0x1F1E0 + c.charCodeAt(0) - 65)).join('')
}
