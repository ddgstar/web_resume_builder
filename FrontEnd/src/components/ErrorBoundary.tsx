import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  override render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="fatal-error">
        <h1>Something went wrong</h1>
        <p>{this.state.message || "The interface hit an unexpected error."}</p>
        <button onClick={() => window.location.reload()}>Reload App</button>
      </div>
    );
  }
}
