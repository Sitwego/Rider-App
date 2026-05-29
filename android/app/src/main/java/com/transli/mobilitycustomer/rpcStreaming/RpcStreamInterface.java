package com.transli.mobilitycustomer.rpcStreaming;

import com.transli.mobilitycustomer.rides.notification.DriverLocationChange;


public interface RpcStreamInterface {
    void onError(Throwable e);
    void onMessage(DriverLocationChange locationChange);

    void onComplete();
}
