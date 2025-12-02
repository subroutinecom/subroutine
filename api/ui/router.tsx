import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server.js";
import { Layout } from "./components/Layout.tsx";
import { Login } from "./pages/Login.tsx";
import { McpSession } from "./pages/McpSession.tsx";

export const renderUi = (
  path: string,
  props?: {
    sessionId?: string;
    authProviders?: any;
    authBaseUrl?: string;
    baseUrl?: string;
    isSignUp?: boolean;
  }
) => {
  // Parse the route params from the path for /mcp/:sessionId
  const sessionIdMatch = path.match(/^\/mcp\/([^/]+)$/);
  const sessionId = sessionIdMatch?.[1] || "";

  return renderToString(
    <StaticRouter location={path}>
      <Layout>
        {path === "/login" && <Login {...props} />}
        {path === "/mcp" && <Login {...props} />}
        {sessionId && <McpSession sessionId={sessionId} baseUrl={props?.baseUrl} />}
        {!path.startsWith("/login") && !path.startsWith("/mcp") && <div>Not Found</div>}
      </Layout>
    </StaticRouter>
  );
};
