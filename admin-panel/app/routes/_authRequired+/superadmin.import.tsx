import { useState, useCallback } from "react";
import { useLoaderData, useNavigate } from "react-router";
import {
  ArrowLeft,
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ClipboardPaste,
} from "lucide-react";
import { Link } from "react-router";
import { gql } from "graphql-request";
import { parse as parseYaml } from "yaml";
import { PageHeader } from "~/components/ui/PageHeader";
import { graphqlClient } from "~/lib/graphql-client";

export function meta() {
  return [
    { title: "Import Global Integrations - Subroutine" },
    { name: "description", content: "Bulk import global integrations from YAML" },
  ];
}

const CHECK_SUPERADMIN_QUERY = gql`
  query CheckSuperadmin {
    isSuperadmin
  }
`;

const CREATE_INTEGRATION_MUTATION = gql`
  mutation CreateGlobalIntegration(
    $provider: String!
    $name: String!
    $authConfig: String!
    $description: String
    $visibility: String
  ) {
    createIntegration(
      provider: $provider
      name: $name
      authConfig: $authConfig
      description: $description
      visibility: $visibility
    ) {
      id
      provider
      name
    }
  }
`;

export const clientLoader = async () => {
  const data = await graphqlClient.request<{ isSuperadmin: boolean }>(CHECK_SUPERADMIN_QUERY);
  return { isSuperadmin: data.isSuperadmin };
};

// Types for YAML schema
interface McpAuthStrategy {
  type: "none" | "api_key" | "bearer_passthrough";
  headerName?: string;
  apiKey?: string;
  isViewerScoped?: boolean;
}

interface McpOAuthConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scopes: string[];
}

interface McpIntegrationConfig {
  provider: "mcp";
  name: string;
  description?: string;
  serverUrl: string;
  transport?: "sse" | "streamable-http";
  authStrategy: McpAuthStrategy;
  oauthConfig?: McpOAuthConfig;
}

interface OAuth2IntegrationConfig {
  provider: "github" | "gmail" | "calendar";
  name: string;
  description?: string;
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scopes: string[];
}

type IntegrationConfig = McpIntegrationConfig | OAuth2IntegrationConfig;

interface YamlSchema {
  integrations: IntegrationConfig[];
}

interface ImportResult {
  name: string;
  success: boolean;
  error?: string;
  id?: string;
}

// Validation functions
const validateMcpIntegration = (config: McpIntegrationConfig, index: number): string[] => {
  const errors: string[] = [];
  const prefix = `integrations[${index}]`;

  if (!config.name || typeof config.name !== "string") {
    errors.push(`${prefix}.name is required and must be a string`);
  }
  if (!config.serverUrl || typeof config.serverUrl !== "string") {
    errors.push(`${prefix}.serverUrl is required and must be a string`);
  }
  if (config.transport && !["sse", "streamable-http"].includes(config.transport)) {
    errors.push(`${prefix}.transport must be 'sse' or 'streamable-http'`);
  }
  if (!config.authStrategy || typeof config.authStrategy !== "object") {
    errors.push(`${prefix}.authStrategy is required and must be an object`);
  } else {
    const validTypes = ["none", "api_key", "bearer_passthrough"];
    if (!validTypes.includes(config.authStrategy.type)) {
      errors.push(`${prefix}.authStrategy.type must be one of: ${validTypes.join(", ")}`);
    }
    if (config.authStrategy.type === "api_key") {
      if (!config.authStrategy.isViewerScoped && !config.authStrategy.apiKey) {
        errors.push(`${prefix}.authStrategy.apiKey is required for non-viewer-scoped api_key auth`);
      }
    }
    if (config.authStrategy.type === "bearer_passthrough") {
      if (!config.oauthConfig) {
        errors.push(`${prefix}.oauthConfig is required for bearer_passthrough auth strategy`);
      } else {
        if (!config.oauthConfig.clientId) {
          errors.push(`${prefix}.oauthConfig.clientId is required`);
        }
        if (!config.oauthConfig.clientSecret) {
          errors.push(`${prefix}.oauthConfig.clientSecret is required`);
        }
        if (!config.oauthConfig.authUrl) {
          errors.push(`${prefix}.oauthConfig.authUrl is required`);
        }
        if (!config.oauthConfig.tokenUrl) {
          errors.push(`${prefix}.oauthConfig.tokenUrl is required`);
        }
        if (!config.oauthConfig.redirectUri) {
          errors.push(`${prefix}.oauthConfig.redirectUri is required`);
        }
        if (!Array.isArray(config.oauthConfig.scopes)) {
          errors.push(`${prefix}.oauthConfig.scopes must be an array`);
        }
      }
    }
  }

  return errors;
};

