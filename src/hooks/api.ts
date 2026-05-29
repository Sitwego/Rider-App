import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { Platform } from "react-native";

import { useActiveRideState } from "~/providers/ActiveRideProvider";
import { useRideSearchState } from "~/providers/RideBookingModalProvider";
import { LocationData } from "~/types/loactionAddress";

import { useApiClient } from "./useApiClient";

export function useRideFairEstimation() {
  const { pickup, dropOff }: { pickup: LocationData; dropOff: LocationData } =
    useRideSearchState();

  const dropOffCity = useMemo(
    () => (dropOff?.city ? dropOff?.city : dropOff?.state),
    [dropOff?.city, dropOff?.state],
  );

  const pickupCity = useMemo(
    () => (pickup?.city ? pickup?.city : pickup?.state),
    [pickup?.city, pickup?.state],
  );

  const { makeApiCall } = useApiClient();

  console.log("PickUp", pickupCity, "\n\r \n\r", "Drop Off", dropOffCity);

  return useMutation({
    async mutationFn() {
      return await makeApiCall({
        method: "POST",
        url: "ride-fair-estimation",
        headers: {
          "Content-Type": "application/json",
        },
        data: {
          from: {
            geo_point: {
              lat: pickup.lat,
              lon: pickup.lng,
            },
            place_id: pickup.place_id,
            city: pickupCity,
            street: pickup.street,
            ward: pickup.address ?? pickup.name,
            country: pickup.country,
          },
          to: {
            geo_point: {
              lat: dropOff.lat,
              lon: dropOff.lng,
            },
            place_id: dropOff.place_id,
            city: dropOffCity,
            street: dropOff.street,
            ward: dropOff.address ?? dropOff.name,
            country: dropOff.country,
          },
        },
      });
    },
    onError(error, variables, context) {},
    onSuccess(data) {
      console.log("onSuccess", data);
    },
    retry: 3,
  });
}

export function useSendRideRequest() {
  const { pickup, dropOff, searchData } = useRideSearchState();
  const dropOffCity = useMemo(
    () => (dropOff?.city ? dropOff?.city : dropOff?.state),
    [dropOff?.city, dropOff?.state],
  );

  const pickupCity = useMemo(
    () => (pickup?.city ? pickup?.city : pickup?.state),
    [pickup?.city, pickup?.state],
  );

  const { makeApiCall } = useApiClient();

  console.log("PickUp", pickupCity, "\n\r \n\r", "Drop Off", dropOffCity);
  return useMutation({
    async mutationFn({ selected }: { selected: string }) {
      const category_data = searchData?.estimates.find(
        (item) => item.category === selected,
      );
      console.log("FINAL FARE IS:", category_data?.final_fare);
      return makeApiCall({
        method: "POST",
        url: `send-ride-request?q=${searchData?.search_req_id}`,
        headers: {
          "Content-Type": "application/json",
        },
        data: {
          from: {
            geo_point: {
              lat: pickup.lat,
              lon: pickup.lng,
            },
            place_id: pickup.place_id,
            city: pickupCity,
            street: pickup.street,
            ward: pickup.name,
            country: pickup.country,
          },
          to: {
            geo_point: {
              lat: dropOff.lat,
              lon: dropOff.lng,
            },
            place_id: dropOff.place_id,
            city: dropOffCity,
            street: dropOff.street,
            ward: dropOff.name,
            country: dropOff.country,
          },
          dx: searchData?.distance ?? 0,
          duration: searchData?.duration[0] ?? 0,
          fare: category_data?.final_fare ?? 0,
          radius: 2000.0, //TODO::
          vehicle_type: [selected],
        },
      });
    },
    onError(error, variables, context) {},
    onSuccess(data) {
      console.log("onSuccess", data);
    },
    retry: 3,
  });
}

