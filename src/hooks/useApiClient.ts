import axios, { Method, AxiosError, RawAxiosRequestHeaders } from "axios";
import { useCallback } from "react";

import { BASE_URL } from "~/constants/BASE_URL";
import { useUserState } from "~/providers/AuthProvider";

export type AxiosOverrides = {
  forceAccessTokenAuthorization?: boolean;
};

export type AxiosParams = {
  url: string;
  method: Method;
  data?: any;
  unmountSignal?: AbortSignal;
  headers?: RawAxiosRequestHeaders;
};

export const useApiClient = () => {
  const { token } = useUserState();
  const GET_TIMEOUT = 20e3; // 20s
  const POST_TIMEOUT = 100e3; // 100s
  const makeApiCall = useCallback(
    async <T = any>({
      url,
      method,
      data,
      unmountSignal,
      headers,
    }: AxiosParams): Promise<T> => {
      const abort = new AbortController();
      const timeout = setTimeout(
        () => abort.abort(),
        method === "POST" ? POST_TIMEOUT : GET_TIMEOUT,
      );
      unmountSignal = abort.signal;

      const requestParams = {
        url,
        baseURL: BASE_URL,
        method,
        data,
        signal: unmountSignal,
        headers: {
          Authorization: token ? `Bearer ${token}` : undefined,
          ...headers,
        },
      };

      try {
        const response = await axios(requestParams).then((resp) => resp.data);
        clearTimeout(timeout);
        return response as T;
      } catch (err) {
        clearTimeout(timeout);
        if (err instanceof AxiosError) {
          throw { ...err, message: err.response?.data };
        }
        throw { err, message: "unknown error occurred" };
      }
    },
    [token],
  );

  const fetcher = useCallback(
    <T = any>(url: string): Promise<T> => {
      return makeApiCall<T>({ url, method: "GET" });
    },
    [makeApiCall],
  );

  return { makeApiCall, fetcher };
};
