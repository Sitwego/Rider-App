// import axios, { Method, AxiosError, RawAxiosRequestHeaders } from "axios";

// export const BASE_URL = "http://165.22.210.124:8090/";

// const GET_TIMEOUT = 20e3; // 20s 5e3
// const POST_TIMEOUT = 100e3; // 100s

// const dev_token =
//   "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIwMUs3NkVHNzVWUEE5NDFIVkRCN1ZKUVFUMiIsImV4cCI6MTc2Nzg1NTM4NywiaWF0IjoxNzYwMDc5Mzg3fQ.ut6cLhKhJaOOxnO3T7SMws68vnoS1xGmIgClIJM_AEM";
// export type AxiosOverrides = {
//   forceAccessTokenAuthorization?: boolean;
// };
// export type AxiosParams = {
//   url: string;
//   method: Method;
//   data?: any;
//   unmountSignal?: AbortSignal;
//   headers?: RawAxiosRequestHeaders;
// };

// export const makeApiCall = async ({
//   url,
//   method,
//   data,
//   unmountSignal,
//   headers,
// }: AxiosParams) => {
//   const token = dev_token; // getAccessCredentials()?.access_token;
//   const abort = new AbortController();
//   const tm = setTimeout(
//     () => () => abort.abort(),
//     method === "POST" ? POST_TIMEOUT : GET_TIMEOUT,
//   );
//   unmountSignal = abort.signal;
//   const requestParams = {
//     url,
//     baseURL: BASE_URL,
//     method,
//     data,
//     signal: unmountSignal,
//     headers: {
// "Content-Type": "application/json",
// Accept: "application/json",
//       Authorization: token ? `Bearer ${token}` : null,
//       ...headers,
//     },
//   };

//   try {
//     const response = await axios(requestParams).then((resp) => resp.data);
//     clearTimeout(tm);
//     return response;
//   } catch (err) {
//     clearTimeout(tm);
//     if (err instanceof AxiosError) {
//       throw { ...err, message: err.response?.data };
//     }

//     throw { err, message: "unknown error occurred" };
//   }
// };

// export const fetcher = (url: string) => {
//   return makeApiCall({ url, method: "GET" });
// };
