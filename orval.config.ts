import { defineConfig } from "orval";

export default defineConfig({
  benefits360: {
    input: {
      target: "http://localhost:8000/openapi.json",
    },
    output: {
      target: "./src/benefits360/ui/lib/api.ts",
      client: "react-query",
      mode: "tags-split",
      override: {
        mutator: {
          path: "./src/benefits360/ui/lib/axios-instance.ts",
          name: "customInstance",
        },
        query: {
          useQuery: true,
          useSuspenseQuery: true,
          useInfiniteQuery: true,
          useMutation: true,
        },
      },
    },
  },
});

