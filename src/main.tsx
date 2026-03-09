import { StrictMode, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[NEURAL LINK] Fatal render error:", error, info);
  }

  override render() {
    if (this.state.error) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            color: "#ff0040",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "13px",
            letterSpacing: "2px",
            gap: "16px",
            padding: "32px",
            textAlign: "center",
          }}
        >
          <div style={{ color: "#ff0040", fontSize: "16px" }}>NEURAL LINK ERROR</div>
          <div style={{ color: "#8892a8", maxWidth: "600px", wordBreak: "break-word" }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: "16px",
              padding: "8px 24px",
              background: "transparent",
              border: "1px solid #ff0040",
              color: "#ff0040",
              fontFamily: "inherit",
              fontSize: "12px",
              letterSpacing: "2px",
              cursor: "pointer",
            }}
          >
            REINITIALIZE
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
