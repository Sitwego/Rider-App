import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  GoogleLinkCancelledError,
  requestGoogleIdToken,
} from "~/helpers/googleLink.android";
import {
  CreateAccountType,
  RiderProfileResponse,
  UpdateProfilePayload,
} from "~/types/accountTypes";

import { useApiClient } from "./useApiClient";

export function useGetRiderProfile() {
  const { fetcher } = useApiClient();
  return useQuery<RiderProfileResponse, Error>({
    queryKey: ["rider-profile"],
    queryFn: () => fetcher<RiderProfileResponse>("api/customer/profile"),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useUpdateRiderProfile() {
  const { makeApiCall } = useApiClient();
  // const queryClient = useQueryClient();
  return useMutation<any, Error, UpdateProfilePayload>({
    async mutationFn(payload) {
      return await makeApiCall({
        url: "api/customer/profile",
        data: payload,
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        unmountSignal: new AbortController().signal,
      });
    },
    onSuccess(data) {
      // Update the cached profile immediately so the profile screen reflects changes
      // queryClient.setQueryData<RiderProfileResponse>(["rider-profile"], data);
    },
    onError(error) {
      console.error("Error updating profile:", error);
    },
  });
}

export type LinkGoogleResult = {
  cancelled: boolean;
};

/**
 * Triggers the Google account picker, sends the resulting idToken to the
 * backend to link the Google account to the rider's profile, then updates
 * the cached profile so `google_linked` reflects the change immediately.
 *
 * Usage:
 *   const { mutate: linkGoogle, isPending } = useLinkGoogleAccount();
 *   linkGoogle(undefined, { onSuccess, onError });
 */
export function useLinkGoogleAccount() {
  const { makeApiCall } = useApiClient();
  const queryClient = useQueryClient();

  return useMutation<LinkGoogleResult, Error, void>({
    async mutationFn() {
      let idToken: string;
      let email: string;

      try {
        ({ idToken, email } = await requestGoogleIdToken());
      } catch (err) {
        if (err instanceof GoogleLinkCancelledError) {
          return { cancelled: true };
        }
        throw err;
      }
      const google_linked = !!idToken && !!email;

      await makeApiCall({
        url: "api/customer/link-google",
        method: "PUT",
        data: {
          google_linked,
          google_email: email,
          id_token: idToken,
        },
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        unmountSignal: new AbortController().signal,
      });

      return { cancelled: false };
    },
    onSuccess(result) {
      if (result.cancelled) return;
      // Reflect the linked state in the cache immediately
      queryClient.setQueryData<RiderProfileResponse>(
        ["rider-profile"],
        (prev) => (prev ? { ...prev, google_linked: true } : prev),
      );
    },
    onError(error) {
      console.error("Error linking Google account:", error);
    },
  });
}

export function useCreateCustomer() {
  const { makeApiCall } = useApiClient();
  return useMutation<any, Error, CreateAccountType>({
    async mutationFn({ ...rest }) {
      return await makeApiCall({
        url: "create-profile/customer",
        data: rest,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        unmountSignal: new AbortController().signal,
      });
    },
    async onSuccess(data: any) {
      console.log("User created successfully:");
    },
    onError(error, variables, context) {
      console.error("Error creating user:", error);
    },
    retry: 3,
  });
}

export function useLoginCustomer() {
  const { makeApiCall } = useApiClient();
  return useMutation<any, Error, { phone_number: string; device_id: string }>({
    async mutationFn({ ...rest }) {
      return await makeApiCall({
        url: `login-customer`,
        method: "post",
        data: rest,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        unmountSignal: new AbortController().signal,
      });
    },
    async onSuccess(data: any) {
      console.log("✅✅User logged in successfully");
    },
    onError(error, variables, context) {
      console.error("❗Error logging in user:", error);
    },
    retry: 3,
  });
}
