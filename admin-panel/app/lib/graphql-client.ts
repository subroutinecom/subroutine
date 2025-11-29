import { GraphQLClient } from "graphql-request";
import type { AdminClientConfig } from "./admin-config";

const customFetch: typeof fetch = (input, init) => {
  return fetch(input, {
    ...init,
    credentials: "include", // Include cookies for session auth
  });
};

const clientCache = new Map<string, GraphQLClient>();

export const createGraphqlClient = (config: AdminClientConfig): GraphQLClient => {
  const existing = clientCache.get(config.graphqlUrl);
  if (existing) return existing;

  const client = new GraphQLClient(config.graphqlUrl, {
    fetch: customFetch,
  });
  clientCache.set(config.graphqlUrl, client);
  return client;
};
