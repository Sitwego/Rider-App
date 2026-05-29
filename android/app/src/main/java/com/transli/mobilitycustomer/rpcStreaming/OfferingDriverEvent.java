package com.transli.mobilitycustomer.rpcStreaming;

import android.content.Context;
import android.util.Log;

import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.transli.mobilitycustomer.GrpcChannelManager;
import com.transli.mobilitycustomer.SitwegoMainModule;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;

import io.grpc.CallCredentials;
import io.grpc.ManagedChannel;
import io.grpc.Metadata;
import io.grpc.Status;
import io.grpc.StatusException;
import io.grpc.StatusRuntimeException;
import io.grpc.stub.StreamObserver;
import rides_events.RideEventServiceGrpc;
import rides_events.RideEvents;

public class OfferingDriverEvent implements OfferingDriverEventInterface {
    private static final String TAG = "OfferingDriverEvent";
    ManagedChannel channel;
    private final String token;
    private final String rideId;
    private final ScheduledExecutorService retryExecutor = Executors.newSingleThreadScheduledExecutor();
    private RideEventServiceGrpc.RideEventServiceStub rideEventServiceStub;
    // Custom headers for gRPC calls
    private final Map<String, String> customHeaders = new HashMap<>();

    public OfferingDriverEvent(String rideId, String token, Context context) {
        this.rideId = rideId;
        this.token = token;
        this.channel = GrpcChannelManager.getChannel(context);
        this.rideEventServiceStub = RideEventServiceGrpc.newStub(channel);
    }

    public void startEvent(){
        start();
    }

    private void start(){
        OfferingDriverEventStreamObserver offeringDriverEventStreamObserver = new OfferingDriverEventStreamObserver(this);
        // Add call credentials with custom headers if any are set
        if (!customHeaders.isEmpty()) {
            rideEventServiceStub = rideEventServiceStub.withCallCredentials(createCallCredentials());
        }
        StreamObserver<RideEvents.NextDriverOfferRequest> nextDriverOfferEventStreamObserver = rideEventServiceStub
                .streamNextDriverOfferEvent(offeringDriverEventStreamObserver);
        offeringDriverEventStreamObserver.startConnection(
                nextDriverOfferEventStreamObserver,
                rideId,
                token
        );
    }

    public void stop() {
        // channel is shared via GrpcChannelManager — do NOT shut it down here,
        // as other services (RideEventService, RpcStreamingService) may still be using it.
        retryExecutor.shutdownNow();
    }

