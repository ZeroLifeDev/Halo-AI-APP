import React from "react";

type State = { error: Error | null };

/**
 * Without this, any render-time exception unmounts the whole tree and the user
 * just sees a black screen that looks like a crash. This shows what went wrong
 * and offers a way back.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Shows up in `adb logcat -s chromium` for diagnosis.
    console.error("Halo Guard crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#0a0e14",
          color: "#eceff7",
          padding: "calc(env(safe-area-inset-top, 0px) + 32px) 26px 32px",
          fontFamily: "Inter, system-ui, sans-serif",
          overflowY: "auto",
        }}
      >
        <div style={{ fontSize: 21, fontWeight: 700, marginBottom: 10 }}>Something went wrong</div>
        <div style={{ color: "#9aa5bd", fontSize: 14.5, lineHeight: 1.6, marginBottom: 22 }}>
          Halo Guard hit an unexpected problem. Restarting usually fixes it — your account and
          settings are safe.
        </div>

        <button
          onClick={() => window.location.reload()}
          style={{
            width: "100%",
            padding: "15px 18px",
            borderRadius: 14,
            border: "none",
            background: "linear-gradient(90deg,#2dd4bf,#7dd3c0)",
            color: "#0a0e14",
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Restart the app
        </button>

        <details style={{ marginTop: 26 }}>
          <summary style={{ color: "#5c6884", fontSize: 12.5, cursor: "pointer" }}>
            Technical details
          </summary>
          <pre
            style={{
              marginTop: 10,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              lineHeight: 1.6,
              color: "#9aa5bd",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
        </details>
      </div>
    );
  }
}
