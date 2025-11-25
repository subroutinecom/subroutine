import { Hono } from "hono";
import { renderUi } from "./router.tsx";

export const registerUiRoutes = (app: Hono<any>) => {
  app.get("/login", (c) => {
    const html = renderUi("/login");
    return c.html("<!DOCTYPE html>" + html);
  });
};
