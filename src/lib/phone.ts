/** "0712 345 678", "+254712345678" or "712345678" → "+254 712 345 678", or null if it isn't a Kenyan mobile number. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, '').replace(/^\+/, '')
  const national = digits.startsWith('254') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits
  const m = /^([17]\d{2})(\d{3})(\d{3})$/.exec(national)
  return m ? `+254 ${m[1]} ${m[2]} ${m[3]}` : null
}
