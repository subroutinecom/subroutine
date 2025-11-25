import { useCallback, useState } from "react";
import { gql } from "graphql-request";
import { graphqlClient } from "~/lib/graphql-client";
import type { McpOAuthDiscoveryResult } from "../McpFormFields";

const DISCOVER_MCP_OAUTH_QUERY = gql`
  query DiscoverMcpOAuth($serverUrl: String!) {
    discoverMcpOAuth(serverUrl: $serverUrl) {
      success
      serverName
      authorizationServer
      authorizationEndpoint
      tokenEndpoint
      registrationEndpoint
      scopesSupported
      pkceSupported
      dynamicRegistrationSupported
      error
    }
  }
`;

interface UseMcpDiscoveryOptions {
  onDiscoverySuccess?: (result: McpOAuthDiscoveryResult) => void;
}

export const useMcpDiscovery = (options: UseMcpDiscoveryOptions = {}) => {
  const [isProbing, setIsProbing] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<McpOAuthDiscoveryResult | null>(null);

  const probeServer = useCallback(
    async (serverUrl: string) => {
      const trimmedUrl = serverUrl?.trim();
      if (!trimmedUrl) return;

      setIsProbing(true);
      setDiscoveryResult(null);

      try {
        const data = await graphqlClient.request<{
          discoverMcpOAuth: McpOAuthDiscoveryResult;
        }>(DISCOVER_MCP_OAUTH_QUERY, { serverUrl: trimmedUrl });

        const result = data.discoverMcpOAuth;
        setDiscoveryResult(result);

        if (result.success && options.onDiscoverySuccess) {
          options.onDiscoverySuccess(result);
        }

        return result;
      } catch (err) {
        const errorResult: McpOAuthDiscoveryResult = {
          success: false,
          error: err instanceof Error ? err.message : "Failed to probe server",
        };
        setDiscoveryResult(errorResult);
        return errorResult;
      } finally {
        setIsProbing(false);
      }
    },
    [options]
  );

  const clearDiscoveryResult = useCallback(() => {
    setDiscoveryResult(null);
  }, []);

  return {
    isProbing,
    discoveryResult,
    probeServer,
    clearDiscoveryResult,
  };
};