export function useCancelRideRequestEarly() {
  const { makeApiCall } = useApiClient();

  return useMutation<any, Error, { ride_request_id: string }>({
    async mutationFn({ ride_request_id }) {
      return makeApiCall({
        method: "POST",
        url: `api/rider-cancel-ride-request/${ride_request_id}`,
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onError(error, variables, context) {},
    onSuccess(data) {
      console.log("onSuccess", data);
    },
    retry: 3,
  });
}

type SubmitDriverReviewVars = {
  driver_id: string;
  ride_id: string;
  punctuality: number;
  driving_behavior: number;
  safety_compliance: number;
  vehicle_cleanliness: number;
  feedback_details: string;
};

export function useSubmitDriverReview() {
  const { makeApiCall } = useApiClient();

  return useMutation<any, Error, SubmitDriverReviewVars>({
    async mutationFn({ driver_id, ride_id, ...ratings }) {
      return makeApiCall({
        method: "POST",
        url: `rate-driver/${driver_id}/${ride_id}`,
        headers: { "Content-Type": "application/json" },
        data: {
          ...ratings,
          rating_value: 5,
          was_offered_assistance: true,
          attachment_id: "",
        },
      });
    },
    onError(error) {},
    onSuccess(data) {
      console.log("review submitted", data);
    },
  });
}

export function useUpdateDeviceInfo() {
  const { makeApiCall } = useApiClient();

  return useMutation<any, Error, { device_token: string }>({
    async mutationFn({ device_token }) {
      return makeApiCall({
        method: "PUT",
        url: "api/profile/device-info",
        headers: { "Content-Type": "application/json" },
        data: {
          device_type: Platform.OS,
          device_token,
        },
      });
    },
  });
}

export function useCancelRideRequest() {
  const { makeApiCall } = useApiClient();
  const { rideData } = useActiveRideState();

  return useMutation<any, Error, { note: string; reason: string }>({
    async mutationFn(data) {
      return makeApiCall({
        method: "POST",
        url: `api/cancel-ride/${rideData?.id}?account_type=customer`,
        data: {
          ...data,
          ride_path_id: rideData?.id,
        },
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onError(error, variables, context) {},
    onSuccess(data) {
      console.log("onSuccess", data);
    },
    retry: 3,
  });
}

export type RideHistoryRide = {
  ride_id: string;
  driver_id: string;
  destination_name: string;
  status: string;
  amount: number;
  started_at: string;
  has_rated_driver: boolean;
};

export type RideHistoryGroup = {
  label: string;
  total_spent: number;
  rides: RideHistoryRide[];
};

export type RideDetails = {
  ride_id: string;
  driver_id: string;
  date: string;
  ride_category: string | null;
  destination_name: string;
  total_fare: number;
  status: string;
  from: {
    lat: number;
    lng: number;
    city: string | null;
    state: string | null;
    ward: string;
    place_id: string | null;
  };
  to: {
    lat: number;
    lng: number;
    city: string | null;
    state: string | null;
    ward: string;
    place_id: string | null;
  };
  driver: {
    name: string;
    rating: number;
    photo_id: string;
    vehicle: {
      make: string;
      model: string;
      color: string;
      plate_number: string;
    };
  };
};

export function useDeleteRide() {
  const { makeApiCall } = useApiClient();

  return useMutation<void, Error, { ride_id: string }>({
    async mutationFn({ ride_id }) {
      return makeApiCall({
        method: "DELETE",
        url: `api/customer/rides/${ride_id}`,
      });
    },
  });
}

export function useRateDriver() {
  const { makeApiCall } = useApiClient();
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { ride_id: string; driver_id: string; rating: number; comment?: string }
  >({
    async mutationFn({ ride_id, driver_id, rating, comment }) {
      return makeApiCall({
        method: "POST",
        url: `api/customer/rides/${ride_id}/rate`,
        data: { driver_id, rating, comment },
      });
    },
    onSuccess(_, { ride_id }) {
      // Optimistically patch the cached list — no refetch needed
      queryClient.setQueryData<InfiniteData<RideHistoryGroup[]>>(
        ["rideHistory"],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.map((group) => ({
                ...group,
                rides: group.rides.map((ride) =>
                  ride.ride_id === ride_id
                    ? { ...ride, has_rated_driver: true }
                    : ride,
                ),
              })),
            ),
          };
        },
      );
    },
  });
}

export function useRideDetails(rideId: string) {
  const { fetcher } = useApiClient();

  return useQuery<RideDetails, Error>({
    queryKey: ["rideDetails", rideId],
    queryFn: () => fetcher<RideDetails>(`api/customer/rides/${rideId}`),
    enabled: !!rideId,
    staleTime: 5 * 60 * 1000,
    retry: 2,
    notifyOnChangeProps: ["data", "error"],
  });
}

export type RideFareEntry = {
  components: {
    estimated_fare: number;
    extra_dx: number;
    toll: number;
    waiting_charge: number;
  };
  total: number;
  status: string;
  reason: string | null;
  recorded_at: string;
};

export function useRideFareHistory(rideId: string) {
  const { fetcher } = useApiClient();

  return useQuery<RideFareEntry[], Error>({
    queryKey: ["rideFareHistory", rideId],
    queryFn: () => fetcher<RideFareEntry[]>(`api/rides/${rideId}/fare/history`),
    enabled: !!rideId,
    staleTime: 60 * 1000,
    retry: 2,
    notifyOnChangeProps: ["data", "error"],
  });
}

export function useRideHistory() {
  const { makeApiCall } = useApiClient();

  return useInfiniteQuery<RideHistoryGroup[], Error>({
    queryKey: ["rideHistory"],
    queryFn: async ({ pageParam }) => {
      return makeApiCall<RideHistoryGroup[]>({
        method: "GET",
        url: `api/customer/ride-history?page=${pageParam}&page_size=20`,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length > 0 ? allPages.length : undefined,
  });
}
