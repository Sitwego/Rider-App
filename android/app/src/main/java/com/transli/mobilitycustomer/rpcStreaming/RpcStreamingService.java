package com.transli.mobilitycustomer.rpcStreaming;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.annotation.RequiresApi;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.transli.mobilitycustomer.GrpcChannelManager;
import com.transli.mobilitycustomer.SitwegoMainModule;
import com.transli.mobilitycustomer.eta.GeoEtaUtils;
import com.transli.mobilitycustomer.rides.notification.DriverLocationChange;
import com.transli.mobilitycustomer.rides.notification.LocationChangeRequest;
import com.transli.mobilitycustomer.rides.notification.WatchLocationServiceGrpc;

import java.util.List;
import java.util.Objects;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import io.grpc.ConnectivityState;
import io.grpc.ManagedChannel;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import io.grpc.stub.ClientCallStreamObserver;
import io.grpc.stub.StreamObserver;

public class RpcStreamingService extends Service implements RpcStreamInterface {
    public static final String TAG = RpcStreamingService.class.getName();
    private static WatchLocationServiceGrpc.WatchLocationServiceStub asyncStub;

    private static final String CHANNEL_ID = "WatchLocationServiceNotification";
    public static final String EXTRA_RIDE_ID = "ride_id";

    public  static Class<? extends Activity> activityClassToOpenFromNotification;
    private final ScheduledExecutorService retryExecutor = Executors.newSingleThreadScheduledExecutor();
    private final AtomicInteger retryAttempt = new AtomicInteger();
    private volatile boolean stopped;
    private RpcNotificationStreamObserver activeObserver;
    private StreamObserver<LocationChangeRequest> activeRequestObserver;
    private ScheduledFuture<?> pendingRetry;

    public static String TOKEN;
    private String rideId;
    // Rider-events stream lives inside this service so one foreground service
    // (and one notification) covers both streams.
    private RideEventStreamer rideEventStreamer;

    private ManagedChannel managedChannel;
    public GeoEtaUtils geoEtaUtils = new GeoEtaUtils();

    public RpcStreamingService() {
        super();
    }

    @RequiresApi(Build.VERSION_CODES.O)
    private static void createNotificationChannel(Context context) {
        NotificationChannel serviceChannel = new NotificationChannel(
                CHANNEL_ID,
                "Ongoing Ride Notification",
                NotificationManager.IMPORTANCE_DEFAULT);
        serviceChannel.setShowBadge(false);
        serviceChannel.enableLights(false);
        serviceChannel.setVibrationPattern(new long[]{0});
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(serviceChannel);
    }