    private boolean isRetriable(Throwable t) {
        if (t instanceof StatusRuntimeException sre) {
            Status.Code code = sre.getStatus().getCode();
            String desc = sre.getStatus().getDescription();
            Log.d(TAG, "isRetriable: code=" + code + " desc=" + desc);
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

    /**
     * Adds a custom header to all gRPC calls.
     * Common headers include: authorization, api-key, client-version, device-id, etc.
     *
     * @param key Header key (e.g., "authorization", "x-api-key")
     * @param value Header value
     */
    public void addHeader(String key, String value) {
        customHeaders.put(key, value);
    }

    /**
     * Adds multiple custom headers at once.
     *
     * @param headers Map of header key-value pairs
     */
    public void addHeaders(Map<String, String> headers) {
        customHeaders.putAll(headers);
    }

    /**
     * Removes a custom header.
     *
     * @param key Header key to remove
     */
    public void removeHeader(String key) {
        customHeaders.remove(key);
    }

    /**
     * Clears all custom headers.
     */
    public void clearHeaders() {
        customHeaders.clear();
    }

    /**
     * Creates CallCredentials from custom headers.
     */
    private CallCredentials createCallCredentials() {
        return new CallCredentials() {
            /**
             * Pass the credential data to the given {@link MetadataApplier}, which will
             * propagate it to the request metadata.
             *
             * <p>It is called for each individual RPC, within the {@link Context} of the call, before the
             * stream is about to be created on a transport. Implementations should not block in this
             * method. If metadata is not immediately available, e.g., needs to be fetched from network, the
             * implementation may give the {@code appExecutor} an asynchronous task which will eventually call
             * the {@code applier}. The RPC proceeds only after the {@code applier} is called.
             *
             * @param requestInfo request-related information
             * @param appExecutor The application thread-pool. It is provided to the implementation in case it
             *                    needs to perform blocking operations.
             * @param applier     The outlet of the produced headers. It can be called either before or after this
             *                    method returns.
             */
            @Override
            public void applyRequestMetadata(RequestInfo requestInfo, Executor appExecutor, MetadataApplier applier) {
                appExecutor.execute(() -> {
                    try {
                        Metadata metadata = new Metadata();
                        for (Map.Entry<String, String> entry : customHeaders.entrySet()) {
                            metadata.put(Metadata.Key.of(entry.getKey(), Metadata.ASCII_STRING_MARSHALLER), entry.getValue());
                        }
                        applier.apply(metadata);
                    } catch (Throwable err) {
                        applier.fail(Status.UNAUTHENTICATED.withCause(err));
                    }
                });
            }
        };
    }

    /**
     * @param e error
     */
    @Override
    public void onError(Throwable e) {
        Log.e(TAG, "Error OfferingRideEvent" + e.toString());
        if (isRetriable(e)) {
            retryExecutor.schedule(this::start, 2, java.util.concurrent.TimeUnit.SECONDS);
        } else {
            stop();
        }
    }


    @Override
    public void onMessage(RideEvents.NextDriverOfferEvent event_msg) {
        Log.i(TAG, "onMessage: " + event_msg);
        WritableMap event = buildEventMap(event_msg);
        SitwegoMainModule.sendJsEvent("offeringDriverEvent", event);
    }

    private WritableMap buildEventMap(RideEvents.NextDriverOfferEvent event_msg) {
        WritableMap event = new WritableNativeMap();

        // Add payload if present
        event.putMap("eventPayload", buildPayloadMap(event_msg));

        // Add event metadata
        event.putLong("timestamp", event_msg.getTimestamp());
        event.putInt("status", event_msg.getStatusValue());
        event.putString("rideRequestId", event_msg.getRideRequestId());
        event.putString("eventId", event_msg.getEventId());

        return event;
    }

    private WritableMap buildPayloadMap(RideEvents.NextDriverOfferEvent event_msg) {
        WritableMap event_payload = new WritableNativeMap();

        if (event_msg.hasPayload()) {
            RideEvents.NextDriverOfferEventPayload payload = event_msg.getPayload();
            event_payload.putString("rideId", payload.getRideId());
            event_payload.putDouble("lat", payload.getLatitude());
            event_payload.putDouble("lng", payload.getLongitude());
            event_payload.putString("driverName", payload.getDriverName());
            event_payload.putString("driverImg", payload.getDriverImage());
            event_payload.putDouble("dx", payload.getDistanceKm());
            event_payload.putDouble("driverRating", payload.getDriverRating());
            event_payload.putDouble("arrivalTime", payload.getEstimatedArrivalTime());
            event_payload.putString("riderId", payload.getRiderId());
        }

        return event_payload;
    }

    /**
     *
     */
    @Override
    public void onComplete() {
        Log.i(TAG, "Oncomplete OFFERINGDRIVEREVENT");
        retryExecutor.schedule(this::start, 2, java.util.concurrent.TimeUnit.SECONDS);
    }
}

class OfferingDriverEventStreamObserver implements StreamObserver<RideEvents.NextDriverOfferEvent> {
    private final OfferingDriverEventInterface offeringDriverEventInterface;

    OfferingDriverEventStreamObserver(OfferingDriverEventInterface offeringDriverEventInterface) {
        this.offeringDriverEventInterface = offeringDriverEventInterface;
    }

    StreamObserver<RideEvents.NextDriverOfferRequest> nextDriverOfferEventStreamObserver;

    public void startConnection(StreamObserver<RideEvents.NextDriverOfferRequest> nextDriverOfferEventStreamObserver, String rideId, String token) {
        this.nextDriverOfferEventStreamObserver = nextDriverOfferEventStreamObserver;
        nextDriverOfferEventStreamObserver.onNext(RideEvents.NextDriverOfferRequest
                .newBuilder()
                        .setRiderId(rideId)
                        .setToken(token)
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
    public void onNext(RideEvents.NextDriverOfferEvent value) {
        this.offeringDriverEventInterface.onMessage(value);
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
        this.offeringDriverEventInterface.onError(t);
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
        this.offeringDriverEventInterface.onComplete();
    }
}

