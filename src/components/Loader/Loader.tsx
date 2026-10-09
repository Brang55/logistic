import { RotatingLines } from "react-loader-spinner";

import styles from "./Loader.module.css";
import { theme } from "../../theme";

export const Loader = () => {
  return (
    <div className={styles.loader}>
      <RotatingLines
        strokeColor={theme.primary}
        strokeWidth="5"
        animationDuration="0.75"
        width="96"
        visible={true}
      />
    </div>
  );
};
