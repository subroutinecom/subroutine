import { useState } from "react";
import { useNavigate, useLoaderData } from "react-router";
import { authClient } from "~/lib/auth-client";
import { getConfig } from "~/lib/config";

export const loader = async () => {
  const config = await getConfig();
  return {
    authProviders: {
      github: { enabled: config.auth.providers.github.enabled },
      google: { enabled: config.auth.providers.google.enabled },
      emailPassword: { enabled: config.auth.providers.emailPassword.enabled },
    },
  };
};

export default function Login() {
  const { authProviders } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    await authClient.signIn.email(
      { email, password },
      {
        onRequest: () => {
          setLoading(true);
        },
        onSuccess: () => {
          navigate("/");
        },
        onError: (ctx) => {
          setLoading(false);
          setError(ctx.error.message || "Invalid credentials");
        },
      },
    );
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200">
      <div className="card w-96 bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title text-2xl font-bold text-center">Sign In</h2>

          <div className="space-y-4">
            {hasSocialProviders && (
              <div className="space-y-2">
                {authProviders.github.enabled && (
                  <button
                    type="button"
                    onClick={() => handleSocialSignIn("github")}
                    className="btn btn-outline w-full gap-2"
                    disabled={loading}
                  >
                    <img
                      src="https://cdn.simpleicons.org/github"
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
                      src="https://cdn.simpleicons.org/google"
                      alt="Google"
                      className="w-5 h-5"
                    />
                    Continue with Google
                  </button>
                )}
              </div>
            )}

            {hasSocialProviders && hasEmailPassword && (
              <div className="divider">OR</div>
            )}

            {hasEmailPassword && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Email</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="input input-bordered"
                    required
                    disabled={loading}
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Password</span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input input-bordered"
                    required
                    disabled={loading}
                  />
                </div>

                {error && (
                  <div className="alert alert-error">
                    <span>{error}</span>
                  </div>
                )}

                <div className="form-control mt-6">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="loading loading-spinner"></span>
                    ) : (
                      "Sign In"
                    )}
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
