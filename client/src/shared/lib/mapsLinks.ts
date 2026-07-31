// Deep-link builders — no in-app routing anywhere (documentation/md/SESSION_LOCATION_DESIGN.md
// decision), these just hand off to the user's own maps app/Google Maps in a new tab.

/** "Get Directions" — opens the user's own maps app rather than embedding a routing engine. */
export function directionsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}
