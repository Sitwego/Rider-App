/** Prefix of dev mock ride ids; such rides have no backend or native stream. */
export const MOCK_RIDE_PREFIX = "mock-";

export function isMockRideId(rideId: string): boolean {
  return rideId.startsWith(MOCK_RIDE_PREFIX);
}
