import type { AxiosResponse } from "axios";

export const selector = <T>() => ({
  query: {
    select: (response: AxiosResponse<T>) => response.data,
  },
});

export default selector;
