package com.transli.mobilitycustomer.rpcStreaming;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.transli.mobilitycustomer.GrpcChannelManager;
import com.transli.mobilitycustomer.SitwegoMainModule;
import com.transli.mobilitycustomer.utils.ThreadUtils;

import java.util.Objects;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import io.grpc.ConnectivityState;
import io.grpc.ManagedChannel;
import io.grpc.Status;
import io.grpc.StatusException;
import io.grpc.StatusRuntimeException;
import io.grpc.stub.StreamObserver;
import rides_events.RideEventServiceGrpc;
import rides_events.RideEvents;

public class RideEventService extends Service implements RideEventInterface {
    public static final String TAG = "RideEventService";
    private ManagedChannel rpcChannel;
    private String token;
    private RideEventServiceGrpc.RideEventServiceStub rideEventServiceStub;
    private final ScheduledExecutorService retryExecutor = Executors.newSingleThreadScheduledExecutor();

    public RideEventService() {
    }

    private void start(){
        rpcChannel = GrpcChannelManager.getChannel(getApplicationContext());
        token = GrpcChannelManager.getLatestTokenFromStorage();
        if (rpcChannel == null || token == null) {
            Log.w(TAG, "start: missing channel or token, stopping");
            stopSelf();
            return;
        }
        rideEventServiceStub = RideEventServiceGrpc.newStub(rpcChannel);
        Log.d(TAG, "start: opening new connection stream");
        RiderEventsResponseObserver riderEventsResponseObserver = new RiderEventsResponseObserver(this);
        StreamObserver<RideEvents.RiderEventRequest> riderEventRequestStreamObserver = rideEventServiceStub.streamRiderEvents(
                riderEventsResponseObserver
        );
        riderEventsResponseObserver.startConnection(
                riderEventRequestStreamObserver,
                token,
                "token"
        );
    }

    private boolean isRetriable(Throwable t) {
        if (t instanceof StatusRuntimeException sre) {
            Status.Code code = sre.getStatus().getCode();
            Log.d(TAG, "isRetriable: code=" + code + " desc=" + sre.getStatus().getDescription());
            String desc = sre.getStatus().getDescription();
            return (code == Status.Code.INTERNAL || (code == Status.Code.UNAVAILABLE && !Objects.equals(desc, "Channel shutdownNow invoked"))) ||
                    (containsAny(desc,
                            new String[]{
                                    "Rst Stream",
                                    "End of stream or IOException",
                                    "Keepalive failed",
                                    "TIMEOUT",
                                    "RETRY",
                                    "CONNECTION RESET",
                                    "NETWORK",
                                    "CONNECTIVITY",
                                    "SOCKET",
                                    "CONNECTION ABORT",
                                    "TRANSPORT"
                            }));
        }
        return false;
    }

    private void watchChannelState(ManagedChannel channel) {
        ConnectivityState state = channel.getState(false);
        Log.d(TAG, "Initial channel state: " + state);

        channel.notifyWhenStateChanged(state, () -> {
            ConnectivityState newState = channel.getState(false);
            Log.d(TAG, "Channel state changed to: " + newState);

            if (newState == ConnectivityState.IDLE){
                Log.d(TAG, "Channel is idle. Forcing reconnection...");
                channel.getState(true);
            }

            if (newState != ConnectivityState.SHUTDOWN) {
                watchChannelState(channel);
            }
        });
    }

    /**
     * Check if the string contains any of the substrings
     * @param description string
     * @param substrings string array
     * @return boolean
     */
    private boolean containsAny(String description, String[] substrings) {
        if (description == null) {
            return false;
        }
        for (String substring : substrings) {
            if (description.contains(substring)) {
                return true;
            }
        }
        return false;
    }

