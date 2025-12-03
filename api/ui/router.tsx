import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server.js";
import { Layout } from "./components/Layout.tsx";
import { Login } from "./pages/Login.tsx";
import { McpSession } from "./pages/McpSession.tsx";
import { OAuthResult } from "./pages/OAuthResult.tsx";
import { PatSubmission } from "./pages/PatSubmission.tsx";

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

type RenderUiProps = {
  sessionId?: string;
  authProviders?: any;
  authBaseUrl?: string;
  baseUrl?: string;
  isSignUp?: boolean;
  // OAuth result props
  oauthSuccess?: boolean;
  oauthError?: string;
  oauthProvider?: string;
  // PAT submission props
  patLinkId?: string;
  patLinkInfo?: PatLinkInfo | null;
  patError?: string;
  patSuccess?: boolean;
  patInvalid?: boolean;
};

export const renderUi = (path: string, props?: RenderUiProps) => {
  // Parse the route params from the path for /mcp/:sessionId
  const sessionIdMatch = path.match(/^\/mcp\/([^/]+)$/);
  const sessionId = sessionIdMatch?.[1] || "";

  // Parse route params for /pat/:linkId
  const patLinkIdMatch = path.match(/^\/pat\/([^/]+)$/);
  const patLinkId = patLinkIdMatch?.[1] || props?.patLinkId || "";

  const isOAuthResult = path === "/oauth/result";
  const isPatSubmission = patLinkId !== "";
  const isLogin = path === "/login";
  const isMcpLogin = path === "/mcp";
  const isMcpSession = sessionId !== "";

  return renderToString(
    <StaticRouter location={path}>
      <Layout>
        {isLogin && <Login {...props} />}
        {isMcpLogin && <Login {...props} />}
        {isMcpSession && <McpSession sessionId={sessionId} baseUrl={props?.baseUrl} />}
        {isOAuthResult && (
          <OAuthResult
            success={props?.oauthSuccess ?? false}
            error={props?.oauthError}
            provider={props?.oauthProvider}
          />
        )}
        {isPatSubmission && (
          <PatSubmission
            linkId={patLinkId}
            linkInfo={props?.patLinkInfo}
            error={props?.patError}
            success={props?.patSuccess}
            invalid={props?.patInvalid}
          />
        )}
        {!isLogin && !isMcpLogin && !isMcpSession && !isOAuthResult && !isPatSubmission && (
          <div>Not Found</div>
        )}
      </Layout>
    </StaticRouter>
  );
};
