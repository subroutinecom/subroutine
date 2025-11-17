import { GraphQLClient } from "graphql-request";

const GRAPHQL_URL = "http://localhost:8080/graphql";

const customFetch = (input: RequestInfo | URL, init?: RequestInit) => {
  return fetch(input, {
    ...init,
    credentials: "include", // Include cookies for session auth
  });
};

export const graphqlClient = new GraphQLClient(GRAPHQL_URL, {
  // deno-lint-ignore no-explicit-any
  fetch: customFetch as any,
});
