import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRightFromBracket } from "@fortawesome/free-solid-svg-icons";
import { useAuth } from "../../../hooks/useAuth";

import styles from "./LogoutButton.module.css";

const LogoutButton = () => {
  const { logoutUser } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logoutUser();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  return (
    <button onClick={handleLogout} className={styles.logoutButton} title="Log out" aria-label="Log out">
      <FontAwesomeIcon icon={faRightFromBracket} />
    </button>
  );
};

export default LogoutButton;