const validateOAuth2Integration = (config: OAuth2IntegrationConfig, index: number): string[] => {
  const errors: string[] = [];
  const prefix = `integrations[${index}]`;

  if (!config.name || typeof config.name !== "string") {
    errors.push(`${prefix}.name is required and must be a string`);
  }
  if (!config.clientId || typeof config.clientId !== "string") {
    errors.push(`${prefix}.clientId is required and must be a string`);
  }
  if (!config.clientSecret || typeof config.clientSecret !== "string") {
    errors.push(`${prefix}.clientSecret is required and must be a string`);
  }
  if (!config.authUrl || typeof config.authUrl !== "string") {
    errors.push(`${prefix}.authUrl is required and must be a string`);
  }
  if (!config.tokenUrl || typeof config.tokenUrl !== "string") {
    errors.push(`${prefix}.tokenUrl is required and must be a string`);
  }
  if (!config.redirectUri || typeof config.redirectUri !== "string") {
    errors.push(`${prefix}.redirectUri is required and must be a string`);
  }
  if (!Array.isArray(config.scopes)) {
    errors.push(`${prefix}.scopes is required and must be an array`);
  }

  return errors;
};

const validateYaml = (data: unknown): { valid: boolean; errors: string[]; data?: YamlSchema } => {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["YAML must be an object"] };
  }

  const schema = data as Record<string, unknown>;

  if (!Array.isArray(schema.integrations)) {
    return { valid: false, errors: ["integrations must be an array"] };
  }

  if (schema.integrations.length === 0) {
    return { valid: false, errors: ["integrations array cannot be empty"] };
  }

  const validProviders = ["mcp", "github", "gmail", "calendar"];

  schema.integrations.forEach((integration: unknown, index: number) => {
    if (!integration || typeof integration !== "object") {
      errors.push(`integrations[${index}] must be an object`);
      return;
    }

    const config = integration as Record<string, unknown>;

    if (!config.provider || !validProviders.includes(config.provider as string)) {
      errors.push(`integrations[${index}].provider must be one of: ${validProviders.join(", ")}`);
      return;
    }

    if (config.provider === "mcp") {
      errors.push(...validateMcpIntegration(config as unknown as McpIntegrationConfig, index));
    } else {
      errors.push(
        ...validateOAuth2Integration(config as unknown as OAuth2IntegrationConfig, index)
      );
    }
  });

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], data: schema as unknown as YamlSchema };
};

const buildAuthConfig = (config: IntegrationConfig): string => {
  if (config.provider === "mcp") {
    const mcpConfig = config as McpIntegrationConfig;
    const authConfig: Record<string, unknown> = {
      type: "mcp",
      serverUrl: mcpConfig.serverUrl,
      transport: mcpConfig.transport || "streamable-http",
      authStrategy: mcpConfig.authStrategy,
    };
    if (mcpConfig.oauthConfig) {
      authConfig.oauthConfig = mcpConfig.oauthConfig;
    }
    return JSON.stringify(authConfig);
  } else {
    const oauthConfig = config as OAuth2IntegrationConfig;
    return JSON.stringify({
      type: "oauth2",
      clientId: oauthConfig.clientId,
      clientSecret: oauthConfig.clientSecret,
      authUrl: oauthConfig.authUrl,
      tokenUrl: oauthConfig.tokenUrl,
      redirectUri: oauthConfig.redirectUri,
      scopes: oauthConfig.scopes,
    });
  }
};

