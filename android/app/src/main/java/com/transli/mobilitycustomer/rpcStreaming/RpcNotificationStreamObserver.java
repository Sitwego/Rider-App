package com.transli.mobilitycustomer.rpcStreaming;

import android.util.Log;

import com.transli.mobilitycustomer.rides.notification.DriverLocationChange;
import com.transli.mobilitycustomer.rides.notification.LocationChangeRequest;

import io.grpc.Status;
import io.grpc.StatusException;
import io.grpc.StatusRuntimeException;
import io.grpc.stub.StreamObserver;

public class RpcNotificationStreamObserver implements StreamObserver<DriverLocationChange> {
    private final RpcStreamInterface rpcListeners;
    private static final String TAG = RpcNotificationStreamObserver.class.getName();
    private StreamObserver<LocationChangeRequest> locationChangeRequestStreamObserver;

    public RpcNotificationStreamObserver(RpcStreamInterface rpcStreamInterface) {
        this.rpcListeners = rpcStreamInterface;
    }

    /**
     * A method that is responsible for initiating connection to the server
     *
     */
    public void startConnection(StreamObserver<LocationChangeRequest> locationChangeRequestStreamObserver) {
        this.locationChangeRequestStreamObserver = locationChangeRequestStreamObserver;
        locationChangeRequestStreamObserver.onNext(LocationChangeRequest.newBuilder().build());
        Log.d(TAG, "[Rpc Connection Started]");
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
    public void onNext(DriverLocationChange value) {
        if (value.getRideId() != null && !value.getRideId().isEmpty()){
            this.locationChangeRequestStreamObserver.onNext(
                    LocationChangeRequest.newBuilder()
                            .setRideId(value.getRideId())
                            .build()
            );
        }else {
            Log.i(TAG, "onNext: Received invalid RideId");
        }

        this.rpcListeners.onMessage(value);

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
        this.rpcListeners.onError(t);
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
        this.rpcListeners.onComplete();
    }
}
