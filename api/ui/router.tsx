import { renderToString } from "react-dom/server";
import { Route, Routes } from "react-router-dom";
import { StaticRouter } from "react-router-dom/server.js";
import { Layout } from "./components/Layout.tsx";
import { Login } from "./pages/Login.tsx";

const SafeRoutes = Routes as any;
const SafeRoute = Route as any;

const UiRoutes = () => {
  return (
    <SafeRoutes>
      <SafeRoute path="/login" element={<Login />} />
      <SafeRoute path="*" element={<div>Not Found</div>} />
    </SafeRoutes>
  );
};

export const renderUi = (path: string) => {
  return renderToString(
    <StaticRouter location={path}>
      <Layout>
        <UiRoutes />
      </Layout>
    </StaticRouter>
  );
};
