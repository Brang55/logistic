import { useAuth } from "../../../hooks/useAuth";

import styles from "./LogoutButton.module.css";

const LogoutButton = () => {
  const { logoutUser } = useAuth();

  const handleLogout = async () => {
    try {
      await logoutUser();
      console.log("User logged out successfully");
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  return (
    <button onClick={handleLogout} className={styles.logoutButton}>
      Logout
    </button>
  );
};

export default LogoutButton;
