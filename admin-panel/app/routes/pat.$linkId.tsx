import { CheckCircle, ExternalLink, Key, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useParams } from "react-router";
import { useAdminConfig } from "../hooks/use-admin-config.ts";

interface PatLinkInfo {
  id: string;
  integration: {
    id: string;
    name: string;
    authInstructions?: string;
    patLabel?: string;
    helpUrl?: string;
  };
  expiresAt: string;
}

interface FormData {
  pat: string;
}

type PageState = "loading" | "ready" | "submitting" | "success" | "error";

export default function PatSubmissionPage() {
  const { linkId } = useParams();
  const { apiUrl } = useAdminConfig();
  const [state, setState] = useState<PageState>("loading");
  const [linkInfo, setLinkInfo] = useState<PatLinkInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>();

  useEffect(() => {
    const fetchLinkInfo = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/pat-link/${linkId}`);
        const data = await response.json();

        if (!response.ok) {
          setError(data.error?.message || "This link is invalid or has expired.");
          setState("error");
          return;
        }

        setLinkInfo(data);
        setState("ready");
      } catch {
        setError("Failed to load link information. Please try again.");
        setState("error");
      }
    };

    if (linkId) {
      fetchLinkInfo();
    }
  }, [linkId]);

  const onSubmit = async (data: FormData) => {
    setState("submitting");

    try {
      const response = await fetch(`${apiUrl}/api/pat-link/${linkId}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pat: data.pat }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error?.message || "Failed to save token. Please try again.");
        setState("ready");
        return;
      }

      setState("success");
    } catch {
      setError("Failed to submit token. Please check your connection and try again.");
      setState("ready");
    }
  };

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <div className="card w-full max-w-md bg-base-100 shadow-xl">
          <div className="card-body items-center text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
            <p className="text-base-content/70">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (state === "error" && !linkInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <div className="card w-full max-w-md bg-base-100 shadow-xl">
          <div className="card-body items-center text-center">
            <XCircle className="w-16 h-16 text-error mb-4" />
            <h1 className="card-title text-2xl">Link Invalid</h1>
            <p className="text-base-content/70 mt-2">
              {error || "This link is invalid or has expired."}
            </p>
            <p className="text-base-content/70 mt-4">Please request a new authentication link.</p>
          </div>
        </div>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <div className="card w-full max-w-md bg-base-100 shadow-xl">
          <div className="card-body items-center text-center">
            <CheckCircle className="w-16 h-16 text-success mb-4" />
            <h1 className="card-title text-2xl">Token Saved!</h1>
            <p className="text-base-content/70 mt-2">
              Your {linkInfo?.integration.name} token has been saved successfully.
            </p>
            <p className="text-base-content/70 mt-4">You can now close this window.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200 p-4">
      <div className="card w-full max-w-md bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="flex items-center gap-3 mb-4">
            <Key className="w-8 h-8 text-primary" />
            <div>
              <h1 className="card-title text-xl">Connect {linkInfo?.integration.name}</h1>
              <p className="text-sm text-base-content/70">Enter your personal access token</p>
            </div>
          </div>

          {linkInfo?.integration.authInstructions && (
            <div className="alert mb-4">
              <div>
                <p className="text-sm">{linkInfo.integration.authInstructions}</p>
                {linkInfo.integration.helpUrl && (
                  <a
                    href={linkInfo.integration.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-2"
                  >
                    Learn more <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="alert alert-error mb-4">
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">
                  {linkInfo?.integration.patLabel || "Personal Access Token"}
                </span>
              </label>
              <input
                type="password"
                placeholder="Enter your token"
                className={`input input-bordered w-full ${errors.pat ? "input-error" : ""}`}
                {...register("pat", {
                  required: "Token is required",
                  minLength: {
                    value: 8,
                    message: "Token must be at least 8 characters",
                  },
                })}
                disabled={state === "submitting"}
              />
              {errors.pat && (
                <label className="label">
                  <span className="label-text-alt text-error">{errors.pat.message}</span>
                </label>
              )}
            </div>

            <div className="card-actions justify-end mt-6">
              <button type="submit" className="btn btn-primary" disabled={state === "submitting"}>
                {state === "submitting" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Token"
                )}
              </button>
            </div>
          </form>

          <p className="text-xs text-base-content/50 mt-4 text-center">
            Your token will be stored securely and used to access {linkInfo?.integration.name}.
          </p>
        </div>
      </div>
    </div>
  );
}
