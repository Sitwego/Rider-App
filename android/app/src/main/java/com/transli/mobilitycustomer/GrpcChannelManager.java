package com.transli.mobilitycustomer;

import android.content.Context;
import android.util.Log;

import androidx.annotation.Nullable;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonSyntaxException;
import com.tencent.mmkv.MMKV;
import com.transli.mobilitycustomer.rpcStreaming.RpcNotificationHeaderInterceptor;

import java.util.concurrent.TimeUnit;

import io.grpc.Grpc;
import io.grpc.ManagedChannel;
import io.grpc.TlsChannelCredentials;
import io.grpc.android.AndroidChannelBuilder;

public final class GrpcChannelManager {
    private static volatile ManagedChannel channel;
    private static volatile String currentToken;
    private static volatile MMKV mmkv;
    private static final Object lock = new Object();

    private static final String DEFAULT_SERVER_HOST = BuildConfig.GRPC_HOST;
    private static final int DEFAULT_SERVER_PORT = 443;
    private static final int KEEP_ALIVE_TIME_SEC = 30;
    private static final int KEEP_ALIVE_TIMEOUT_SEC = 30;
    private static final int IDLE_TIMEOUT_MIN = 1;
    private static final int MAX_RETRY_ATTEMPTS = 10;
    private static final int MAX_MESSAGE_SIZE = 16 * 1024 * 1024;
    private static final int SHUTDOWN_TIMEOUT_SEC = 5;


    @Override
    public boolean equals(@Nullable Object obj) {
        return super.equals(obj);
    }

    public static void init() {
        synchronized (GrpcChannelManager.class){
            if (mmkv == null){
                mmkv = MMKV.mmkvWithID("user_profile", MMKV.MULTI_PROCESS_MODE);
            }
        }
    }

    public static ManagedChannel getChannel(Context context) {
        if (context == null) {
            throw new IllegalArgumentException("Context cannot be null");
        }

        synchronized (lock) {
            // Ensure token is loaded
            if (currentToken == null) {
                if (!loadTokenFromStorage()) {
                    Log.e("RpcChannelManager", "Failed to load token");
                    return null;
                }
            }

            // Check if channel needs recreation
            boolean needsNewChannel = !isChannelHealthy();

            // If channel exists but token might have changed
            if (channel != null) {
                String latestToken = getLatestTokenFromStorage();
                if (latestToken != null && !latestToken.equals(currentToken)) {
                    Log.d("RpcChannelManager", "Token changed, recreating channel");
                    needsNewChannel = true;
                    currentToken = latestToken;
                }
            }

            if (needsNewChannel) {
                shutdownChannelInternal(); // Don't clear token

                try {
                    channel = AndroidChannelBuilder
                            .usingBuilder(Grpc.newChannelBuilderForAddress(DEFAULT_SERVER_HOST, DEFAULT_SERVER_PORT, TlsChannelCredentials.create()))
                            .intercept(new RpcNotificationHeaderInterceptor(currentToken))
                            .enableRetry()
                            .maxRetryAttempts(MAX_RETRY_ATTEMPTS)
                            .keepAliveTime(KEEP_ALIVE_TIME_SEC, TimeUnit.SECONDS)
                            .keepAliveTimeout(KEEP_ALIVE_TIMEOUT_SEC, TimeUnit.SECONDS)
                            .idleTimeout(IDLE_TIMEOUT_MIN, TimeUnit.MINUTES)
                            .maxInboundMessageSize(MAX_MESSAGE_SIZE)
                            .context(context.getApplicationContext())
                            .build();

                    Log.d("RpcChannelManager", "Created new channel");

                } catch (Exception e) {
                    Log.e("RpcChannelManager", "Failed to create gRPC channel", e);
                    throw new RuntimeException("Failed to initialize gRPC channel", e);
                }
            }

            return channel;
        }
    }

    /**
     * Load token from storage
     * @return true if successful, false otherwise
     */
    private static synchronized boolean loadTokenFromStorage() {
        if (mmkv == null) {
            Log.e("RpcChannelManager", "MMKV not initialized");
            return false;
        }

        String userJson = mmkv.getString("user_profile", null);
        if (userJson == null) {
            Log.w("RpcChannelManager", "No user data found in MMKV");
            return false;
        }

        try {
            JsonObject userObj = JsonParser.parseString(userJson).getAsJsonObject();
            Log.i("RpcChannelManager", "User object: " + userObj.toString());
            JsonObject userData = userObj.get("data").getAsJsonObject();
//            String token = userData.get("token").getAsString();
            JsonObject user = userData.get("user").getAsJsonObject();
            currentToken = user.get("id").getAsString();

            if (currentToken == null || currentToken.trim().isEmpty()) {
                Log.w("RpcChannelManager", "Token is empty");
                return false;
            }

            Log.d("RpcChannelManager", "Token loaded successfully");
            return true;

        } catch (JsonSyntaxException e) {
            Log.e("RpcChannelManager", "Invalid JSON format", e);
        } catch (NullPointerException e) {
            Log.e("RpcChannelManager", "Missing expected JSON fields", e);
        } catch (Exception e) {
            Log.e("RpcChannelManager", "Failed to parse user data", e);
        }

        return false;
    }


    /**
     * Get latest token without updating currentToken
     */
    public static synchronized String getLatestTokenFromStorage() {
        if (mmkv == null) return null;

        String userJson = mmkv.getString("user_profile", null);
        if (userJson == null) return null;

        try {
            JsonObject userObj = JsonParser.parseString(userJson).getAsJsonObject();
            JsonObject userData = userObj.get("data").getAsJsonObject();
//            String token = userData.get("token").getAsString();
            JsonObject user = userData.get("user").getAsJsonObject();
            return user.get("id").getAsString();
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Update token manually (e.g., after login)
     */
    public static synchronized void updateToken(String newToken) {
        if (newToken != null && !newToken.equals(currentToken)) {
            currentToken = newToken;
            // Channel will be recreated on next getChannel() call
        }
    }

    /**
     * Check if channel is healthy
     */
    public static synchronized boolean isChannelHealthy() {
        return channel != null &&
                !channel.isShutdown() &&
                !channel.isTerminated();
    }

    /**
     * Shutdown channel but keep token
     */
    private static void shutdownChannelInternal() {
        if (channel != null) {
            try {
                channel.shutdown();
                if (!channel.awaitTermination(SHUTDOWN_TIMEOUT_SEC, TimeUnit.SECONDS)) {
                    channel.shutdownNow();
                }
            } catch (InterruptedException e) {
                channel.shutdownNow();
                Thread.currentThread().interrupt();
            } finally {
                channel = null;
                // Don't clear currentToken!
            }
        }
    }

    /**
     * Full shutdown - for logout scenarios
     */
    public static synchronized void shutdown() {
        shutdownChannelInternal();
//        currentToken = null;
    }

    /**
     * Get current token (if loaded)
     */
    public static synchronized String getToken() {
        return currentToken;
    }


}