    private WritableMap jsEvent(RideEvents.RideEvent event){
        try {
            return (WritableMap) ThreadUtils
                    .submitToExecutor((Callable<?>) () -> {
                        WritableMap msg = Arguments.createMap();
                        WritableMap eventPayload = Arguments.createMap();
                        switch (event.getEventPayloadCase()){
                            case RIDE_CANCEL -> {
                                RideEvents.RideCancelEvent rideCancel = event.getRideCancel();
                                eventPayload.putString("reason", rideCancel.getReason());
                                RideEvents.CancelSource cancelSource = rideCancel.getCanceledBy();
                                eventPayload.putInt("cancel_by", cancelSource.getNumber());
                                eventPayload.putString("note", rideCancel.getNote());
                            }
                            case RIDE_END -> {
                                RideEvents.RideEndEvent rideEnd = event.getRideEnd();
                                eventPayload.putDouble("final_fare", rideEnd.getFinalFare());
                                eventPayload.putDouble("dx", rideEnd.getDistanceKm());
                                eventPayload.putLong("duration_seconds", rideEnd.getDurationSeconds());
                                RideEvents.Rating rating = rideEnd.getRiderRating();
                                eventPayload.putDouble("rider_rating", rating.getScore());
                                eventPayload.putString("comment", rating.getComment());
                                RideEvents.Location endLocation = rideEnd.getEndLocation();
                                eventPayload.putDouble("end_lat", endLocation.getLatitude());
                                eventPayload.putDouble("end_lng", endLocation.getLongitude());

                            }
                            case FARE_CHANGE -> {
                                RideEvents.FareChangeEvent fareChange = event.getFareChange();
                                eventPayload.putDouble("new", fareChange.getNewFare());
                                eventPayload.putDouble("old", fareChange.getOldFare());
                                eventPayload.putString("reason", fareChange.getReason());
                            }
                            case LOCATION_UPDATE -> {
                                RideEvents.LocationUpdateEvent locationUpdate = event.getLocationUpdate();
                                eventPayload.putDouble("speed_kph", locationUpdate.getSpeedKph());
                                eventPayload.putDouble("bearing", locationUpdate.getBearing());
                                eventPayload.putLong("location_timestamp", locationUpdate.getLocationTime());
                                eventPayload.putInt("accuracy", locationUpdate.getAccuracy());
                                RideEvents.Location location = locationUpdate.getLocation();
                                eventPayload.putDouble("lat", location.getLatitude());
                                eventPayload.putDouble("lng", location.getLongitude());
                            }
                            case RIDE_START -> {
                                RideEvents.RideStartEvent rideStart = event.getRideStart();
                                RideEvents.Location startLocation = rideStart.getStartLocation();
                                RideEvents.Location endLocation = rideStart.getDestination();
                                eventPayload.putDouble("start_lat", startLocation.getLatitude());
                                eventPayload.putDouble("start_lng", startLocation.getLongitude());
                                eventPayload.putDouble("end_lat", endLocation.getLatitude());
                                eventPayload.putDouble("end_lng", endLocation.getLongitude());
                                eventPayload.putDouble("fare", rideStart.getEstimatedFare());
                                eventPayload.putLong("duration", rideStart.getEstimatedDuration());
                                eventPayload.putString("vehicle_type", rideStart.getVehicleType());
                                eventPayload.putString("vehicle_number", rideStart.getVehicleNumber());
                                RideEvents.DriverInfo driverInfo = rideStart.getDriverInfo();
                                eventPayload.putString("driver_name", driverInfo.getName());
                                eventPayload.putString("driver_id", driverInfo.getDriverId());
                                eventPayload.putString("licence_plate_no", driverInfo.getLicensePlate());
                            }
                            case DRIVER_ARRIVED -> {
                                RideEvents.DriverArrivedEvent driverArrived = event.getDriverArrived();
                                RideEvents.Location location = driverArrived.getArrivalLocation();
                                eventPayload.putDouble("lat", location.getLatitude());
                                eventPayload.putDouble("lng", location.getLongitude());
                                eventPayload.putLong("arrival_time", driverArrived.getActualArrivalTime());
                            }
                        }
                        msg.putLong("timestamp", event.getTimestamp());
                        msg.putString("eventType", event.getEventType());
                        msg.putString("driver_id", event.getDriverId());
                        msg.putString("rider_id", event.getRiderId());
                        msg.putString("ride_id", event.getRideId());
                        msg.putMap("eventPayload", eventPayload);
                        return msg;
                    })
                    .get();
        } catch (ExecutionException | InterruptedException e) {
            throw new RuntimeException(e);
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return  null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "onCreate");
        rpcChannel = GrpcChannelManager.getChannel(getApplicationContext());
        assert rpcChannel != null;
        watchChannelState(rpcChannel);
        token = GrpcChannelManager.getLatestTokenFromStorage();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "onStartCommand: channel=" + (rpcChannel != null ? "ok" : "null") + " token=" + (token != null ? "ok" : "null"));
        if (rpcChannel != null && token != null){
            rideEventServiceStub = RideEventServiceGrpc.newStub(rpcChannel);
            start();
        } else {
            Log.w(TAG, "onStartCommand: missing channel or token, stopping self");
            stopSelf();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.w(TAG, "onDestroy");
        retryExecutor.shutdownNow();
        rpcChannel = null;
    }

