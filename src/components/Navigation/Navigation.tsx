import logo from "../../assets/images/logo.png";
import LogoutButton from "../Account/LogoutButton/LogoutButton";

import styles from "./Navigation.module.css";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
// import { faGauge } from "@fortawesome/free-solid-svg-icons";
// import { faTruckMoving } from "@fortawesome/free-solid-svg-icons";
// import { faPerson } from "@fortawesome/free-solid-svg-icons";
import { NavLink } from "react-router-dom";
// import { faTruckFront } from "@fortawesome/free-solid-svg-icons/faTruckFront";
// import { faTrailer } from "@fortawesome/free-solid-svg-icons/faTrailer";
// import { faTruckRampBox } from "@fortawesome/free-solid-svg-icons/faTruckRampBox";

import { useAuth } from "../../hooks/useAuth";

const Navigation = () => {
  const { user } = useAuth();
  return (
    <nav className={styles.nav}>
      <ul>
        {user ? (
          <>
            <li>
              <NavLink to="/">
                <img src={logo} alt="logo" />
              </NavLink>
            </li>
            <li>
              <NavLink to="/dashboard">
                {/* <FontAwesomeIcon
              icon={faGauge}
              size="2x"
              className={styles.navIcons}
            /> */}
                Dashboard
              </NavLink>
            </li>
            <li>
              <NavLink to="/track">
                {/* <FontAwesomeIcon
              icon={faTruckMoving}
              size="2x"
              className={styles.navIcons}
            /> */}
                Track Cargo
              </NavLink>
            </li>
            <li>
              <NavLink to="/drivers">
                {/* <FontAwesomeIcon
              icon={faPerson}
              size="2x"
              className={styles.navIcons}
            /> */}
                Drivers
              </NavLink>
            </li>
            <li>
              <NavLink to="/trucks">
                {/* <FontAwesomeIcon
              icon={faTruckFront}
              size="2x"
              className={styles.navIcons}
            /> */}
                Trucks
              </NavLink>
            </li>
            <li>
              <NavLink to="/trailers">
                {/* <FontAwesomeIcon
              icon={faTrailer}
              size="2x"
              className={styles.navIcons}
            /> */}
                Trailers
              </NavLink>
            </li>
            <li>
              <NavLink to="/cargo">
                {/* <FontAwesomeIcon
              icon={faTruckRampBox}
              size="2x"
              className={styles.navIcons}
            /> */}
                Add Cargo
              </NavLink>
            </li>
            <li>
              <NavLink to="/cargoList">
                {/* <FontAwesomeIcon
              icon={faTruckRampBox}
              size="2x"
              className={styles.navIcons}
            /> */}
                Cargo Preview
              </NavLink>
            </li>
            <li>
              <NavLink to="/login">
                {/* <FontAwesomeIcon
              icon={faTruckRampBox}
              size="2x"
              className={styles.navIcons}
            /> */}
                <LogoutButton />
              </NavLink>
            </li>
          </>
        ) : (
          <>
            <li>
              <NavLink to="/login">
                {/* <FontAwesomeIcon
              icon={faTruckRampBox}
              size="2x"
              className={styles.navIcons}
            /> */}
                Login
              </NavLink>
            </li>
          </>
        )}
      </ul>
    </nav>
  );
};

export default Navigation;
