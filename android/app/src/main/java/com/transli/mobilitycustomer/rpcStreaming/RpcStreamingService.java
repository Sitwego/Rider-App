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
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import io.grpc.ConnectivityState;
import io.grpc.ManagedChannel;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import io.grpc.stub.StreamObserver;

public class RpcStreamingService extends Service implements RpcStreamInterface {
    public static final String TAG = RpcStreamingService.class.getName();
    private static WatchLocationServiceGrpc.WatchLocationServiceStub asyncStub;

    private static final String CHANNEL_ID = "WatchLocationServiceNotification";

    public  static Class<? extends Activity> activityClassToOpenFromNotification;
    private final ScheduledExecutorService retryExecutor = Executors.newSingleThreadScheduledExecutor();

    public static String TOKEN;

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
        Intent notificationIntent = new Intent(this, activityClassToOpenFromNotification);
        PendingIntent intent = PendingIntent.getActivity(
                this,
                0,
                notificationIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("On Duty")
                .setContentText("Listening to location changes in background")
                //.setSmallIcon(R.drawable.ic_notif_launcher)
                .setContentIntent(intent)
                .setAutoCancel(false)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setOngoing(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .setOnlyAlertOnce(true)
                .build();

    }

    public void initRpcConnection() {
        if (managedChannel == null){
            stopSelf();
            Log.e(TAG, "initRpcConnection: failed empty token!");
            return;
        }
        Log.d(TAG, "Initializing RPC Connection With Token: " + TOKEN);
        startRpcConnection();
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

    private void startRpcConnection () {
        RpcNotificationStreamObserver rpcNotificationStreamObserver = new RpcNotificationStreamObserver(this);
        StreamObserver<LocationChangeRequest> locationChangeRequestStreamObserver = asyncStub.watchDriverLocationChanges(
                rpcNotificationStreamObserver
        );
        rpcNotificationStreamObserver.startConnection(
                locationChangeRequestStreamObserver
        );
    }

    private void shutDown() {
        // Do NOT call GrpcChannelManager.shutdown() here — the channel is shared with
        // RideEventService and other components. Shutting it down here (e.g. on onDestroy
        // triggered by a React Native lifecycle event) would kill their active streams.
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
            SitwegoMainModule _sitwegoMainModule
    ){
        activityClassToOpenFromNotification = activityClass;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            createNotificationChannel(context);
        }
        Intent intent = new Intent(context, RpcStreamingService.class);
        ContextCompat.startForegroundService(context, intent);
    }

    public static void stopRpcStreamingService(Context context){
        context.stopService(new Intent(context, RpcStreamingService.class));
    }

    @Override
    public void onError(Throwable e) {
        if (e instanceof StatusRuntimeException statusRuntimeException){
            Status.Code code = statusRuntimeException.getStatus().getCode();
            String desc = statusRuntimeException.getStatus().getDescription();
            Log.d(TAG, "onError: code=" + code + " desc=" + desc);
            if ((code == Status.Code.INTERNAL || (code == Status.Code.UNAVAILABLE && !Objects.equals(desc, "Channel shutdownNow invoked"))) ||
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
                retryExecutor.schedule(() -> {
                            Log.e(TAG, "[Retrying GRPC Connection After Reconection]");
                            initRpcConnection();

                        }
                        , 2, TimeUnit.SECONDS);

                return;
            }

            Log.e(TAG,"[Non-recoverable Error] : " + statusRuntimeException.getStatus());

            stopSelf();
        }
    }
    @Override
    public void onMessage(DriverLocationChange locationChange) {
        // we can find position and eta on polyline
        WritableMap pEta = geoEtaUtils.findCurrentPositionOnPolyline(
                locationChange.getLatitude(),
                locationChange.getLongitude(),
                (int) locationChange.getSpeed()
        );
        Log.i(TAG, "onMessage: " + pEta);
        pEta.putString("rideId", locationChange.getRideId());
        pEta.putDouble("bearing", locationChange.getBearing());
        pEta.putDouble("timestamp", locationChange.getTimestamp());
        SitwegoMainModule.sendJsEvent("locationChange", pEta);
    }

    @Override
    public void onComplete() {
        Log.d(TAG, "onComplete: ");
        retryExecutor.schedule(() -> {
            Log.e(TAG, "[Retrying GRPC Connection]");
            initRpcConnection();

        }
        , 2, TimeUnit.SECONDS);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.w(TAG, "Destroying Rpc service");
        retryExecutor.shutdown();
        if (isServiceRunning(getApplicationContext(), RideEventService.class)){
            stopService(new Intent(getApplicationContext(), RideEventService.class));
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
//        initRpcConnection();
        //start RideEventService Too
        if (!isServiceRunning(getApplicationContext(), RideEventService.class)){
            Log.i(TAG, "onStartCommand: Starting RideEventService");
            Intent rideEventServiceIntent = new Intent(getApplicationContext(), RideEventService.class);
            startService(rideEventServiceIntent);
        }
        return super.onStartCommand(intent, flags, startId);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        managedChannel = GrpcChannelManager.getChannel(this);
        TOKEN = GrpcChannelManager.getToken();
        asyncStub = WatchLocationServiceGrpc.newStub(managedChannel);
        watchChannelState(managedChannel);
    }
}
