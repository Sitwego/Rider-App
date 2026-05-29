package com.transli.mobilitycustomer.rpcStreaming;

import static io.grpc.Metadata.ASCII_STRING_MARSHALLER;

import android.content.Context;

import io.grpc.CallOptions;
import io.grpc.Channel;
import io.grpc.ClientCall;
import io.grpc.ClientInterceptor;
import io.grpc.ForwardingClientCall;
import io.grpc.Metadata;
import io.grpc.MethodDescriptor;

public class RpcNotificationHeaderInterceptor implements ClientInterceptor {
    private final String token;

    public RpcNotificationHeaderInterceptor(String token) {
        this.token = token;
    }

    /**
     * Intercept {@link ClientCall} creation by the {@code next} {@link Channel}.
     *
     * <p>Many variations of interception are possible. Complex implementations may return a wrapper
     * around the result of {@code next.newCall()}, whereas a simpler implementation may just modify
     * the header metadata prior to returning the result of {@code next.newCall()}.
     *
     * <p>{@code next.newCall()} <strong>must not</strong> be called under a different {@link Context}
     * other than the current {@code Context}. The outcome of such usage is undefined and may cause
     * memory leak due to unbounded chain of {@code Context}s.
     *
     * @param method      the remote method to be called.
     * @param callOptions the runtime options to be applied to this call.
     * @param next        the channel which is being intercepted.
     * @return the call object for the remote operation, never {@code null}.
     */
    @Override
    public <ReqT, RespT> ClientCall<ReqT, RespT> interceptCall(MethodDescriptor<ReqT, RespT> method, CallOptions callOptions, Channel next) {
        return new ForwardingClientCall.SimpleForwardingClientCall<ReqT, RespT>(next.newCall(method, callOptions)) {

            @Override
            public void start(Listener<RespT> responseListener, Metadata headers) {
                headers.put(Metadata.Key.of("ride-id", ASCII_STRING_MARSHALLER), token);
                super.start(responseListener, headers);
            }
        };
    }
}
