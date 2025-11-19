import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { gql } from "graphql-request";
import { graphqlClient } from "~/lib/graphql-client";
import { PageHeader } from "~/components/ui/PageHeader";
import { Key, ArrowLeft, Copy, CheckCircle2, Eye, EyeOff } from "lucide-react";

const CREATE_API_KEY_MUTATION = gql`
  mutation CreateApiKey($name: String, $prefix: String, $metadata: String) {
    createApiKey(name: $name, prefix: $prefix, metadata: $metadata) {
      id
      key
      name
      prefix
      start
      createdAt
    }
  }
`;

interface CreatedApiKey {
  id: string;
  key: string;
  name?: string | null;
  prefix?: string | null;
  start?: string | null;
  createdAt: string;
}

interface ApiKeyFormData {
  name: string;
}

export default function NewApiKeyPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [showKey, setShowKey] = useState(true);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ApiKeyFormData>({
    defaultValues: {
      name: "",
    },
  });

  const onSubmit = async (data: ApiKeyFormData) => {
    try {
      setError(null);

      const result = await graphqlClient.request<{
        createApiKey: CreatedApiKey;
      }>(CREATE_API_KEY_MUTATION, {
        name: data.name || null,
        prefix: null,
        metadata: null,
      });

      setCreatedKey(result.createApiKey);
    } catch (err) {
      console.error("Failed to create API key:", err);
      setError(
        err instanceof Error ? err.message : "Failed to create API key"
      );
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleDone = () => {
    navigate("/api-keys");
  };

  if (createdKey) {
    return (
      <div className="container mx-auto p-6 max-w-3xl">
        <PageHeader
          title="API Key Created"
          description="Your API key has been successfully generated."
        />

        <div className="alert alert-success mt-6">
          <CheckCircle2 size={24} />
          <div>
            <h3 className="font-bold">Success!</h3>
            <div className="text-sm">
              Your API key has been created. Make sure to copy it now as you won't be able to see it again.
            </div>
          </div>
        </div>

        <div className="card bg-base-100 border border-base-300 mt-6">
          <div className="card-body">
            <h2 className="card-title text-lg mb-4">API Key Details</h2>

            <div className="space-y-4">
              <div>
                <label className="label">
                  <span className="label-text font-semibold">Name</span>
                </label>
                <div className="text-base-content/70">
                  {createdKey.name || "Unnamed Key"}
                </div>
              </div>

              <div>
                <label className="label">
                  <span className="label-text font-semibold">API Key</span>
                </label>
                <div className="join w-full">
                  <div className="input input-bordered join-item flex-1 flex items-center font-mono text-sm overflow-x-auto">
                    {showKey ? createdKey.key : "•".repeat(64)}
                  </div>
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="btn join-item"
                    title={showKey ? "Hide key" : "Show key"}
                  >
                    {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                  <button
                    onClick={() => handleCopy(createdKey.key)}
                    className="btn join-item btn-primary"
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 size={18} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={18} />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <label className="label">
                  <span className="label-text-alt text-warning">
                    This is the only time you'll see the full key. Make sure to copy it now.
                  </span>
                </label>
              </div>

              <div>
                <label className="label">
                  <span className="label-text font-semibold">Created</span>
                </label>
                <div className="text-base-content/70">
                  {new Date(createdKey.createdAt).toLocaleString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>

            <div className="card-actions justify-end mt-6">
              <button onClick={handleDone} className="btn btn-primary">
                Done
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-warning/10 border border-warning/20 rounded-lg">
          <p className="text-sm text-base-content/70">
            <strong>Security Note:</strong> Store this API key securely. It provides full access to your account's
            resources. Never share it publicly or commit it to version control.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <PageHeader
        title="Create API Key"
        description="Generate a new API key for programmatic access to your integrations and workflows."
        action={
          <Link to="/api-keys" className="btn btn-ghost gap-2">
            <ArrowLeft size={18} />
            Back
          </Link>
        }
      />

      {error && (
        <div className="alert alert-error mt-6">
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6">
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body">
            <h2 className="card-title text-lg mb-4">API Key Configuration</h2>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text font-semibold">
                  Name <span className="text-error">*</span>
                </span>
              </label>
              <input
                type="text"
                placeholder="e.g., Production API Key"
                className={`input input-bordered w-full ${
                  errors.name ? "input-error" : ""
                }`}
                {...register("name", {
                  required: "Name is required",
                  minLength: {
                    value: 3,
                    message: "Name must be at least 3 characters",
                  },
                })}
              />
              {errors.name && (
                <label className="label">
                  <span className="label-text-alt text-error">
                    {errors.name.message}
                  </span>
                </label>
              )}
              <label className="label">
                <span className="label-text-alt">
                  A descriptive name to help you identify this key.
                </span>
              </label>
            </div>

            <div className="divider"></div>

            <div className="card-actions justify-end">
              <Link to="/api-keys" className="btn btn-ghost">
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn btn-primary gap-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Creating...
                  </>
                ) : (
                  <>
                    <Key size={18} />
                    Create API Key
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>

      <div className="mt-6 p-4 bg-info/10 border border-info/20 rounded-lg">
        <h3 className="font-semibold mb-2 flex items-center gap-2">
          <Key size={16} />
          About API Keys
        </h3>
        <ul className="text-sm text-base-content/70 space-y-1 list-disc list-inside">
          <li>API keys provide programmatic access to your integrations and workflows</li>
          <li>The full key is only shown once during creation</li>
          <li>You can revoke keys at any time from the API Keys list</li>
          <li>Keep your keys secure and never share them publicly</li>
        </ul>
      </div>
    </div>
  );
}