    private Notification createNotification() {
        // The static activity class is unset when the system sticky-restarts
        // this service without the app having launched — fall back to the
        // package launch intent so createNotification can't NPE before
        // startForeground runs.
        Intent notificationIntent = activityClassToOpenFromNotification != null
                ? new Intent(this, activityClassToOpenFromNotification)
                : getPackageManager().getLaunchIntentForPackage(getPackageName());

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Ride in progress")
                .setContentText("Tracking your driver and ride updates")
                //.setSmallIcon(R.drawable.ic_notif_launcher)
                .setAutoCancel(false)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setOngoing(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .setOnlyAlertOnce(true);
        if (notificationIntent != null) {
            builder.setContentIntent(PendingIntent.getActivity(
                    this,
                    0,
                    notificationIntent,
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
            ));
        }
        return builder.build();
    }

    public void initRpcConnection() {
        if (managedChannel == null || asyncStub == null){
            stopSelf();
            Log.e(TAG, "initRpcConnection: failed empty token!");
            return;
        }
        Log.d(TAG, "Initializing RPC Connection With Token: ");
        startRpcConnection();
    }



    private void watchChannelState(ManagedChannel channel) {
        ConnectivityState state = channel.getState(false);
        Log.d(TAG, "Initial channel state: " + state);

        channel.notifyWhenStateChanged(state, () -> {
            if (stopped) {
                // Don't re-register from a destroyed instance — the recursive
                // watcher would otherwise outlive the service.
                return;
            }
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

    public static Boolean isServiceRunning(Context context, Class<?> serviceClass){
        final ActivityManager activityManager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        final List<ActivityManager.RunningServiceInfo> serviceInfos = activityManager.getRunningServices(Integer.MAX_VALUE);
        for (ActivityManager.RunningServiceInfo info : serviceInfos) {
            if (info.service.getClassName().equals(serviceClass.getName())) {
                return true;
            }
        }
        return false;
    }

    private synchronized void startRpcConnection () {
        if (stopped) {
            return;
        }
        if (pendingRetry != null) {
            pendingRetry.cancel(false);
            pendingRetry = null;
        }
        cancelActiveStream("superseded by a new stream");
        RpcNotificationStreamObserver rpcNotificationStreamObserver = new RpcNotificationStreamObserver(this);
        StreamObserver<LocationChangeRequest> locationChangeRequestStreamObserver = asyncStub.watchDriverLocationChanges(
                rpcNotificationStreamObserver
        );
        activeObserver = rpcNotificationStreamObserver;
        activeRequestObserver = locationChangeRequestStreamObserver;
        rpcNotificationStreamObserver.startConnection(
                locationChangeRequestStreamObserver,
                rideId
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

    private void scheduleRetry(String why) {
        if (stopped) {
            return;
        }
        int attempt = retryAttempt.getAndIncrement();
        long delaySec = Math.min(30L, 1L << Math.min(attempt, 5));
        Log.d(TAG, why + " — retrying in " + delaySec + "s (attempt " + (attempt + 1) + ")");
        try {
            synchronized (this) {
                pendingRetry = retryExecutor.schedule(this::initRpcConnection, delaySec, TimeUnit.SECONDS);
            }
        } catch (RejectedExecutionException e) {
            // Executor already shut down — a terminal callback raced onDestroy.
            Log.w(TAG, "scheduleRetry: executor shut down, dropping retry");
        }
    }

    private void shutDown() {
        // Do NOT call GrpcChannelManager.shutdown() here — the channel is shared with
        // the ride-events stream and other components. Shutting it down here (e.g. on
        // onDestroy triggered by a React Native lifecycle event) would kill their streams.
        // The channel is cleaned up by GrpcChannelManager when the process exits or on logout.
        asyncStub = null;
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
    public static void startRpcStreamingService(
            Class<? extends Activity> activityClass,
            Context context,
            SitwegoMainModule _sitwegoMainModule,
            String rideId
    ){
        activityClassToOpenFromNotification = activityClass;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            createNotificationChannel(context);
        }
        Intent intent = new Intent(context, RpcStreamingService.class);
        intent.putExtra(EXTRA_RIDE_ID, rideId);
        ContextCompat.startForegroundService(context, intent);
    }

    public static void stopRpcStreamingService(Context context){
        context.stopService(new Intent(context, RpcStreamingService.class));
    }

    @Override
    public void onError(Throwable e) {
        if (stopped) {
            return;
        }
        clearActiveStream();
        if (!(e instanceof StatusRuntimeException)) {
            // Previously this fell through silently, leaving the service alive
            // with a dead stream and no retry.
            Log.e(TAG, "onError: non-status error, retrying", e);
            scheduleRetry("stream failed: " + e.getClass().getSimpleName());
            return;
        }
        if (e instanceof StatusRuntimeException statusRuntimeException){
            Status.Code code = statusRuntimeException.getStatus().getCode();
            String desc = statusRuntimeException.getStatus().getDescription();
            Log.d(TAG, "onError: code=" + code + " desc=" + desc);
            if ((code == Status.Code.INTERNAL || code == Status.Code.UNKNOWN || (code == Status.Code.UNAVAILABLE && !Objects.equals(desc, "Channel shutdownNow invoked"))) ||
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
                            }))) {
                scheduleRetry("stream failed: " + code);
                return;
            }

            Log.e(TAG,"[Non-recoverable Error] : " + statusRuntimeException.getStatus());

            stopSelf();
        }
    }
    @Override
    public void onMessage(DriverLocationChange locationChange) {
        retryAttempt.set(0);
        Log.v(TAG, "onLocationChageMessage" + locationChange.toString());
        try {
            // Try to project the fix onto the route polyline for ETA / remaining
            // coordinates. This is null before a route polyline is loaded — most
            // notably during the Accepted phase (driver heading to pickup), where
            // GeoEtaUtils only reads "from_to" and that array is still empty. Fall
            // back to a bare map so we always forward the raw fix and never NPE.
            WritableMap pEta = geoEtaUtils.findCurrentPositionOnPolyline(
                    locationChange.getLatitude(),
                    locationChange.getLongitude(),
                    (int) locationChange.getSpeed()
            );
            Log.i(TAG, "onMessage: " + pEta);
            if (pEta == null) {
                pEta = Arguments.createMap();
            }
            pEta.putString("rideId", locationChange.getRideId());
            pEta.putDouble("accuracy", locationChange.getAccuracy());
            pEta.putDouble("speed", locationChange.getSpeed());
            pEta.putDouble("bearing", locationChange.getBearing());
            pEta.putDouble("timestamp", locationChange.getTimestamp());
            pEta.putDouble("latitude", locationChange.getLatitude());
            pEta.putDouble("longitude", locationChange.getLongitude());
            SitwegoMainModule.sendJsEvent("locationChange", pEta);
        } catch (RuntimeException e) {
            // A JS-delivery failure must not escape into gRPC's onNext — gRPC
            // would cancel the stream and the CANCELLED close would kill the
            // service. Drop the fix; the next one arrives within seconds.
            Log.e(TAG, "onMessage: failed to deliver location fix to JS, dropping", e);
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

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.w(TAG, "Destroying Rpc service");
        stopped = true;
        cancelActiveStream("service destroyed");
        retryExecutor.shutdownNow();
        if (rideEventStreamer != null) {
            rideEventStreamer.stop();
        }
        shutDown();
    }

    @Override
    protected void finalize() throws Throwable {
        try {
            shutDown();
            retryExecutor.shutdownNow();
        } finally {
            super.finalize();
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = createNotification();
        this.startForeground(1, notification);
        String newRideId = intent != null ? intent.getStringExtra(EXTRA_RIDE_ID) : null;
        boolean rideChanged = newRideId != null && !newRideId.equals(rideId);
        if (newRideId != null) {
            rideId = newRideId;
        }
        boolean streamActive;
        synchronized (this) {
            streamActive = activeObserver != null;
        }
        if (streamActive && !rideChanged) {
            // Repeated start commands must not stack a second stream — the
            // server kicks the older one and the dueling retries never
            // converge. Only a new ride id warrants reconnecting.
            Log.d(TAG, "onStartCommand: stream already active, not reopening");
        } else {
            initRpcConnection();
        }
        // The rider-events stream is keyed by rider id (header), not ride id —
        // no need to reopen it on a ride change, just make sure it's up.
        rideEventStreamer.ensureStarted();
        return super.onStartCommand(intent, flags, startId);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        // The system can recreate this sticky service without the React host having
        // resumed (which is the only place GrpcChannelManager.init() is otherwise
        // called). Initialize the manager here so MMKV is ready in this process.
        GrpcChannelManager.init();
        // Normally created by startRpcStreamingService, but a sticky restart
        // skips that path — make sure the channel exists before startForeground.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            createNotificationChannel(this);
            // Left behind by the removed RideEventService on builds <= 0.0.34-beta;
            // without this it lingers in system notification settings forever.
            getSystemService(NotificationManager.class)
                    .deleteNotificationChannel("RideEventServiceNotification");
        }
        rideEventStreamer = new RideEventStreamer(this);
        managedChannel = GrpcChannelManager.getChannel(this);
        if (managedChannel == null) {
            // No token yet (logged out / MMKV empty). Don't build a stub with a null
            // channel — that throws NPE. Bail out gracefully; onStartCommand's
            // initRpcConnection() also guards on a null channel and stops the service.
            Log.e(TAG, "onCreate: gRPC channel unavailable (no token). Service will stop.");
            return;
        }
        TOKEN = GrpcChannelManager.getToken();
        asyncStub = WatchLocationServiceGrpc.newStub(managedChannel);
        watchChannelState(managedChannel);
    }
}
