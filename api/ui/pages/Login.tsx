type LoginProps = {
  authProviders?: {
    github?: { enabled: boolean };
    google?: { enabled: boolean };
    emailPassword?: { enabled: boolean };
  };
  authBaseUrl?: string;
  isSignUp?: boolean; // Passed from server based on URL params
  callbackURL?: string; // Optional callback URL from query params
};

export const Login = ({ authProviders, authBaseUrl, isSignUp = false, callbackURL }: LoginProps) => {
  // Default to email/password if no providers specified
  const providers = authProviders || { emailPassword: { enabled: true } };
  const baseUrl = authBaseUrl || "";
  // Default to /mcp if no callback URL provided
  const callback = callbackURL || "/mcp";

  const hasSocialProviders = providers.github?.enabled || providers.google?.enabled;
  const hasEmailPassword = providers.emailPassword?.enabled;
  const showSocialLogins = !isSignUp && hasSocialProviders;

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 py-12 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 mb-2">
          subroutine
        </h2>
        <p className="text-center text-sm text-gray-600">
          {isSignUp ? "Create your account" : "Sign in to continue"}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-sm">
        <div className="bg-white px-6 py-8 shadow sm:rounded-lg">
          {showSocialLogins && (
            <div className="space-y-3">
              {providers.github?.enabled && (
                <form action={`${baseUrl}/api/auth/sign-in/social`} method="POST">
                  <input type="hidden" name="provider" value="github" />
                  <input type="hidden" name="callbackURL" value={callback} />
                  <button
                    type="submit"
                    className="flex w-full items-center justify-center gap-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-gray-600"
                  >
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    Continue with GitHub
                  </button>
                </form>
              )}
              {providers.google?.enabled && (
                <form action={`${baseUrl}/api/auth/sign-in/social`} method="POST">
                  <input type="hidden" name="provider" value="google" />
                  <input type="hidden" name="callbackURL" value={callback} />
                  <button
                    type="submit"
                    className="flex w-full items-center justify-center gap-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-gray-600"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Continue with Google
                  </button>
                </form>
              )}
            </div>
          )}

          {showSocialLogins && hasEmailPassword && (
            <div className="relative mt-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-gray-500">OR</span>
              </div>
            </div>
          )}

          {hasEmailPassword && (
            <form
              action={
                isSignUp
                  ? `/api/auth/sign-up/email?callbackURL=${encodeURIComponent(callback)}`
                  : `/api/auth/sign-in/email?callbackURL=${encodeURIComponent(callback)}`
              }
              method="POST"
              className={showSocialLogins ? "mt-6 space-y-4" : "space-y-4"}
            >
              {isSignUp && <input type="hidden" name="name" value="" id="name-hidden" />}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-900">
                  Email
                </label>
                <div className="mt-2">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-900">
                  Password
                </label>
                <div className="mt-2">
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                {isSignUp ? "Create Account" : "Sign In"}
              </button>

              <div className="divider my-4"></div>

              <div className="text-center">
                <a
                  href={isSignUp ? "/mcp" : "/mcp?mode=signup"}
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 underline"
                >
                  {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
                </a>
              </div>

              {isSignUp && (
                <script
                  dangerouslySetInnerHTML={{
                    __html: `
                      document.getElementById('email').addEventListener('input', function(e) {
                        document.getElementById('name-hidden').value = e.target.value;
                      });
                    `,
                  }}
                />
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
