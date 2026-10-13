import { Component } from "react";

// Catches errors thrown while rendering and shows a friendly screen
// instead of a blank page.
class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("The app crashed:", error, info.componentStack);
  }

  handleReset = () => {
    try {
      Object.keys(window.localStorage)
        .filter((key) => key.startsWith("hirara:"))
        .forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // Storage blocked: reloading is still worth trying
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="crash" role="alert">
        <div className="crash__card">
          <h1 className="crash__title">Something went wrong</h1>
          <p className="crash__text">
            The page hit an unexpected error. Reloading usually fixes it. If
            it keeps happening, reset the demo data, which signs you out and
            restores the sample data.
          </p>
          <div className="crash__actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={this.handleReset}
            >
              Reset demo data
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;