    /**
     * @param e Throwable error
     */
    @Override
    public void onError(Throwable e) {
        if (isRetriable(e)) {
            Log.e(TAG, "Retrying GRPC Connection  " + e.toString());
            retryExecutor.schedule(this::start, 5, TimeUnit.SECONDS);
        } else {
            Log.e(TAG, "Non-recoverable error!!!: " + e);
            stopSelf();
        }
    }

    /**
     * @param rideEvent RideEvent message
     */
    @Override
    public void onMessage(RideEvents.RideEvent rideEvent) {
        WritableMap jsEvent = jsEvent(rideEvent);
        Log.i(TAG, "onMessage [" + rideEvent.getEventType() + "] rideId=" + rideEvent.getRideId() + " driverId=" + rideEvent.getDriverId() + " payload=" + jsEvent);
        SitwegoMainModule.sendJsEvent("rideEvent", jsEvent);
    }

    /**
     *
     */
    @Override
    public void onComplete() {
        Log.d(TAG, "onComplete: stream closed by server, retrying in 1s");
        retryExecutor.schedule(this::start, 1, java.util.concurrent.TimeUnit.SECONDS);
    }
}

class RiderEventsResponseObserver implements StreamObserver<RideEvents.RideEvent> {
    private final RideEventInterface rideEventInterface;
    StreamObserver<RideEvents.RiderEventRequest> riderEventRequestStreamObserver;

    public RiderEventsResponseObserver(RideEventInterface rideEventInterface) {
        this.rideEventInterface = rideEventInterface;
    }

    public void startConnection(StreamObserver<RideEvents.RiderEventRequest> riderEventRequestStreamObserver, String rideId, String token) {
        this.riderEventRequestStreamObserver = riderEventRequestStreamObserver;
        riderEventRequestStreamObserver.onNext(RideEvents.RiderEventRequest.newBuilder()
                        .setRiderId(rideId)
                        .setSessionToken(token)
                .build());

    }

    /**
     * Receives a value from the stream.
     *
     * <p>Can be called many times but is never called after {@link #onError(Throwable)} or {@link
     * #onCompleted()} are called.
     *
     * <p>Unary calls must invoke onNext at most once.  Clients may invoke onNext at most once for
     * server streaming calls, but may receive many onNext callbacks.  Servers may invoke onNext at
     * most once for client streaming calls, but may receive many onNext callbacks.
     *
     * <p>If an exception is thrown by an implementation the caller is expected to terminate the
     * stream by calling {@link #onError(Throwable)} with the caught exception prior to
     * propagating it.
     *
     * @param value the value passed to the stream
     */
    @Override
    public void onNext(RideEvents.RideEvent value) {
        this.rideEventInterface.onMessage(value);
    }

    /**
     * Receives a terminating error from the stream.
     *
     * <p>May only be called once and if called it must be the last method called. In particular if an
     * exception is thrown by an implementation of {@code onError} no further calls to any method are
     * allowed.
     *
     * <p>{@code t} should be a {@link StatusException} or {@link
     * StatusRuntimeException}, but other {@code Throwable} types are possible. Callers should
     * generally convert from a {@link Status} via {@link Status#asException()} or
     * {@link Status#asRuntimeException()}. Implementations should generally convert to a
     * {@code Status} via {@link Status#fromThrowable(Throwable)}.
     *
     * @param t the error occurred on the stream
     */
    @Override
    public void onError(Throwable t) {
        this.rideEventInterface.onError(t);
    }

    /**
     * Receives a notification of successful stream completion.
     *
     * <p>May only be called once and if called it must be the last method called. In particular if an
     * exception is thrown by an implementation of {@code onCompleted} no further calls to any method
     * are allowed.
     */
    @Override
    public void onCompleted() {
        this.rideEventInterface.onComplete();
    }
}