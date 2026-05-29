package com.transli.mobilitycustomer.rpcStreaming;

import rides_events.RideEvents;

public interface RideEventInterface {
    void onError(Throwable e);
    void onMessage(RideEvents.RideEvent rideEvent);
    void onComplete();
}
