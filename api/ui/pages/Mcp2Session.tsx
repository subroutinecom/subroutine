export const Mcp2Session = ({ sessionId }: { sessionId: string }) => {
  const handleLogout = () => {
    // This will be handled by better-auth
    globalThis.location.href = "/api/auth/sign-out";
  };

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 py-12 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white px-6 py-8 shadow sm:rounded-lg">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">MCP2 Session Active</h2>
            <p className="text-sm text-gray-600">
              Your session is ready for MCP client connections
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                Session ID
              </label>
              <code className="block bg-white px-3 py-2 rounded border border-gray-300 text-sm font-mono text-gray-900 break-all">
                {sessionId}
              </code>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-2">
                Connection Instructions
              </label>
              <div className="text-sm text-gray-700 space-y-2">
                <p>Connect your MCP client to:</p>
                <code className="block bg-white px-3 py-2 rounded border border-gray-300 font-mono text-xs break-all">
                  {globalThis.location.origin}/mcp2/{sessionId}
                </code>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex justify-center rounded-md bg-gray-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600"
            >
              Sign Out
            </button>
            <a
              href="/mcp2"
              className="w-full flex justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Create New Session
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
