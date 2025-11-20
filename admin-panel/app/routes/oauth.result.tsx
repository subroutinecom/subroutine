import { useSearchParams } from "react-router";
import { CheckCircle, XCircle } from "lucide-react";

export default function OAuthResult() {
  const [searchParams] = useSearchParams();

  const success = searchParams.get("success") === "true";
  const error = searchParams.get("error");
  const provider = searchParams.get("provider");

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200">
      <div className="card w-full max-w-md bg-base-100 shadow-xl">
        <div className="card-body items-center text-center">
          {success ? (
            <>
              <CheckCircle className="w-16 h-16 text-success mb-4" />
              <h1 className="card-title text-2xl">Connection Successful!</h1>
              <p className="text-base-content/70 mt-2">
                Your {provider} account has been connected successfully.
              </p>
              <p className="text-base-content/70 mt-4">
                You can now use this integration in your tools.
              </p>
            </>
          ) : (
            <>
              <XCircle className="w-16 h-16 text-error mb-4" />
              <h1 className="card-title text-2xl">Connection Failed</h1>
              <p className="text-base-content/70 mt-2">
                {error || "An unknown error occurred during authentication."}
              </p>
              <p className="text-base-content/70 mt-4">Please try connecting again.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
