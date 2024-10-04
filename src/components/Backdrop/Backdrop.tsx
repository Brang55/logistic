import styles from "./Backdrop.module.css";

interface BackdropProps {
  show: boolean;
  onClick: () => void;
}

export const Backdrop: React.FC<BackdropProps> = ({ show, onClick }) => {
  return show ? <div className={styles.overlay} onClick={onClick}></div> : null;
};
