import { useState } from "react";
import { useLoaderData } from "react-router";
import { useForm } from "react-hook-form";
import { gql } from "graphql-request";
import {
  Play,
  Code,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  ExternalLink,
  Copy,
  Check,
  Search,
  ListChecks,
  RotateCw,
} from "lucide-react";
import { PageHeader } from "~/components/ui/PageHeader";
import { graphqlClient } from "~/lib/graphql-client";
import {
  executeRequest,
  createSubroutine,
  runSubroutine,
  isIntegrationAuthRequiredError,
  type ApiError,
  type ExecuteRequestResult,
  type AuthRequirement,
} from "~/lib/api-client";
import { useAuth } from "~/components/providers/AuthProvider";

export function meta() {
  return [
    { title: "Playground - Subroutine" },
    { name: "description", content: "Test integrations with subroutine generation" },
  ];
}

const INTEGRATIONS_QUERY = gql`
  query GetPlaygroundIntegrations {
    integrations {
      id
      name
      provider
      enabled
    }
  }
`;

interface Integration {
  id: string;
  name: string;
  provider: string;
  enabled: boolean;
}

export const clientLoader = async () => {
  const data = await graphqlClient.request<{
    integrations: Integration[];
  }>(INTEGRATIONS_QUERY);

  return { integrations: data.integrations.filter((i) => i.enabled) };
};

type IntegrationMode = "provided" | "discovery";

interface PlaygroundFormData {
  request: string;
  integrations: string[];
  integrationMode: IntegrationMode;
  executeImmediately: boolean;
}

type ExecutionPhase = "idle" | "generating" | "executing" | "completed" | "error";

interface ExecutionState {
  phase: ExecutionPhase;
  generatedCode?: string;
  subroutineId?: string;
  run?: ExecuteRequestResult["run"];
  outputs?: Record<string, unknown>;
  error?: string;
  authRequirements?: AuthRequirement[];
}

