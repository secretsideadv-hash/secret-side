/** Walking directions to a point in Google Maps (opens the app on phones). */
export function googleMapsDirectionsUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    api: "1",
    destination: `${lat},${lng}`,
    travelmode: "walking",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
