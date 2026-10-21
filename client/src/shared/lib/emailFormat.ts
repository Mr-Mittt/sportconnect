/**
 * ACCOUNT-7: a client-side check that a typed email looks like one: something, an `@`, a domain with a dot and a
 * last part of at least two characters, no spaces. It only saves a request; the server's own validation
 * (`@Email`, then the A35 rule) stays the authority. The value is trimmed first, as the request trims it.
 */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}
