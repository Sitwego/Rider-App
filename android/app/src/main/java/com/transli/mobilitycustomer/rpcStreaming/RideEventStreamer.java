package com.transli.mobilitycustomer.rpcStreaming;

import android.content.Context;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.transli.mobilitycustomer.GrpcChannelManager;
import com.transli.mobilitycustomer.SitwegoMainModule;
import com.transli.mobilitycustomer.utils.ThreadUtils;

import java.util.Objects;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import io.grpc.ManagedChannel;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import io.grpc.stub.ClientCallStreamObserver;
import io.grpc.stub.StreamObserver;
import rides_events.RideEventServiceGrpc;
import rides_events.RideEvents;

/**
 * Hosts the rider-events gRPC stream inside {@link RpcStreamingService} so a
 * single foreground service (and a single notification) covers both the
 * location stream and critical ride events. Not an Android Service — its
 * lifecycle is owned by the host service: {@link #ensureStarted()} from
 * onStartCommand, {@link #stop()} from onDestroy.
 */
class RideEventStreamer implements RideEventInterface {
    private static final String TAG = "RideEventStreamer";

    private final Context appContext;
    private final ScheduledExecutorService retryExecutor = Executors.newSingleThreadScheduledExecutor();
    private final AtomicInteger retryAttempt = new AtomicInteger();
    private volatile boolean stopped;
    private RiderEventsResponseObserver activeObserver;
    private StreamObserver<RideEvents.RiderEventRequest> activeRequestObserver;
    private ScheduledFuture<?> pendingRetry;

    RideEventStreamer(Context context) {
        this.appContext = context.getApplicationContext();
    }

    /**
     * Open the stream if one isn't already active. Safe to call on every
     * onStartCommand — repeated calls while a stream is up are no-ops, so we
     * never stack a second stream (the server kicks the older one and the
     * dueling retries never converge).
     */
    synchronized void ensureStarted() {
        if (stopped) {
            return;
        }
        if (activeObserver != null) {
            Log.d(TAG, "ensureStarted: stream already active, not reopening");
            return;
        }
        start();
    }

    private synchronized void start() {
        if (stopped) {
            return;
        }
        if (pendingRetry != null) {
            pendingRetry.cancel(false);
            pendingRetry = null;
        }
        cancelActiveStream("superseded by a new stream");
        ManagedChannel rpcChannel = GrpcChannelManager.getChannel(appContext);
        // User id from MMKV — sent as rider_id on the stream. Auth itself travels
        // in the channel's header interceptor, not in this request.
        String riderId = GrpcChannelManager.getLatestTokenFromStorage();
        if (rpcChannel == null || riderId == null) {
            // Init race (MMKV not ready yet) — retry with backoff rather than
            // giving up; the host service outlives this state.
            scheduleRetry("missing channel or rider id");
            return;
        }
        RideEventServiceGrpc.RideEventServiceStub stub = RideEventServiceGrpc.newStub(rpcChannel);
        Log.d(TAG, "start: opening new connection stream");
        RiderEventsResponseObserver riderEventsResponseObserver = new RiderEventsResponseObserver(this);
        StreamObserver<RideEvents.RiderEventRequest> riderEventRequestStreamObserver = stub.streamRiderEvents(
                riderEventsResponseObserver
        );
        activeObserver = riderEventsResponseObserver;
        activeRequestObserver = riderEventRequestStreamObserver;
        riderEventsResponseObserver.startConnection(
                riderEventRequestStreamObserver,
                riderId,
                "token"
        );
    }

    /**
     * Detach the current observer (so its terminal callback can't schedule a
     * competing retry) and cancel the underlying call.
     */
    private synchronized void cancelActiveStream(String reason) {
        if (activeObserver != null) {
            activeObserver.detach();
        }
        if (activeRequestObserver instanceof ClientCallStreamObserver<?> call) {
            call.cancel(reason, null);
        }
        activeObserver = null;
        activeRequestObserver = null;
    }

    private synchronized void clearActiveStream() {
        activeObserver = null;
        activeRequestObserver = null;
    }

    /** Permanently stop: cancel the stream and shut the retry executor down. */
    synchronized void stop() {
        stopped = true;
        if (pendingRetry != null) {
            pendingRetry.cancel(false);
            pendingRetry = null;
        }
        cancelActiveStream("streamer stopped");
        retryExecutor.shutdownNow();
    }

    private void scheduleRetry(String why) {
        if (stopped) {
            return;
        }
        int attempt = retryAttempt.getAndIncrement();
        long delaySec = Math.min(30L, 1L << Math.min(attempt, 5));
        Log.d(TAG, why + " — retrying in " + delaySec + "s (attempt " + (attempt + 1) + ")");
        try {
            synchronized (this) {
                pendingRetry = retryExecutor.schedule(this::start, delaySec, TimeUnit.SECONDS);
            }
        } catch (RejectedExecutionException e) {
            // Executor already shut down — a terminal callback raced stop().
            Log.w(TAG, "scheduleRetry: executor shut down, dropping retry");
        }
    }

