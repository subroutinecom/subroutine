import { useState, useCallback } from "react";
import type { McpDiscoveryResult } from "../types";

interface UseMcpDiscoveryResult {
  isProbing: boolean;
  discoveryResult: McpDiscoveryResult | null;
  error: string | null;
  probeServer: (serverUrl: string) => Promise<McpDiscoveryResult | null>;
  clearDiscoveryResult: () => void;
}

export const useMcpDiscovery = (): UseMcpDiscoveryResult => {
  const [isProbing, setIsProbing] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<McpDiscoveryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const probeServer = useCallback(async (serverUrl: string): Promise<McpDiscoveryResult | null> => {
    if (!serverUrl) {
      setError("Server URL is required");
      return null;
    }

    setIsProbing(true);
    setError(null);

    try {
      // Probe the MCP server's well-known endpoint
      const wellKnownUrl = new URL("/.well-known/oauth-authorization-server", serverUrl);
      const response = await fetch(wellKnownUrl.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      let authMethods: McpDiscoveryResult["authMethods"] = undefined;

      if (response.ok) {
        const oauthMeta = await response.json();
        authMethods = [
          {
            type: "bearer_oauth" as const,
            oauth: {
              authorizationUrl: oauthMeta.authorization_endpoint,
              tokenUrl: oauthMeta.token_endpoint,
              scopes: oauthMeta.scopes_supported,
            },
          },
        ];
      }

      // For now, create a minimal discovery result
      // In a full implementation, we'd also probe the MCP initialize endpoint
      const result: McpDiscoveryResult = {
        serverInfo: {
          name: "MCP Server",
          version: undefined,
        },
        capabilities: {
          tools: true,
          resources: true,
          prompts: true,
        },
        authMethods,
      };

      setDiscoveryResult(result);
      return result;
    } catch {
      // If well-known fails, the server might still be valid but without OAuth
      const result: McpDiscoveryResult = {
        serverInfo: {
          name: "MCP Server",
        },
        capabilities: {
          tools: true,
          resources: true,
          prompts: true,
        },
        authMethods: [{ type: "none" }],
      };
      setDiscoveryResult(result);
      return result;
    } finally {
      setIsProbing(false);
    }
  }, []);

  const clearDiscoveryResult = useCallback(() => {
    setDiscoveryResult(null);
    setError(null);
  }, []);

  return {
    isProbing,
    discoveryResult,
    error,
    probeServer,
    clearDiscoveryResult,
  };
};
