import { LocationObject } from "expo-location";
import * as TaskManager from "expo-task-manager";

import { getAddressFromGpsPoint } from "~/utils/geo";

type BgLocationType = { locations: LocationObject[] };
const BG_LOCATION_TASK = "USER_LOCATION_SYNC_TASK";

/**
 * This Function is responsible for managing background jobs within the application.
 * It provides a functions to sync user current location periodically
 */
TaskManager.defineTask<BgLocationType>(
  BG_LOCATION_TASK,
  async ({ data, error }) => {
    console.log(
      "[Background Location Task] Executing background location task",
    );
    if (error) {
      // Error occurred - check `error.message` for more details.
      console.error("[Background Location Request Error]", error.message);
      return;
    }
    if (data.locations && data.locations.length > 0) {
      const location = data.locations[0];
      console.log("[Background Location] Received new locations", location);
      // Retrieve address from GPS coordinates
      const address = await getAddressFromGpsPoint({
        lat: location.coords.latitude,
        long: location.coords.longitude,
      });
      console.log(`[Background Location] Address: ${address}`);
    }
  },
);