export default function PlaygroundPage() {
  const { integrations } = useLoaderData<typeof clientLoader>();
  const { user } = useAuth();
  const [executionState, setExecutionState] = useState<ExecutionState>({ phase: "idle" });
  const [copied, setCopied] = useState(false);
  const [rerunning, setRerunning] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PlaygroundFormData>({
    defaultValues: {
      request: "",
      integrations: [],
      integrationMode: "discovery",
      executeImmediately: true,
    },
  });

  const selectedIntegrations = watch("integrations");
  const integrationMode = watch("integrationMode");
  const executeImmediately = watch("executeImmediately");

  const handleIntegrationToggle = (integrationId: string) => {
    const current = selectedIntegrations || [];
    if (current.includes(integrationId)) {
      setValue(
        "integrations",
        current.filter((id) => id !== integrationId)
      );
    } else {
      setValue("integrations", [...current, integrationId]);
    }
  };

  const onSubmit = async (data: PlaygroundFormData) => {
    const viewerId = user?.id || "playground-user";

    setExecutionState({ phase: "generating" });

    // In "provided" mode, pass selected integrations
    // In "discovery" mode, pass undefined to enable discovery tools
    const integrationsToUse =
      data.integrationMode === "provided" && data.integrations.length > 0
        ? data.integrations
        : undefined;

    try {
      if (data.executeImmediately) {
        setExecutionState({ phase: "generating" });

        const result = await executeRequest(data.request, viewerId, integrationsToUse, 60000);

        setExecutionState({
          phase: "completed",
          generatedCode: result.subroutine.source,
          subroutineId: result.subroutine.id,
          run: result.run,
          outputs: result.run.outputs || undefined,
        });
      } else {
        const result = await createSubroutine(data.request, viewerId, integrationsToUse);

        setExecutionState({
          phase: "completed",
          generatedCode: result.subroutine.source,
          subroutineId: result.subroutine.id,
        });
      }
    } catch (err) {
      const apiError = err as ApiError;

      if (isIntegrationAuthRequiredError(apiError)) {
        // Access subroutine from the original apiError (not the narrowed type)
        const subroutineData = (err as ApiError).subroutine;
        // Build requirements array from either requirements[] or legacy single fields
        const requirements: AuthRequirement[] = apiError.error.requirements?.length
          ? apiError.error.requirements
          : [
              {
                integrationId: apiError.error.integrationId!,
                integrationName: apiError.error.integrationId!,
                provider: apiError.error.provider!,
                authorizationUrl: apiError.error.authorizationUrl!,
                state: apiError.error.state!,
              },
            ];

        setExecutionState({
          phase: "error",
          error: apiError.error.message,
          // Include generated code if subroutine was created before auth error
          generatedCode: subroutineData?.source,
          subroutineId: subroutineData?.id,
          authRequirements: requirements,
        });
      } else {
        setExecutionState({
          phase: "error",
          error: apiError.error?.message || "An unexpected error occurred",
        });
      }
    }
  };

  const handleCopyCode = async () => {
    if (executionState.generatedCode) {
      await navigator.clipboard.writeText(executionState.generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleReset = () => {
    setExecutionState({ phase: "idle" });
  };

  const handleRerun = async () => {
    if (!executionState.subroutineId) return;

    const viewerId = user?.id || "playground-user";
    setRerunning(true);

    try {
      const result = await runSubroutine(executionState.subroutineId, viewerId, {}, 60000);

      setExecutionState((prev) => ({
        ...prev,
        phase: "completed",
        run: result.run,
        outputs: result.run.outputs || undefined,
        error: undefined,
        authRequirements: undefined,
      }));
    } catch (err) {
      const apiError = err as ApiError;

      if (isIntegrationAuthRequiredError(apiError)) {
        const requirements: AuthRequirement[] = apiError.error.requirements?.length
          ? apiError.error.requirements
          : [
              {
                integrationId: apiError.error.integrationId!,
                integrationName: apiError.error.integrationId!,
                provider: apiError.error.provider!,
                authorizationUrl: apiError.error.authorizationUrl!,
                state: apiError.error.state!,
              },
            ];

        setExecutionState((prev) => ({
          ...prev,
          phase: "error",
          error: apiError.error.message,
          authRequirements: requirements,
        }));
      } else {
        setExecutionState((prev) => ({
          ...prev,
          phase: "error",
          error: apiError.error?.message || "An unexpected error occurred",
        }));
      }
    } finally {
      setRerunning(false);
    }
  };

  const getStatusBadge = () => {
    switch (executionState.phase) {
      case "generating":
        return (
          <div className="badge badge-info gap-2">
            <Loader2 size={14} className="animate-spin" />
            Generating...
          </div>
        );
      case "executing":
        return (
          <div className="badge badge-warning gap-2">
            <Clock size={14} />
            Executing...
          </div>
        );
      case "completed":
        return (
          <div className="badge badge-success gap-2">
            <CheckCircle2 size={14} />
            {executionState.run ? `Completed (${executionState.run.status})` : "Generated"}
          </div>
        );
      case "error":
        return (
          <div className="badge badge-error gap-2">
            <AlertCircle size={14} />
            Error
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Playground"
        description="Test your integrations by generating and executing subroutines from natural language requests."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <div className="space-y-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Request Input */}
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body">
                <h2 className="card-title text-lg">Request</h2>
                <p className="text-sm text-base-content/60 mb-4">
                  Describe what you want the subroutine to do in natural language.
                </p>

                <div className="form-control">
                  <textarea
                    placeholder="e.g., Get my last 5 emails from Gmail and summarize them..."
                    className={`textarea textarea-bordered h-32 text-base ${
                      errors.request ? "textarea-error" : ""
                    }`}
                    {...register("request", {
                      required: "Please enter a request",
                      minLength: {
                        value: 10,
                        message: "Request should be at least 10 characters",
                      },
                    })}
                  />
                  {errors.request && (
                    <label className="label">
                      <span className="label-text-alt text-error">{errors.request.message}</span>
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Integration Mode Selection */}
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body">
                <h2 className="card-title text-lg">Integration Mode</h2>
                <p className="text-sm text-base-content/60 mb-4">
                  Choose how the agent should access external services.
                </p>

                {/* Mode Selection */}
                <div className="space-y-3 mb-4">
                  <label
                    className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                      integrationMode === "discovery"
                        ? "border-primary bg-primary/5"
                        : "border-base-300 hover:border-base-content/20"
                    }`}
                  >
                    <input
                      type="radio"
                      className="radio radio-primary mt-0.5"
                      value="discovery"
                      {...register("integrationMode")}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Search size={16} />
                        <span className="font-medium">Auto-discover</span>
                        <span className="badge badge-info badge-sm">Recommended</span>
                      </div>
                      <p className="text-sm text-base-content/60 mt-1">
                        Agent discovers available integrations and sets up new ones as needed.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                      integrationMode === "provided"
                        ? "border-primary bg-primary/5"
                        : "border-base-300 hover:border-base-content/20"
                    }`}
                  >
                    <input
                      type="radio"
                      className="radio radio-primary mt-0.5"
                      value="provided"
                      {...register("integrationMode")}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <ListChecks size={16} />
                        <span className="font-medium">Use selected integrations</span>
                      </div>
                      <p className="text-sm text-base-content/60 mt-1">
                        Agent can only use the integrations you select below.
                      </p>
                    </div>
                  </label>
                </div>

                {/* Integration List - only shown in "provided" mode */}
                {integrationMode === "provided" && (
                  <div className="border-t border-base-300 pt-4 mt-2">
                    <h3 className="font-medium text-sm mb-3">Select integrations:</h3>
                    {integrations.length === 0 ? (
                      <div className="text-center py-6 text-base-content/50">
                        <p>No enabled integrations found.</p>
                        <p className="text-sm mt-1">
                          Add integrations from the Integrations page first.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {integrations.map((integration) => (
                          <label
                            key={integration.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                              selectedIntegrations?.includes(integration.id)
                                ? "border-primary bg-primary/5"
                                : "border-base-300 hover:border-base-content/20"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="checkbox checkbox-primary checkbox-sm"
                              checked={selectedIntegrations?.includes(integration.id) || false}
                              onChange={() => handleIntegrationToggle(integration.id)}
                            />
                            <div className="flex-1">
                              <span className="font-medium">{integration.name}</span>
                              <span className="ml-2 badge badge-ghost badge-sm capitalize">
                                {integration.provider}
                              </span>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Options */}
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body">
                <h2 className="card-title text-lg">Options</h2>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="toggle toggle-primary"
                    {...register("executeImmediately")}
                  />
                  <div>
                    <span className="font-medium">Execute immediately</span>
                    <p className="text-sm text-base-content/60">
                      Generate and run the subroutine in one step
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={
                executionState.phase === "generating" || executionState.phase === "executing"
              }
              className="btn btn-primary w-full gap-2"
            >
              {executionState.phase === "generating" || executionState.phase === "executing" ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  {executionState.phase === "generating" ? "Generating..." : "Executing..."}
                </>
              ) : (
                <>
                  <Play size={20} />
                  {executeImmediately ? "Generate & Execute" : "Generate Only"}
                </>
              )}
            </button>
          </form>
        </div>

        {/* Output Panel */}
        <div className="space-y-6">
          {/* Status */}
          {executionState.phase !== "idle" && (
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body">
                <div className="flex items-center justify-between">
                  <h2 className="card-title text-lg">Status</h2>
                  {getStatusBadge()}
                </div>

                {executionState.phase === "completed" && executionState.subroutineId && (
                  <p className="text-sm text-base-content/60 mt-2">
                    Subroutine ID:{" "}
                    <code className="bg-base-200 px-2 py-0.5 rounded text-xs">
                      {executionState.subroutineId}
                    </code>
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleReset}
                  className="btn btn-ghost btn-sm mt-2 self-start"
                >
                  Clear Results
                </button>
              </div>
            </div>
          )}

          {/* Error Display */}
          {executionState.phase === "error" && (
            <div className="alert alert-error">
              <AlertCircle size={20} />
              <div className="flex-1">
                <h3 className="font-bold">Error</h3>
                <p className="text-sm">{executionState.error}</p>

                {executionState.authRequirements && executionState.authRequirements.length > 0 && (
                  <div className="mt-3 space-y-4">
                    {executionState.authRequirements.map((req) => (
                      <div
                        key={req.integrationId}
                        className="bg-error/10 rounded-lg p-3 border border-error/20"
                      >
                        <p className="text-sm font-medium mb-2">
                          <strong>"{req.integrationName}"</strong> ({req.provider}) requires
                          authorization.
                        </p>

                        {req.authInstructions && (
                          <p className="text-sm text-base-content/80 mb-3">
                            {req.authInstructions}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {req.patLinkUrl && (
                            <button
                              type="button"
                              onClick={() => globalThis.open(req.patLinkUrl, "_blank")}
                              className="btn btn-sm btn-primary gap-2"
                            >
                              <ExternalLink size={14} />
                              Enter API Key / Token
                            </button>
                          )}
                          {req.authorizationUrl && (
                            <button
                              type="button"
                              onClick={() => globalThis.open(req.authorizationUrl, "_blank")}
                              className="btn btn-sm btn-outline gap-2"
                            >
                              <ExternalLink size={14} />
                              Authorize with OAuth
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-base-content/60">
                      After authorizing, try your request again.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Generated Code */}
          {executionState.generatedCode && (
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body p-0">
                <div className="flex items-center justify-between px-6 py-4 border-b border-base-300">
                  <h2 className="card-title text-lg gap-2">
                    <Code size={20} />
                    Generated Code
                  </h2>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="btn btn-ghost btn-sm gap-2"
                    >
                      {copied ? (
                        <>
                          <Check size={14} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          Copy
                        </>
                      )}
                    </button>
                    {executionState.subroutineId && (
                      <button
                        type="button"
                        onClick={handleRerun}
                        disabled={rerunning}
                        className="btn btn-primary btn-sm gap-2"
                      >
                        {rerunning ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            Running...
                          </>
                        ) : (
                          <>
                            <RotateCw size={14} />
                            Rerun
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <pre className="p-4 text-sm font-mono bg-base-200/50 overflow-auto max-h-96">
                    <code>{executionState.generatedCode}</code>
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Execution Results */}
          {executionState.run && (
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body">
                <h2 className="card-title text-lg">Execution Result</h2>

                <div className="space-y-4 mt-2">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-sm text-base-content/60">Status:</span>
                      <span
                        className={`ml-2 badge ${
                          executionState.run.status === "succeeded"
                            ? "badge-success"
                            : executionState.run.status === "failed"
                              ? "badge-error"
                              : "badge-warning"
                        }`}
                      >
                        {executionState.run.status}
                      </span>
                    </div>
                    {executionState.run.startedAt && executionState.run.endedAt && (
                      <div>
                        <span className="text-sm text-base-content/60">Duration:</span>
                        <span className="ml-2 text-sm">
                          {(
                            (new Date(executionState.run.endedAt).getTime() -
                              new Date(executionState.run.startedAt).getTime()) /
                            1000
                          ).toFixed(2)}
                          s
                        </span>
                      </div>
                    )}
                  </div>

                  {executionState.run.outputs && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">Outputs:</h3>
                      <pre className="p-4 bg-base-200/50 rounded-lg text-sm font-mono overflow-auto max-h-64">
                        {JSON.stringify(executionState.run.outputs, null, 2)}
                      </pre>
                    </div>
                  )}

                  {executionState.run.error && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2 text-error">Error:</h3>
                      <pre className="p-4 bg-error/10 rounded-lg text-sm font-mono overflow-auto max-h-64 text-error">
                        {JSON.stringify(executionState.run.error, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {executionState.phase === "idle" && (
            <div className="card bg-base-100 border border-base-300 border-dashed">
              <div className="card-body items-center text-center py-12">
                <Code size={48} className="text-base-content/30 mb-4" />
                <h3 className="text-lg font-medium text-base-content/70">No results yet</h3>
                <p className="text-sm text-base-content/50 max-w-sm">
                  Enter a request and click "Generate & Execute" to see the generated code and
                  execution results here.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
