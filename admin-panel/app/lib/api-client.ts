const API_URL = "http://localhost:3002";

const customFetch = (input: RequestInfo | URL, init?: RequestInit) => {
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
  initialInputs?: Record<string, unknown>;
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
  initialInputs: Record<string, unknown>;
}

export interface IntegrationAuthRequiredError {
  code: "INTEGRATION_AUTH_REQUIRED";
  message: string;
  integrationId: string;
  provider: string;
  authorizationUrl: string;
  state: string;
  viewerId: string;
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
  };
}

export const isIntegrationAuthRequiredError = (
  error: ApiError
): error is { error: IntegrationAuthRequiredError } => {
  return error.error?.code === "INTEGRATION_AUTH_REQUIRED";
};

export const createSubroutine = async (
  request: string,
  integrations?: string[]
): Promise<CreateSubroutineResult> => {
  const response = await customFetch(`${API_URL}/api/subroutine`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ request, integrations }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw data as ApiError;
  }

  return data as CreateSubroutineResult;
};

export const executeRequest = async (
  request: string,
  viewerId: string,
  integrations?: string[],
  timeoutMs?: number
): Promise<ExecuteRequestResult> => {
  const response = await customFetch(`${API_URL}/api/subroutine/execute_request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ request, viewerId, integrations, timeoutMs }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw data as ApiError;
  }

  return data as ExecuteRequestResult;
};

export const runSubroutine = async (
  subroutineId: string,
  viewerId: string,
  inputs?: Record<string, unknown>,
  timeoutMs?: number
): Promise<{ runUri: string; run: RunResponse }> => {
  const response = await customFetch(`${API_URL}/api/subroutine/${subroutineId}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ viewerId, inputs, timeoutMs }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw data as ApiError;
  }

  return data as { runUri: string; run: RunResponse };
};

export const getSubroutine = async (id: string): Promise<{ subroutine: SubroutineResponse }> => {
  const response = await customFetch(`${API_URL}/api/subroutine/${id}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw data as ApiError;
  }

  return data as { subroutine: SubroutineResponse };
};

export const getRun = async (id: string): Promise<{ run: RunResponse }> => {
  const response = await customFetch(`${API_URL}/api/run/${id}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw data as ApiError;
  }

  return data as { run: RunResponse };
};
