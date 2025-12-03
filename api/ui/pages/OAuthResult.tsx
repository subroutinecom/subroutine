type OAuthResultProps = {
  success: boolean;
  error?: string;
  provider?: string;
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

export const OAuthResult = ({ success, error, provider }: OAuthResultProps) => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white px-6 py-8 shadow sm:rounded-lg text-center">
          {success ? (
            <>
              <div className="flex justify-center mb-4">
                <CheckCircleIcon />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Connection Successful!</h1>
              <p className="text-gray-600 mt-2">
                Your {provider} account has been connected successfully.
              </p>
              <p className="text-gray-600 mt-4">You can now use this integration in your tools.</p>
            </>
          ) : (
            <>
              <div className="flex justify-center mb-4">
                <XCircleIcon />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Connection Failed</h1>
              <p className="text-gray-600 mt-2">
                {error || "An unknown error occurred during authentication."}
              </p>
              <p className="text-gray-600 mt-4">Please try connecting again.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
