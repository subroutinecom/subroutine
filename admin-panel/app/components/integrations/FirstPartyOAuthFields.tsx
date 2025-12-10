import { useState } from "react";
import { Copy, Check, ExternalLink, AlertCircle } from "lucide-react";
import type { UseFormRegister, FieldErrors } from "react-hook-form";

// deno-lint-ignore no-explicit-any
type AnyFormRegister = UseFormRegister<any>;
// deno-lint-ignore no-explicit-any
type AnyFormErrors = FieldErrors<any>;

interface FirstPartyOAuthFieldsProps {
  register: AnyFormRegister;
  errors: AnyFormErrors;
  providerName: string;
  redirectUri: string;
  prefilledScopes?: string;
  developerConsoleUrl?: string;
  setupInstructions?: string[];
}

export const FirstPartyOAuthFields = ({
  register,
  errors,
  providerName,
  redirectUri,
  prefilledScopes,
  developerConsoleUrl,
  setupInstructions,
}: FirstPartyOAuthFieldsProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopyRedirectUri = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement("textarea");
      textArea.value = redirectUri;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const inputClasses = `
    w-full px-4 py-3 rounded-lg
    bg-base-200/50 border-2 border-base-300/50
    text-base-content placeholder:text-base-content/30
    focus:outline-none focus:border-primary/50 focus:bg-base-200/70
    transition-all duration-200
  `;

  return (
    <div className="space-y-6">
      {/* Important Setup Notice */}
      <div className="rounded-xl border-2 border-warning/30 bg-warning/5 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="text-warning flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-base-content">
              OAuth App Required
            </p>
            <p className="text-sm text-base-content/70">
              To connect {providerName}, you need to create an OAuth app in {providerName}'s developer console
              and provide your credentials below.
            </p>
          </div>
        </div>
      </div>

      {/* Step 1: Redirect URI */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
            1
          </span>
          <label className="text-sm font-medium text-base-content">
            Configure Redirect URI in {providerName}
          </label>
        </div>

        <p className="text-sm text-base-content/60 ml-8">
          Add this URL as an allowed redirect/callback URI in your {providerName} OAuth app settings:
        </p>

        <div className="ml-8 flex items-center gap-2">
          <div className="flex-1 px-4 py-3 rounded-lg bg-base-200 border-2 border-base-300/50 font-mono text-sm text-base-content break-all">
            {redirectUri}
          </div>
          <button
            type="button"
            onClick={handleCopyRedirectUri}
            className={`
              p-3 rounded-lg transition-all duration-200 flex-shrink-0
              ${copied
                ? "bg-success/10 text-success border-2 border-success/30"
                : "bg-base-200 hover:bg-base-300 border-2 border-base-300/50 text-base-content/70 hover:text-base-content"
              }
            `}
            title={copied ? "Copied!" : "Copy to clipboard"}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
        </div>
      </div>

      {/* Step 2: Get Credentials */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
            2
          </span>
          <label className="text-sm font-medium text-base-content">
            Enter Your OAuth Credentials
          </label>
        </div>

        {developerConsoleUrl && (
          <a
            href={developerConsoleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-8 inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
          >
            Open {providerName} Developer Console
            <ExternalLink size={14} />
          </a>
        )}

        <div className="ml-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="oauthClientId" className="text-sm font-medium text-base-content/70">
              Client ID <span className="text-error">*</span>
            </label>
            <input
              id="oauthClientId"
              type="text"
              {...register("oauthClientId", { required: "Client ID is required" })}
              placeholder="Your OAuth Client ID"
              className={inputClasses}
            />
            {errors.oauthClientId && (
              <p className="text-sm text-error">{String(errors.oauthClientId.message)}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="oauthClientSecret" className="text-sm font-medium text-base-content/70">
              Client Secret <span className="text-error">*</span>
            </label>
            <input
              id="oauthClientSecret"
              type="password"
              {...register("oauthClientSecret", { required: "Client Secret is required" })}
              placeholder="Your OAuth Client Secret"
              className={inputClasses}
            />
            {errors.oauthClientSecret && (
              <p className="text-sm text-error">{String(errors.oauthClientSecret.message)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Scopes (pre-filled) */}
      <div className="space-y-2 ml-8">
        <label htmlFor="oauthScopes" className="text-sm font-medium text-base-content/70">
          Scopes
          <span className="ml-2 text-xs font-normal text-base-content/40">
            pre-configured for {providerName}
          </span>
        </label>
        <input
          id="oauthScopes"
          type="text"
          {...register("oauthScopes")}
          defaultValue={prefilledScopes}
          placeholder="read write (space-separated)"
          className={inputClasses}
        />
        <p className="text-xs text-base-content/50">
          These scopes determine what permissions users grant when connecting. Modify only if needed.
        </p>
      </div>

      {/* Additional Instructions */}
      {setupInstructions && setupInstructions.length > 0 && (
        <div className="ml-8 p-4 rounded-lg bg-base-200/30 border border-base-300/30 space-y-2">
          <p className="text-xs font-medium text-base-content/60 uppercase tracking-wider">
            Additional Setup Notes
          </p>
          <ul className="text-sm text-base-content/70 space-y-1">
            {setupInstructions.map((instruction, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-base-content/40">•</span>
                {instruction}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
