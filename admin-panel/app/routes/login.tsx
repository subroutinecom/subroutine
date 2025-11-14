import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { authClient } from "../lib/auth-client";
import { useAuth } from "~/components/providers/AuthProvider";

export default function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, refetch } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  // TODO: use config file for this.
  const authProviders = {
    github: { enabled: true },
    google: { enabled: true },
    emailPassword: { enabled: true },
  };

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate("/");
    }
  }, [authLoading, isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (isSignUp) {
      await authClient.signUp.email(
        { email, password, name: email },
        {
          onRequest: () => {
            setLoading(true);
          },
          onSuccess: async () => {
            await refetch();
            navigate("/");
          },
          onError: (ctx) => {
            setLoading(false);
            setError(ctx.error.message || "Sign up failed");
          },
        },
      );
    } else {
      await authClient.signIn.email(
        { email, password },
        {
          onRequest: () => {
            setLoading(true);
          },
          onSuccess: async () => {
            await refetch();
            navigate("/");
          },
          onError: (ctx) => {
            setLoading(false);
            setError(ctx.error.message || "Invalid credentials");
          },
        },
      );
    }
  };

  const handleSocialSignIn = async (provider: "github" | "google") => {
    await authClient.signIn.social(
      { provider, callbackURL: "/" },
      {
        onError: (ctx) => {
          setError(ctx.error.message || `Failed to sign in with ${provider}`);
        },
      },
    );
  };

  const hasSocialProviders =
    authProviders.github.enabled || authProviders.google.enabled;
  const hasEmailPassword = authProviders.emailPassword.enabled;
  const showSocialLogins = !isSignUp && hasSocialProviders;

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200">
      <div className="card w-96 bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title text-2xl mb-4">
            {isSignUp ? "Sign Up" : "Sign In"}
          </h2>

          {showSocialLogins && (
            <div className="space-y-2 mb-4">
              {authProviders.github.enabled && (
                <button
                  type="button"
                  onClick={() => handleSocialSignIn("github")}
                  className="btn btn-outline w-full gap-2"
                  disabled={loading}
                >
                  <img
                    src="/icons/github.svg"
                    alt="GitHub"
                    className="w-5 h-5"
                  />
                  Continue with GitHub
                </button>
              )}
              {authProviders.google.enabled && (
                <button
                  type="button"
                  onClick={() => handleSocialSignIn("google")}
                  className="btn btn-outline w-full gap-2"
                  disabled={loading}
                >
                  <img
                    src="/icons/google.svg"
                    alt="Google"
                    className="w-5 h-5"
                  />
                  Continue with Google
                </button>
              )}
            </div>
          )}

          {showSocialLogins && hasEmailPassword && (
            <div className="divider">OR</div>
          )}

          {hasEmailPassword && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input input-bordered w-full"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input input-bordered w-full"
                  required
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="alert alert-error">
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={loading}
              >
                {loading ? (
                  <span className="loading loading-spinner"></span>
                ) : isSignUp ? (
                  "Sign Up"
                ) : (
                  "Sign In"
                )}
              </button>

              <div className="text-center text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setError("");
                  }}
                  className="link link-primary"
                  disabled={loading}
                >
                  {isSignUp
                    ? "Already have an account? Sign in"
                    : "Don't have an account? Sign up"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
