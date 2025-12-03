type PatLinkInfo = {
  id: string;
  integration: {
    id: string;
    name: string;
    authInstructions?: string;
    patLabel?: string;
    helpUrl?: string;
  };
  expiresAt: string;
};

type PatSubmissionProps = {
  linkId: string;
  linkInfo?: PatLinkInfo | null;
  error?: string;
  success?: boolean;
  invalid?: boolean;
};

const CheckCircleIcon = () => (
  <svg
    className="w-16 h-16 text-green-500"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const XCircleIcon = () => (
  <svg
    className="w-16 h-16 text-red-500"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const KeyIcon = () => (
  <svg
    className="w-8 h-8 text-indigo-600"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
    />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg
    className="w-3 h-3 inline ml-1"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
    />
  </svg>
);

export const PatSubmission = ({
  linkId,
  linkInfo,
  error,
  success,
  invalid,
}: PatSubmissionProps) => {
  // Invalid/expired link state
  if (invalid || !linkInfo) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12 lg:px-8 bg-gray-50">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white px-6 py-8 shadow sm:rounded-lg text-center">
            <div className="flex justify-center mb-4">
              <XCircleIcon />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Link Invalid</h1>
            <p className="text-gray-600 mt-2">{error || "This link is invalid or has expired."}</p>
            <p className="text-gray-600 mt-4">Please request a new authentication link.</p>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12 lg:px-8 bg-gray-50">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white px-6 py-8 shadow sm:rounded-lg text-center">
            <div className="flex justify-center mb-4">
              <CheckCircleIcon />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Token Saved!</h1>
            <p className="text-gray-600 mt-2">
              Your {linkInfo.integration.name} token has been saved successfully.
            </p>
            <p className="text-gray-600 mt-4">You can now close this window.</p>
          </div>
        </div>
      </div>
    );
  }

  // Form state
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white px-6 py-8 shadow sm:rounded-lg">
          <div className="flex items-center gap-3 mb-6">
            <KeyIcon />
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Connect {linkInfo.integration.name}
              </h1>
              <p className="text-sm text-gray-600">Enter your personal access token</p>
            </div>
          </div>

          {linkInfo.integration.authInstructions && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
              <p className="text-sm text-blue-800">{linkInfo.integration.authInstructions}</p>
              {linkInfo.integration.helpUrl && (
                <a
                  href={linkInfo.integration.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-indigo-600 hover:text-indigo-500 mt-2 inline-block"
                >
                  Learn more
                  <ExternalLinkIcon />
                </a>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form action={`/pat/${linkId}/submit`} method="POST">
            <div className="mb-6">
              <label htmlFor="pat" className="block text-sm font-medium text-gray-900 mb-2">
                {linkInfo.integration.patLabel || "Personal Access Token"}
              </label>
              <input
                id="pat"
                name="pat"
                type="password"
                required
                minLength={8}
                placeholder="Enter your token"
                className="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
              />
            </div>

            <button
              type="submit"
              className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Save Token
            </button>
          </form>

          <p className="text-xs text-gray-500 mt-4 text-center">
            Your token will be stored securely and used to access {linkInfo.integration.name}.
          </p>
        </div>
      </div>
    </div>
  );
};