    private boolean isRetriable(Throwable t) {
        if (t instanceof StatusRuntimeException sre) {
            Status.Code code = sre.getStatus().getCode();
            Log.d(TAG, "isRetriable: code=" + code + " desc=" + sre.getStatus().getDescription());
            String desc = sre.getStatus().getDescription();
            // UNKNOWN is what a server-side panic/restart surfaces as — mid-ride
            // that must be retried, not treated as fatal.
            return (code == Status.Code.INTERNAL || code == Status.Code.UNKNOWN || (code == Status.Code.UNAVAILABLE && !Objects.equals(desc, "Channel shutdownNow invoked"))) ||
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

    private WritableMap jsEvent(RideEvents.RideEvent event) {
        try {
            return (WritableMap) ThreadUtils
                    .submitToExecutor((Callable<?>) () -> {
                        WritableMap msg = Arguments.createMap();
                        WritableMap eventPayload = Arguments.createMap();
                        switch (event.getEventPayloadCase()) {
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
                                WritableArray stops = Arguments.createArray();
                                for (RideEvents.Location stop : rideStart.getStopsList()) {
                                    WritableMap stopMap = Arguments.createMap();
                                    stopMap.putDouble("lat", stop.getLatitude());
                                    stopMap.putDouble("lng", stop.getLongitude());
                                    stopMap.putString("address", stop.getAddress());
                                    stops.pushMap(stopMap);
                                }
                                eventPayload.putArray("stops", stops);
                            }
                            case STOP_ADDED -> {
                                RideEvents.StopAddedEvent stopAdded = event.getStopAdded();
                                RideEvents.Location stop = stopAdded.getStop();
                                eventPayload.putDouble("stop_lat", stop.getLatitude());
                                eventPayload.putDouble("stop_lng", stop.getLongitude());
                                eventPayload.putString("stop_address", stop.getAddress());
                                eventPayload.putDouble("old_fare", stopAdded.getOldFare());
                                eventPayload.putDouble("new_fare", stopAdded.getNewFare());
                                eventPayload.putDouble("added_distance_km", stopAdded.getAddedDistanceKm());
                                eventPayload.putLong("added_duration_seconds", stopAdded.getAddedDurationSeconds());
                                // (lon, lat) pairs — same shape as the REST line_str polylines.
                                WritableArray newRoute = Arguments.createArray();
                                for (RideEvents.RoutePoint point : stopAdded.getNewRouteList()) {
                                    WritableArray pair = Arguments.createArray();
                                    pair.pushDouble(point.getLongitude());
                                    pair.pushDouble(point.getLatitude());
                                    newRoute.pushArray(pair);
                                }
                                eventPayload.putArray("new_route", newRoute);
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
    public void onError(Throwable e) {
        if (stopped) {
            return;
        }
        clearActiveStream();
        if (isRetriable(e)) {
            Log.e(TAG, "Retrying GRPC Connection  " + e);
            scheduleRetry("stream failed");
        } else {
            // Not fatal for the host service — the next ensureStarted()
            // (sticky restart or a new ride's start command) reopens it.
            Log.e(TAG, "Non-recoverable error, stream stays down: " + e);
        }
    }

    @Override
    public void onMessage(RideEvents.RideEvent rideEvent) {
        retryAttempt.set(0);
        try {
            WritableMap jsEvent = jsEvent(rideEvent);
            Log.i(TAG, "onMessage [" + rideEvent.getEventType() + "] rideId=" + rideEvent.getRideId() + " driverId=" + rideEvent.getDriverId() + " payload=" + jsEvent);
            SitwegoMainModule.sendJsEvent("rideEvent", jsEvent);
        } catch (RuntimeException e) {
            // A JS-delivery failure (e.g. React context torn down while the app
            // is backgrounded) must not escape into gRPC's onNext — gRPC would
            // cancel the stream and the CANCELLED close would kill it.
            Log.e(TAG, "onMessage: failed to deliver event to JS, dropping " + rideEvent.getEventType(), e);
        }
    }

    @Override
    public void onComplete() {
        if (stopped) {
            return;
        }
        clearActiveStream();
        scheduleRetry("stream closed by server");
    }
}

class RiderEventsResponseObserver implements StreamObserver<RideEvents.RideEvent> {
    private final RideEventInterface rideEventInterface;
    private volatile boolean detached;
    StreamObserver<RideEvents.RiderEventRequest> riderEventRequestStreamObserver;

    public RiderEventsResponseObserver(RideEventInterface rideEventInterface) {
        this.rideEventInterface = rideEventInterface;
    }

    /**
     * Stop forwarding callbacks. Called when this stream is superseded or the
     * streamer is stopped — gRPC will still deliver the terminal callback for
     * the cancelled call, and it must not reach a dead streamer (whose retry
     * executor is already terminated).
     */
    void detach() {
        detached = true;
    }

    public void startConnection(StreamObserver<RideEvents.RiderEventRequest> riderEventRequestStreamObserver, String riderId, String token) {
        this.riderEventRequestStreamObserver = riderEventRequestStreamObserver;
        riderEventRequestStreamObserver.onNext(RideEvents.RiderEventRequest.newBuilder()
                        .setRiderId(riderId)
                        .setSessionToken(token)
                .build());

    }

    @Override
    public void onNext(RideEvents.RideEvent value) {
        if (detached) {
            return;
        }
        this.rideEventInterface.onMessage(value);
    }

    @Override
    public void onError(Throwable t) {
        if (detached) {
            return;
        }
        this.rideEventInterface.onError(t);
    }

    @Override
    public void onCompleted() {
        if (detached) {
            return;
        }
        this.rideEventInterface.onComplete();
    }
}
