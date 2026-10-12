import { Component, ReactNode } from "react";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

import { EmptyState } from "../ui/ui";
import { cx } from "../ui/helpers";
import ui from "../ui/ui.module.css";

interface State {
  failed: boolean;
}

/**
 * Catches a page that fails to load or render. Most often after a deploy: an open tab asks for
 * page files that no longer exist, and reloading picks up the new version.
 */
export class PageErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidUpdate(previous: { resetKey: string }) {
    // Navigating elsewhere gives the next page a fresh chance.
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page">
        <EmptyState
          icon={faTriangleExclamation}
          title="This page couldn't be loaded"
          text="The app may have been updated. Reload to get the latest version."
        />
        <p style={{ textAlign: "center" }}>
          <button className={cx(ui.btn, ui.primary)} onClick={() => window.location.reload()}>
            Reload
          </button>
        </p>
      </div>
    );
  }
}
