import { NativeModules, NativeEventEmitter } from "react-native";

const { SitwegoMainModule } = NativeModules;

const nativeBridgeEventEmitter = new NativeEventEmitter(SitwegoMainModule);

const { start, stop, startOfferingRideEvent, stopOfferingRideEvent } =
  SitwegoMainModule;

const strartWatchingLocationChanges = () => {
  start();
};

const stopWatchingLocationChanges = () => {
  stop();
};
const _startOfferingRideEvent = (ride_id: string, t: string) => {
  startOfferingRideEvent(ride_id, t);
};

export {
  nativeBridgeEventEmitter,
  _startOfferingRideEvent,
  stopOfferingRideEvent,
  strartWatchingLocationChanges,
  stopWatchingLocationChanges,
};
