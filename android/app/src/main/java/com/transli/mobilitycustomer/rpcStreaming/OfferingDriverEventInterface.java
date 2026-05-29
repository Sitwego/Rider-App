package com.transli.mobilitycustomer.rpcStreaming;

import rides_events.RideEvents;

public interface OfferingDriverEventInterface {
    void onError(Throwable e);
    void onMessage(RideEvents.NextDriverOfferEvent event_msg);
    void onComplete();
}
