/** Up to two uppercase initials from a full name, e.g. `"Jordan Lee"` -> `"JL"`. */
export function initialsFor(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
