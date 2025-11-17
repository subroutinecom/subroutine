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
    <div className="min-h-screen bg-base-200 p-4">
      <div className="max-w-md mx-auto pt-20">
        {/* Brand */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-base-content mb-2">
            subroutine
          </h1>
          <p className="text-base text-base-content/60">
            {isSignUp ? "Create your account" : "Sign in to continue"}
          </p>
        </div>

        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            {showSocialLogins && (
              <div className="space-y-3">
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
                    <span>Continue with GitHub</span>
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
                    <span>Continue with Google</span>
                  </button>
                )}
              </div>
            )}

            {showSocialLogins && hasEmailPassword && (
              <div className="divider">OR</div>
            )}

            {hasEmailPassword && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="form-control">
                  <label htmlFor="email" className="label">
                    <span className="label-text font-medium">Email</span>
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="input input-bordered w-full"
                    required
                    disabled={loading}
                  />
                </div>

                <div className="form-control">
                  <label htmlFor="password" className="label">
                    <span className="label-text font-medium">Password</span>
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
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
                    "Create Account"
                  ) : (
                    "Sign In"
                  )}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(!isSignUp);
                      setError("");
                    }}
                    className="link link-hover"
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
    </div>
  );
}
