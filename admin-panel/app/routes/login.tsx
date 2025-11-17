import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { authClient } from "../lib/auth-client";
import { useAuth } from "~/components/providers/AuthProvider";

type LoginFormData = {
  email: string;
  password: string;
};

export default function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, refetch } = useAuth();
  const [authError, setAuthError] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<LoginFormData>();

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

  const onSubmit = async (data: LoginFormData) => {
    setAuthError("");

    if (isSignUp) {
      await authClient.signUp.email(
        { email: data.email, password: data.password, name: data.email },
        {
          onSuccess: async () => {
            await refetch();
            navigate("/");
          },
          onError: (ctx) => {
            setAuthError(ctx.error.message || "Sign up failed");
          },
        },
      );
    } else {
      await authClient.signIn.email(
        { email: data.email, password: data.password },
        {
          onSuccess: async () => {
            await refetch();
            navigate("/");
          },
          onError: (ctx) => {
            setAuthError(ctx.error.message || "Invalid credentials");
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
          setAuthError(ctx.error.message || `Failed to sign in with ${provider}`);
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
                    disabled={isSubmitting}
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
                    disabled={isSubmitting}
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
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="form-control">
                  <label htmlFor="email" className="label">
                    <span className="label-text font-medium">Email</span>
                  </label>
                  <input
                    id="email"
                    type="email"
                    {...register("email", { required: "Email is required" })}
                    placeholder="you@example.com"
                    className="input input-bordered w-full"
                    disabled={isSubmitting}
                  />
                  {errors.email && (
                    <label className="label">
                      <span className="label-text-alt text-error">
                        {errors.email.message}
                      </span>
                    </label>
                  )}
                </div>

                <div className="form-control">
                  <label htmlFor="password" className="label">
                    <span className="label-text font-medium">Password</span>
                  </label>
                  <input
                    id="password"
                    type="password"
                    {...register("password", {
                      required: "Password is required",
                    })}
                    placeholder="Enter your password"
                    className="input input-bordered w-full"
                    disabled={isSubmitting}
                  />
                  {errors.password && (
                    <label className="label">
                      <span className="label-text-alt text-error">
                        {errors.password.message}
                      </span>
                    </label>
                  )}
                </div>

                {authError && (
                  <div className="alert alert-error">
                    <span>{authError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="btn btn-primary w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
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
                      setAuthError("");
                      reset();
                    }}
                    className="link link-hover"
                    disabled={isSubmitting}
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
