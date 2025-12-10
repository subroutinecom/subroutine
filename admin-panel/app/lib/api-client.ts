import type { AdminClientConfig } from "./admin-config";

const customFetch: typeof fetch = (input, init) => {
  return fetch(input, {
    ...init,
    credentials: "include",
  });
};

interface SubroutineResponse {
  id: string;
  organizationId: string;
  integrationIds: string[];
  source: string;
  inputsSchema?: Record<string, unknown>;
  outputsSchema?: Record<string, unknown>;
  createdFrom: {
    request: string;
  };
  createdAt: string;
}

interface RunResponse {
  id: string;
  organizationId: string;
  subroutineId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  startedAt?: string | null;
  endedAt?: string | null;
  outputs?: Record<string, unknown> | null;
  error?: Record<string, unknown> | null;
}

export interface CreateSubroutineResult {
  subroutineUri: string;
  subroutine: SubroutineResponse;
}

export interface ExecuteRequestResult {
  subroutineUri: string;
  subroutine: SubroutineResponse;
  runUri: string;
  run: RunResponse;
}

export interface AuthRequirement {
  integrationId: string;
  integrationName: string;
  provider: string;
  authorizationUrl: string;
  state: string;
  patLinkUrl?: string;
  authInstructions?: string;
}

export interface IntegrationAuthRequiredError {
  code: "INTEGRATION_AUTH_REQUIRED";
  message: string;
  integrationId: string;
  provider: string;
  authorizationUrl: string;
  state: string;
  viewerId: string;
  requirements?: AuthRequirement[];
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    integrationId?: string;
    provider?: string;
    authorizationUrl?: string;
    state?: string;
    viewerId?: string;
    requirements?: AuthRequirement[];
  };
  // When auth error happens during run (after generation), subroutine data is included
  subroutine?: SubroutineResponse;
  subroutineUri?: string;
}

/**
 * Helper to extract a useful error message from various error types
 */
export const getErrorMessage = (err: unknown): string => {
  // Standard ApiError format from our server
  if (
    err &&
    typeof err === "object" &&
    "error" in err &&
    typeof (err as ApiError).error?.message === "string"
  ) {
    return (err as ApiError).error.message;
  }

  // Standard Error instance
  if (err instanceof Error) {
    return err.message;
  }

  // String error
  if (typeof err === "string") {
    return err;
  }

  // Unknown error type
  return "An unexpected error occurred";
};

export const isIntegrationAuthRequiredError = (
  error: ApiError
): error is { error: IntegrationAuthRequiredError } => {
  return error.error?.code === "INTEGRATION_AUTH_REQUIRED";
};

/**
 * Helper to safely parse JSON response and handle non-JSON responses gracefully
 */
const parseJsonResponse = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    // Response is not JSON - this can happen with proxy timeouts, server crashes, etc.
    // Create an ApiError-shaped object with the raw response text for debugging
    const statusText = response.status ? `${response.status} ${response.statusText}` : "Unknown";
    throw {
      error: {
        code: "PARSE_ERROR",
        message: `Server returned non-JSON response (${statusText}): ${text.substring(0, 200)}${text.length > 200 ? "..." : ""}`,
      },
    } as ApiError;
  }
};

export const createApiClient = (config: AdminClientConfig) => {
  const apiUrl = config.apiUrl;

  const createSubroutine = async (
    request: string,
    viewerId: string,
    integrations?: string[]
  ): Promise<CreateSubroutineResult> => {
    const response = await customFetch(`${apiUrl}/api/subroutine`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ request, viewerId, integrations }),
    });

    const data = await parseJsonResponse(response);

    if (!response.ok) {
      throw data as ApiError;
    }

    return data as CreateSubroutineResult;
  };

  const executeRequest = async (
    request: string,
    viewerId: string,
    integrations?: string[],
    timeoutMs?: number
  ): Promise<ExecuteRequestResult> => {
    const response = await customFetch(`${apiUrl}/api/subroutine/execute_request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ request, viewerId, integrations, timeoutMs }),
    });

    const data = await parseJsonResponse(response);

    if (!response.ok) {
      throw data as ApiError;
    }

    return data as ExecuteRequestResult;
  };

  const runSubroutine = async (
    subroutineId: string,
    viewerId: string,
    inputs?: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<{ runUri: string; run: RunResponse }> => {
    const response = await customFetch(`${apiUrl}/api/subroutine/${subroutineId}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ viewerId, inputs, timeoutMs }),
    });

    const data = await parseJsonResponse(response);

    if (!response.ok) {
      throw data as ApiError;
    }

    return data as { runUri: string; run: RunResponse };
  };

  const getSubroutine = async (id: string): Promise<{ subroutine: SubroutineResponse }> => {
    const response = await customFetch(`${apiUrl}/api/subroutine/${id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await parseJsonResponse(response);

    if (!response.ok) {
      throw data as ApiError;
    }

    return data as { subroutine: SubroutineResponse };
  };

  const getRun = async (id: string): Promise<{ run: RunResponse }> => {
    const response = await customFetch(`${apiUrl}/api/run/${id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await parseJsonResponse(response);

    if (!response.ok) {
      throw data as ApiError;
    }

    return data as { run: RunResponse };
  };

  return {
    createSubroutine,
    executeRequest,
    runSubroutine,
    getSubroutine,
    getRun,
  };
};
