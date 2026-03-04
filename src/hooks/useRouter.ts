import { useState, useEffect, useCallback } from "react";

export type AppRoute =
  | { mode: "live" }
  | { mode: "history"; projectId?: string; sessionId?: string }
  | { mode: "settings" }
  | { mode: "replay"; sessionId: string };

function parsePath(pathname: string): AppRoute {
  const parts = pathname.replace(/^\//, "").split("/").filter(Boolean);
  if (parts[0] === "history") {
    return {
      mode: "history",
      projectId: parts[1] ? decodeURIComponent(parts[1]) : undefined,
      sessionId: parts[2] ? decodeURIComponent(parts[2]) : undefined,
    };
  }
  if (parts[0] === "settings") return { mode: "settings" };
  if (parts[0] === "replay" && parts[1]) {
    return { mode: "replay", sessionId: decodeURIComponent(parts[1]) };
  }
  return { mode: "live" };
}

function routeToPath(route: AppRoute): string {
  if (route.mode === "settings") return "/settings";
  if (route.mode === "live") return "/";
  if (route.mode === "replay") return `/replay/${encodeURIComponent(route.sessionId)}`;
  if (!route.projectId) return "/history";
  if (!route.sessionId) return `/history/${encodeURIComponent(route.projectId)}`;
  return `/history/${encodeURIComponent(route.projectId)}/${encodeURIComponent(route.sessionId)}`;
}

export function useRouter() {
  const [route, setRoute] = useState<AppRoute>(() => parsePath(window.location.pathname));

  useEffect(() => {
    const handler = () => setRoute(parsePath(window.location.pathname));
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const navigate = useCallback((newRoute: AppRoute) => {
    const path = routeToPath(newRoute);
    // Skip if already at this URL (e.g. auto-selection restoring from back/forward)
    if (path === window.location.pathname) return;
    window.history.pushState(null, "", path);
    setRoute(newRoute);
  }, []);

  return { route, navigate };
}
