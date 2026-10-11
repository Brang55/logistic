import { Link } from "react-router-dom";
import { faCompass } from "@fortawesome/free-solid-svg-icons";

import { homeFor } from "../../app/roles";
import { useAuth } from "../../hooks/useAuth";
import { EmptyState } from "../ui/ui";
import { cx } from "../ui/helpers";
import ui from "../ui/ui.module.css";

const NotFound = () => {
  const { user } = useAuth();
  return (
    <div className="page">
      <EmptyState icon={faCompass} title="Page not found" text="The link may be old, or the page has moved." />
      <p style={{ textAlign: "center" }}>
        <Link to={user ? homeFor(user.role) : "/login"} className={cx(ui.btn, ui.primary)}>
          {user ? "Go to start page" : "Sign in"}
        </Link>
      </p>
    </div>
  );
};

export default NotFound;
