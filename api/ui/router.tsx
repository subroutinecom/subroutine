import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server.js";
import { Layout } from "./components/Layout.tsx";
import { Login } from "./pages/Login.tsx";
import { Mcp2Session } from "./pages/Mcp2Session.tsx";

export const renderUi = (
  path: string,
  props?: { sessionId?: string; authProviders?: any; authBaseUrl?: string }
) => {
  // Parse the route params from the path for /mcp2/:sessionId
  const sessionIdMatch = path.match(/^\/mcp2\/([^/]+)$/);
  const sessionId = sessionIdMatch?.[1] || "";

  return renderToString(
    <StaticRouter location={path}>
      <Layout>
        {path === "/login" && <Login {...props} />}
        {path === "/mcp2" && <Login {...props} />}
        {sessionId && <Mcp2Session sessionId={sessionId} />}
        {!path.startsWith("/login") && !path.startsWith("/mcp2") && <div>Not Found</div>}
      </Layout>
    </StaticRouter>
  );
};
