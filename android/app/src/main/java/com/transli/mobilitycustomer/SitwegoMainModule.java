package com.transli.mobilitycustomer;

import android.app.Activity;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.transli.mobilitycustomer.rpcStreaming.OfferingDriverEvent;
import com.transli.mobilitycustomer.rpcStreaming.RpcStreamingService;

public class SitwegoMainModule extends ReactContextBaseJavaModule {
    private static final String TAG = SitwegoMainModule.class.getCanonicalName();
    private static volatile ReactApplicationContext reactApplicationContext;
    private OfferingDriverEvent offeringDriverEvent;

    /**
     * @return the name of this module. This will be the name used to {@code require()} this module
     * from javascript.
     */
    @NonNull
    @Override
    public String getName() {
        return "SitwegoMainModule";
    }

    public SitwegoMainModule(@NonNull ReactApplicationContext reactContext) {
        super(reactContext);
        reactApplicationContext = reactContext;
        reactContext.addLifecycleEventListener(new LifecycleEventListener() {
            @Override
            public void onHostResume() {
                GrpcChannelManager.init();
            }

            @Override
            public void onHostPause() {

            }

            @Override
            public void onHostDestroy() {
                RpcStreamingService.stopRpcStreamingService(
                        getReactApplicationContext()
                );
            }
        });
    }

    public static void sendJsEvent(String eventName, @Nullable WritableMap params) {
        if (reactApplicationContext != null && reactApplicationContext.hasActiveReactInstance()) {
            reactApplicationContext
                    .getJSModule(
                            DeviceEventManagerModule.RCTDeviceEventEmitter.class
                    )
                    .emit(eventName, params);
        } else {
            Log.i("SitwegoMainModule", "sendJsEvent: No active react instance");
        }
    }



    @ReactMethod
    public void start(){
        Activity activity = getCurrentActivity();
        if (activity == null){
            return;
        }
        activity.runOnUiThread(() -> {
            Log.i(TAG, "start: Starting Rpc Streaming Service");
            RpcStreamingService.startRpcStreamingService(
                    activity.getClass(),
                    getReactApplicationContext(),
                    this
            );
        });
    }

    @ReactMethod
    public void stop() {
        Activity activity = getCurrentActivity();
        if (activity == null){
            return;
        }
        RpcStreamingService.stopRpcStreamingService(
                getReactApplicationContext()
        );
    }

    @ReactMethod
    public void startOfferingRideEvent(String rideId, String token) {
        Activity activity = getCurrentActivity();
        if (activity == null){
            return;
        }
        activity.runOnUiThread(() -> {
            Log.i(TAG, "startOfferingRideEvent: Starting Rpc Streaming Service");
            // Create a new instance of OfferingDriverEvent
            this.offeringDriverEvent = new OfferingDriverEvent(rideId, token, getReactApplicationContext());
            this.offeringDriverEvent.addHeader("x-ride-req-id", rideId);
            this.offeringDriverEvent.addHeader("x-user-id", token);
            offeringDriverEvent.startEvent();
        });
    }

    @ReactMethod
    public void stopOfferingRideEvent() {
        Activity activity = getCurrentActivity();
        if (activity == null){
            return;
        }
        activity.runOnUiThread(() -> {
            Log.i(TAG, "stopOfferingRideEvent: Stopping Rpc Streaming Service");
            offeringDriverEvent.stop();
        });
    }

    @ReactMethod
    public void addListener(String eventName) {
        // Keep: Required for RN built in Event Emitter Calls.
    }

    @ReactMethod
    public void removeListeners(Integer count) {
        // Keep: Required for RN built in Event Emitter Calls.
    }
}
