import axios, { AxiosRequestConfig } from "axios";

export const customInstance = <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> => {
  const source = axios.CancelToken.source();
  const promise = axios({
    ...config,
    ...options,
    baseURL: "/api",
    cancelToken: source.token,
    headers: {
      "Content-Type": "application/json",
      ...config.headers,
      ...options?.headers,
    },
  }).then(({ data }) => data);

  // @ts-ignore
  promise.cancel = () => {
    source.cancel("Query was cancelled");
  };

  return promise;
};

