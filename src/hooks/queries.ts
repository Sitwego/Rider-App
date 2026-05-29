import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useApiClient } from "./useApiClient";

const useRidePolling = (data: string[]) => {
  const queryClient = useQueryClient();

  const { makeApiCall } = useApiClient();

  const shouldPoll = useMemo(() => data.length > 0, [data]);

  //destructure data to get ride_id and driver_id
  const [ride_id, driver_id] = useMemo(() => data, [data]);

  useEffect(() => {
    if (!shouldPoll) {
      queryClient.removeQueries({ queryKey: ["rideData", ride_id] });
    }
  }, [queryClient, ride_id, shouldPoll]);

  return useQuery<any, Error>({
    queryKey: ["rideData", ride_id],
    queryFn: async (): Promise<any> => {
      const abortController = new AbortController();
      // Replace with your actual API call
      return makeApiCall({
        method: "GET",
        url: `get-accepted-ride-by-driver/${ride_id}/${driver_id}/ride-details`,
        unmountSignal: abortController.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });
    },
    enabled: shouldPoll,
    // Polling configuration
    refetchInterval: shouldPoll ? 2000 : false,
    refetchIntervalInBackground: true,
    // Prevent refetch on window focus to avoid duplicate polling
    refetchOnWindowFocus: false,

    // Error handling
    retry: 4,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    // For Performance optimizations
    staleTime: 0, //1000,
    gcTime: 0, // 5 * 60 * 1000,
    // Only re-render when data or error changes
    notifyOnChangeProps: ["data", "error"],
  });
};

export default useRidePolling;