export default function SuperadminImportPage() {
  const navigate = useNavigate();
  const { isSuperadmin } = useLoaderData<typeof clientLoader>();
  const [inputMode, setInputMode] = useState<"file" | "paste">("file");
  const [isDragging, setIsDragging] = useState(false);
  const [_yamlContent, setYamlContent] = useState<string>("");
  const [pastedContent, setPastedContent] = useState<string>("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [parsedData, setParsedData] = useState<YamlSchema | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);

  // Redirect non-superadmins
  if (!isSuperadmin) {
    return (
      <div className="space-y-10">
        <PageHeader
          title="Access Denied"
          description="This page is only accessible to superadmin organizations."
          action={
            <Link to="/integrations" className="btn btn-ghost gap-2 h-12">
              <ArrowLeft size={20} />
              Back to Integrations
            </Link>
          }
        />
        <div className="alert alert-error">
          <XCircle size={20} />
          <span>
            You do not have permission to access this page. Only superadmin organizations can import
            global integrations.
          </span>
        </div>
      </div>
    );
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith(".yaml") && !file.name.endsWith(".yml")) {
      setValidationErrors(["File must be a YAML file (.yaml or .yml)"]);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setYamlContent(content);
      setFileName(file.name);
      setImportResults(null);

      try {
        const parsed = parseYaml(content);
        const validation = validateYaml(parsed);

        if (validation.valid && validation.data) {
          setValidationErrors([]);
          setParsedData(validation.data);
        } else {
          setValidationErrors(validation.errors);
          setParsedData(null);
        }
      } catch (err) {
        setValidationErrors([
          `YAML parse error: ${err instanceof Error ? err.message : "Unknown error"}`,
        ]);
        setParsedData(null);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile]
  );

  const handlePastedContent = useCallback((content: string) => {
    setPastedContent(content);
    setImportResults(null);

    if (!content.trim()) {
      setValidationErrors([]);
      setParsedData(null);
      setFileName(null);
      return;
    }

    try {
      const parsed = parseYaml(content);
      const validation = validateYaml(parsed);

      if (validation.valid && validation.data) {
        setValidationErrors([]);
        setParsedData(validation.data);
        setFileName("Pasted YAML");
      } else {
        setValidationErrors(validation.errors);
        setParsedData(null);
        setFileName(null);
      }
    } catch (err) {
      setValidationErrors([
        `YAML parse error: ${err instanceof Error ? err.message : "Unknown error"}`,
      ]);
      setParsedData(null);
      setFileName(null);
    }
  }, []);

  const handleImport = async () => {
    if (!parsedData) return;

    setIsImporting(true);
    const results: ImportResult[] = [];

    for (const config of parsedData.integrations) {
      try {
        const response = await graphqlClient.request<{
          createIntegration: { id: string; name: string };
        }>(CREATE_INTEGRATION_MUTATION, {
          provider: config.provider,
          name: config.name,
          authConfig: buildAuthConfig(config),
          description: config.description || null,
          visibility: "global",
        });

        results.push({
          name: config.name,
          success: true,
          id: response.createIntegration.id,
        });
      } catch (err) {
        results.push({
          name: config.name,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    setImportResults(results);
    setIsImporting(false);
  };

  const successCount = importResults?.filter((r) => r.success).length ?? 0;
  const failureCount = importResults?.filter((r) => !r.success).length ?? 0;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Import Global Integrations"
        description="Bulk import global integrations from a YAML configuration file."
        action={
          <Link to="/integrations" className="btn btn-ghost gap-2 h-12">
            <ArrowLeft size={20} />
            Back
          </Link>
        }
      />

      <div className="card bg-base-100 border border-base-300 max-w-4xl">
        <div className="card-body p-10 space-y-8">
          {/* Input Mode Tabs */}
          <div className="tabs tabs-boxed bg-base-200 p-1 w-fit">
            <button
              type="button"
              onClick={() => setInputMode("file")}
              className={`tab gap-2 ${inputMode === "file" ? "tab-active" : ""}`}
            >
              <Upload size={16} />
              Upload File
            </button>
            <button
              type="button"
              onClick={() => setInputMode("paste")}
              className={`tab gap-2 ${inputMode === "paste" ? "tab-active" : ""}`}
            >
              <ClipboardPaste size={16} />
              Paste YAML
            </button>
          </div>

          {/* File Upload Mode */}
          {inputMode === "file" && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-base-300 hover:border-base-content/30"
              }`}
            >
              <input
                type="file"
                accept=".yaml,.yml"
                onChange={handleFileSelect}
                className="hidden"
                id="yaml-upload"
              />
              <label htmlFor="yaml-upload" className="cursor-pointer">
                <Upload
                  size={48}
                  className={`mx-auto mb-4 ${isDragging ? "text-primary" : "text-base-content/40"}`}
                />
                <p className="text-lg font-medium text-base-content mb-2">
                  {isDragging ? "Drop your YAML file here" : "Drag and drop your YAML file here"}
                </p>
                <p className="text-sm text-base-content/60">
                  or <span className="text-primary underline">click to browse</span>
                </p>
              </label>
            </div>
          )}

          {/* Paste Mode */}
          {inputMode === "paste" && (
            <div className="space-y-3">
              <textarea
                value={pastedContent}
                onChange={(e) => handlePastedContent(e.target.value)}
                placeholder={`# Paste your YAML content here
integrations:
  - provider: mcp
    name: "GitHub"
    description: "GitHub integration"
    serverUrl: "https://api.githubcopilot.com/mcp/"
    ...`}
                className="textarea textarea-bordered w-full font-mono text-sm min-h-[300px] bg-base-200"
              />
              <p className="text-sm text-base-content/60">
                Paste your YAML configuration directly. The content will be validated as you type.
              </p>
            </div>
          )}

          {/* File Info */}
          {fileName && (
            <div className="flex items-center gap-3 p-4 bg-base-200 rounded-lg">
              <FileText size={24} className="text-primary" />
              <div className="flex-1">
                <p className="font-medium text-base-content">{fileName}</p>
                <p className="text-sm text-base-content/60">
                  {parsedData
                    ? `${parsedData.integrations.length} integration(s) found`
                    : "Validation failed"}
                </p>
              </div>
              {parsedData && <CheckCircle size={24} className="text-success" />}
              {validationErrors.length > 0 && <XCircle size={24} className="text-error" />}
            </div>
          )}

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <div className="alert alert-error">
              <AlertTriangle size={20} />
              <div>
                <p className="font-semibold">Validation Errors:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  {validationErrors.map((error, i) => (
                    <li key={i} className="text-sm">
                      {error}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Preview */}
          {parsedData && !importResults && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-base-content">Preview</h3>
              <div className="overflow-x-auto">
                <table className="table table-sm w-full">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Provider</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.integrations.map((integration, i) => (
                      <tr key={i}>
                        <td className="font-medium">{integration.name}</td>
                        <td>
                          <span className="badge badge-outline">{integration.provider}</span>
                        </td>
                        <td className="text-base-content/60 max-w-xs truncate">
                          {integration.description || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import Results */}
          {importResults && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-semibold text-base-content">Import Results</h3>
                <span className="badge badge-success gap-1">
                  <CheckCircle size={14} />
                  {successCount} succeeded
                </span>
                {failureCount > 0 && (
                  <span className="badge badge-error gap-1">
                    <XCircle size={14} />
                    {failureCount} failed
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {importResults.map((result, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 p-3 rounded-lg ${
                      result.success ? "bg-success/10" : "bg-error/10"
                    }`}
                  >
                    {result.success ? (
                      <CheckCircle size={20} className="text-success" />
                    ) : (
                      <XCircle size={20} className="text-error" />
                    )}
                    <div className="flex-1">
                      <p className="font-medium">{result.name}</p>
                      {result.error && <p className="text-sm text-error">{result.error}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-4 border-t border-base-300">
            {importResults ? (
              <button
                type="button"
                onClick={() => navigate("/integrations")}
                className="btn btn-primary px-8"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setYamlContent("");
                    setPastedContent("");
                    setFileName(null);
                    setParsedData(null);
                    setValidationErrors([]);
                  }}
                  className="btn btn-ghost px-6"
                  disabled={!fileName && !pastedContent}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  className="btn btn-primary px-8"
                  disabled={!parsedData || isImporting}
                >
                  {isImporting ? (
                    <>
                      <span className="loading loading-spinner loading-sm"></span>
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload size={18} />
                      Import {parsedData?.integrations.length ?? 0} Integration(s)
                    </>
                  )}
                </button>
              </>
            )}
          </div>

          {/* YAML Schema Reference */}
          <div className="collapse collapse-arrow bg-base-200 rounded-lg">
            <input type="checkbox" />
            <div className="collapse-title font-semibold">YAML Schema Reference</div>
            <div className="collapse-content">
              <pre className="text-xs overflow-x-auto p-4 bg-base-300 rounded-lg mt-2">
                {`# Example YAML schema for global integrations
integrations:
  # MCP Integration with OAuth (bearer passthrough)
  - provider: mcp
    name: "GitHub MCP Server"
    description: "Access GitHub repositories via MCP"
    serverUrl: "https://mcp.github.example.com"
    transport: http
    authStrategy:
      type: bearer_passthrough
    oauthConfig:
      clientId: "your-client-id"
      clientSecret: "your-client-secret"
      authUrl: "https://github.com/login/oauth/authorize"
      tokenUrl: "https://github.com/login/oauth/access_token"
      redirectUri: "https://your-app.com/oauth/callback"
      scopes:
        - repo
        - read:user

  # MCP Integration with API Key
  - provider: mcp
    name: "Internal API"
    description: "Internal API with shared API key"
    serverUrl: "https://api.internal.example.com/mcp"
    authStrategy:
      type: api_key
      headerName: "X-API-Key"
      apiKey: "your-api-key"

  # MCP Integration with no auth
  - provider: mcp
    name: "Public MCP Server"
    description: "Public MCP server with no authentication"
    serverUrl: "https://public.mcp.example.com"
    authStrategy:
      type: none

  # OAuth2 Integration (GitHub, Gmail, etc.)
  - provider: github
    name: "GitHub OAuth"
    description: "GitHub integration for repository access"
    clientId: "your-github-client-id"
    clientSecret: "your-github-client-secret"
    authUrl: "https://github.com/login/oauth/authorize"
    tokenUrl: "https://github.com/login/oauth/access_token"
    redirectUri: "https://your-app.com/oauth/callback"
    scopes:
      - repo
      - read:user`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
