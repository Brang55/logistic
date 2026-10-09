import { useState } from "react";
import { NavLink } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faBars,
  faClipboardList,
  faCubes,
  faGauge,
  faLocationDot,
  faMapLocationDot,
  faRoute,
  faSquarePlus,
  faTrafficLight,
  faTrailer,
  faTruck,
  faTruckFast,
  faTruckRampBox,
  faUsers,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import { useAuth } from "../../hooks/useAuth";
import LogoutButton from "../Account/LogoutButton/LogoutButton";

import styles from "./Navigation.module.css";

interface NavItem {
  to: string;
  label: string;
  icon: IconDefinition;
  end?: boolean;
}

const STAFF_SECTIONS: { title: string; items: NavItem[] }[] = [
  { title: "Overview", items: [{ to: "/", label: "Dashboard", icon: faGauge, end: true }] },
  {
    title: "Operations",
    items: [
      { to: "/dispatcher", label: "Dispatch", icon: faRoute },
      { to: "/fleet", label: "Live fleet", icon: faMapLocationDot },
      { to: "/traffic", label: "Traffic", icon: faTrafficLight },
      { to: "/loadboard", label: "Load board", icon: faTruckRampBox },
      { to: "/track", label: "Track cargo", icon: faLocationDot },
    ],
  },
  {
    title: "Cargo",
    items: [
      { to: "/cargoList", label: "All cargo", icon: faClipboardList },
      { to: "/cargo", label: "Add cargo", icon: faSquarePlus, end: true },
    ],
  },
  {
    title: "Fleet",
    items: [
      { to: "/trucks", label: "Trucks", icon: faTruck },
      { to: "/trailers", label: "Trailers", icon: faTrailer },
      { to: "/drivers", label: "Drivers", icon: faUsers },
    ],
  },
];

const DRIVER_SECTIONS: { title: string; items: NavItem[] }[] = [{ title: "Driver", items: [{ to: "/driver", label: "My trip", icon: faTruckFast }] }];

const ROLE_LABELS: Record<string, string> = { admin: "Administrator", dispatcher: "Dispatcher", driver: "Driver" };

const Navigation = () => {
  const { user } = useAuth();
  // Mobile only: the menu collapses behind the top-bar toggle.
  const [open, setOpen] = useState(false);

  // The login page is full screen.
  if (!user) return null;

  const sections = user.role === "driver" ? DRIVER_SECTIONS : STAFF_SECTIONS;
  const initials = user.email.slice(0, 2).toUpperCase();

  return (
    <nav className={`${styles.nav} ${open ? styles.open : ""}`} aria-label="Main">
      <div className={styles.topbar}>
        <NavLink to={user.role === "driver" ? "/driver" : "/"} className={styles.brand} onClick={() => setOpen(false)}>
          <span className={styles.brandMark}>
            <FontAwesomeIcon icon={faCubes} />
          </span>
          <span className={styles.brandText}>
            <strong>Logistic</strong>
            <span>Fleet &amp; Dispatch</span>
          </span>
        </NavLink>
        <button
          className={styles.toggle}
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          <FontAwesomeIcon icon={open ? faXmark : faBars} />
        </button>
      </div>

      <div className={styles.menu}>
        {sections.map((section) => (
          <div key={section.title} className={styles.section}>
            <span className={styles.sectionTitle}>{section.title}</span>
            <ul>
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}
                    onClick={() => setOpen(false)}
                  >
                    <FontAwesomeIcon icon={item.icon} fixedWidth className={styles.icon} />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className={styles.user}>
          <span className={styles.avatar}>{initials}</span>
          <span className={styles.userText}>
            <span className={styles.email} title={user.email}>
              {user.email}
            </span>
            <span className={styles.role}>{ROLE_LABELS[user.role] ?? user.role}</span>
          </span>
          <LogoutButton />
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
