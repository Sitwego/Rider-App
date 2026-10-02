import { useCallback, useMemo, useRef } from "react";

import { useApiClient } from "~/hooks/useApiClient";

import { SAFETY_ALERTS_ENABLED } from "./safetyConfig";

import type { LatLng } from "./safetyMessages";

export type SafetyIncidentSource = "sheet_opened" | "alert_safety_team";

export type SafetyIncidentPayload = {
  ride_id: string;
  source: SafetyIncidentSource;
  rider_location: LatLng | null;
  car_location: LatLng | null;
  reported_at: string;
};

/**
 * Client for POST api/safety/incident. A no-op while SAFETY_ALERTS_ENABLED
 * is off (no backend or on-call yet); `enabled` tells the UI whether it
 * may show "safety team alerted" at all.
 */
export function useSafetyIncident() {
  const { makeApiCall } = useApiClient();
  const reported = useRef(new Set<string>());

  const report = useCallback(
    async (
      payload: Omit<SafetyIncidentPayload, "reported_at">,
    ): Promise<boolean> => {
      if (!SAFETY_ALERTS_ENABLED) return false;
      const key = `${payload.ride_id}:${payload.source}`;
      if (reported.current.has(key)) return true;
      try {
        await makeApiCall({
          method: "POST",
          url: "api/safety/incident",
          data: { ...payload, reported_at: new Date().toISOString() },
        });
        reported.current.add(key);
        return true;
      } catch (err) {
        console.error("[safety] incident report failed", err);
        return false;
      }
    },
    [makeApiCall],
  );

  return useMemo(() => ({ enabled: SAFETY_ALERTS_ENABLED, report }), [report]);
}
