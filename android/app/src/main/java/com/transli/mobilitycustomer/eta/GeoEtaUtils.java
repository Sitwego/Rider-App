package com.transli.mobilitycustomer.eta;

import static com.margelo.nitro.NitroModules.getApplicationContext;

import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.google.android.gms.maps.model.LatLng;
import com.google.maps.android.PolyUtil;
import com.google.maps.android.SphericalUtil;
import com.tencent.mmkv.MMKV;
import com.transli.mobilitycustomer.utils.ThreadUtils;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;


public class GeoEtaUtils {
    private static final String TAG = GeoEtaUtils.class.getCanonicalName();

    private final MMKV mmkv;
    /**
     * A Constructor
     */
    public GeoEtaUtils() {
        super();
        mmkv = MMKV.mmkvWithID("active_ride", MMKV.MULTI_PROCESS_MODE);
    }

    private String getPolyLineStr (){
        String p = mmkv.getString("active_ride", "null");
        Log.i(TAG, "RIDE_PATH" + p);
        // Extract the polyline to project the driver fix onto. Returns "[]"
        // (never throws) when nothing usable is stored, so the caller degrades
        // to forwarding the raw fix instead of crashing the gRPC stream.
        try {
            JSONObject root = new JSONObject(p);
            JSONObject data = root.optJSONObject("data");
            if (data == null) return "[]";
            String rideStatus = data.optString("ride_status", "");
            JSONObject rideData = data.optJSONObject("rideData");
            JSONObject ridePolyline =
                    rideData == null ? null : rideData.optJSONObject("ride_polyline");
            if (ridePolyline == null) return "[]";

            // Before the trip starts (driver heading to pickup — any pre-trip
            // status) project onto the driver->pickup leg so the marker tracks
            // the approach. Once Inprogress, use the pickup->destination route.
            JSONArray ridePolyLine = null;
            if (!"Inprogress".equals(rideStatus)) {
                ridePolyLine = ridePolyline.optJSONArray("driver_to_pickup_polyline");
            }
            if (ridePolyLine == null || ridePolyLine.length() == 0) {
                ridePolyLine = ridePolyline.optJSONArray("from_to");
            }
            if (ridePolyLine == null) return "[]";
            Log.d(TAG, "GeoEtaUtils: status=" + rideStatus + " points=" + ridePolyLine.length());
            return ridePolyLine.toString();
        } catch (JSONException e) {
            Log.w(TAG, "getPolyLineStr: failed to parse active_ride", e);
            return "[]";
        }
    }

    public WritableMap findCurrentPositionOnPolyline(Double latitude, Double longitude, int speed){
        LatLng currentPosition = new LatLng(latitude, longitude);
        String polylinePoints = getPolyLineStr();
        try {
            return (WritableMap) ThreadUtils
                    .submitToExecutor((Callable<?>) () -> {
                        JSONArray polylineCoordinates = new JSONArray(polylinePoints);
                        WritableMap result = Arguments.createMap();
                        ArrayList<LatLng> polylinePointsList = new ArrayList<>();
                        for (int p = polylineCoordinates.length() - 1; p >= 0; p--) {
                            JSONObject coordinate = polylineCoordinates.getJSONObject(p);
                            double lat = coordinate.getDouble("latitude");
                            double lng = coordinate.getDouble("longitude");
                            polylinePointsList.add(new LatLng(lat, lng));
                        }

                        if (polylinePointsList.isEmpty()){
                            return null;
                        }
                        Log.d(TAG, "polylinePointsList size: " + polylineCoordinates.length());
                        int polylineIndex;
                        int dx;
                        int etaSeconds;
                        JSONArray remainingCoordinates;
                        boolean isOnPolyline;

                        polylineIndex = PolyUtil.locationIndexOnEdgeOrPath(
                                currentPosition,
                                polylinePointsList,
                                PolyUtil.isClosedPolygon(polylinePointsList),
                                true,
                                25
                        );
                        if (polylineIndex == -1){
                            dx = 0;
                            etaSeconds = 0;
                            remainingCoordinates = getJsonArray(polylinePointsList);
                            isOnPolyline = false;
                            Log.v(TAG, "GeoEtaUtils: polylineIndex == -1");
                        } else if (polylineIndex == (polylinePointsList.size() - 2) || polylineIndex == polylinePointsList.size() - 1) {
                            dx = (int) SphericalUtil.computeLength(polylinePointsList);
                            etaSeconds = calculateEta(dx, speed);
                            remainingCoordinates = polylineCoordinates;
                            isOnPolyline = true;
                            Log.v(TAG, "dx: " + dx + " etaSeconds: " + etaSeconds);
                        } else if(polylineIndex == 0){
                            polylinePointsList.clear();
                            dx = 0;
                            etaSeconds = 0;
                            remainingCoordinates = getJsonArray(polylinePointsList);
                            isOnPolyline = false;
                            Log.v(TAG, "GeoEtaUtils: polylineIndex == 0");
                        } else {
                            List<LatLng> subPolyline = polylinePointsList.subList(polylineIndex, polylinePointsList.size());
                            polylinePointsList.removeAll(subPolyline);
                            dx = (int) SphericalUtil.computeLength(polylinePointsList);
                            etaSeconds = calculateEta(dx, speed);
                            remainingCoordinates = getJsonArray(polylinePointsList);
                            isOnPolyline = true;
                        }
                        result.putInt("dx", dx);
                        result.putInt("etaSeconds", etaSeconds);
                        result.putBoolean("isOnPolyline", isOnPolyline);
                        result.putString("remainingCoordinates", remainingCoordinates.toString());
                        return result;
                    }).get();
        } catch (ExecutionException | InterruptedException e) {
            throw new RuntimeException(e);
        }

    }
    @NonNull
    private static JSONArray getJsonArray(ArrayList<LatLng> polylinePoints) throws JSONException {
        JSONArray remainingCoordinates = new JSONArray();
        for (int i = polylinePoints.size() -1; i >= 0; i--) {
            LatLng point = polylinePoints.get(i);
            JSONObject coordinate = new JSONObject();
            coordinate.put("latitude", point.latitude);
            coordinate.put("longitude", point.longitude);
            remainingCoordinates.put(coordinate);
        }
        return remainingCoordinates;
    }

    private int calculateEta(int distance, int speed) {
        // distance in meters, speed in m/s, convert to seconds
        return (speed > 0) ? (int) Math.ceil((double) distance / speed) : 0;
    }
}


