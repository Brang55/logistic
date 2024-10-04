import { useNavigate } from "react-router-dom";

import styles from "./BackButton.module.css";

export const BackButton = () => {
  const navigate = useNavigate();

  const handleBackClick = () => {
    navigate(-1);
  };

  return (
    <button onClick={handleBackClick} className={styles.backBtn}>
      Back
    </button>
  );
};
