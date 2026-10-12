import { ReactNode, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";

import { CARGO_STATUS, cx, type Tone } from "./helpers";
import mapPage from "./mapPage.module.css";
import dialog from "./modal.module.css";
import styles from "./ui.module.css";

export const PageHeader = ({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Small line above the title, e.g. the date or the section. */
  eyebrow?: ReactNode;
}) => (
  <div className={styles.header}>
    <div>
      {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
      <h1 className={styles.title}>{title}</h1>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </div>
    {actions && <div className={styles.actions}>{actions}</div>}
  </div>
);

/** White heading strip for the side panel of a map page. Phones show only the subtitle, not the description. */
export const PanelHeader = ({ title, description, subtitle }: { title: string; description?: string; subtitle?: ReactNode }) => (
  <div className={mapPage.panelHeader}>
    <h1 className={styles.title}>{title}</h1>
    {(description || subtitle) && (
      <p className={styles.subtitle}>
        {description && <span className={mapPage.description}>{subtitle ? `${description} · ` : description}</span>}
        {subtitle}
      </p>
    )}
  </div>
);

export const Badge = ({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) => (
  <span className={cx(styles.badge, styles[`tone-${tone}`])}>{children}</span>
);

export const CargoStatus = ({ status }: { status: string }) => {
  const [label, tone] = CARGO_STATUS[status] ?? [status, "neutral"];
  return <Badge tone={tone}>{label}</Badge>;
};

/** Availability of a truck, trailer or driver. */
export const ResourceStatus = ({ status }: { status: string }) =>
  status === "available" ? <Badge tone="success">Available</Badge> : <Badge tone="primary">On a trip</Badge>;

export const SearchInput = ({
  value,
  onChange,
  placeholder = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) => (
  <div className={styles.search}>
    <FontAwesomeIcon icon={faMagnifyingGlass} className={styles.searchIcon} />
    <input
      className={styles.searchInput}
      type="search"
      value={value}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  </div>
);

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export const FilterChips = <T extends string>({
  options,
  value,
  onChange,
}: {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) => (
  <div className={styles.chips} role="tablist">
    {options.map((option) => (
      <button
        key={option.value}
        role="tab"
        aria-selected={option.value === value}
        className={cx(styles.chip, option.value === value && styles.chipActive)}
        onClick={() => onChange(option.value)}
      >
        {option.label}
        {option.count !== undefined && <span className={styles.chipCount}>{option.count}</span>}
      </button>
    ))}
  </div>
);

export const EmptyState = ({ icon, title, text }: { icon: IconDefinition; title: string; text?: ReactNode }) => (
  <div className={styles.empty}>
    <FontAwesomeIcon icon={icon} className={styles.emptyIcon} />
    <p className={styles.emptyTitle}>{title}</p>
    {text && <p className={styles.emptyText}>{text}</p>}
  </div>
);

export const IconButton = ({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: IconDefinition;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) => (
  <button
    className={cx(styles.iconBtn, danger && styles.iconBtnDanger)}
    onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}
    title={label}
    aria-label={label}
  >
    <FontAwesomeIcon icon={icon} />
  </button>
);

export const Modal = ({
  title,
  onClose,
  children,
  footer,
  small,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  small?: boolean;
}) => {
  // Escape closes the dialog.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={dialog.overlay} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={cx(dialog.modal, small && dialog.modalSmall)} role="dialog" aria-modal="true" aria-label={title}>
        <div className={dialog.modalHeader}>
          <h2 className={dialog.modalTitle}>{title}</h2>
          <button className={styles.iconBtn} onClick={onClose} aria-label="Close">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <div className={dialog.modalBody}>{children}</div>
        {footer && <div className={dialog.modalFooter}>{footer}</div>}
      </div>
    </div>
  );
};

/**
 * Details of the selected item, floating over the right side of a map (see `mapDetailsInset`). On phones it takes
 * the list's place under the map. The map and list stay usable.
 */
export const MapDetailsCard = ({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) => {
  // Escape closes the card.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside className={mapPage.mapDetails} role="region" aria-label={title}>
      <div className={mapPage.mapDetailsHeader}>
        <div>
          <h2 className={mapPage.mapDetailsTitle}>{title}</h2>
          {subtitle && <p className={mapPage.mapDetailsSubtitle}>{subtitle}</p>}
        </div>
        <button className={styles.iconBtn} onClick={onClose} aria-label="Close details">
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>
      <div className={mapPage.mapDetailsBody}>{children}</div>
    </aside>
  );
};

export const ConfirmDialog = ({
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <Modal
    small
    title={title}
    onClose={onCancel}
    footer={
      <>
        <button className={cx(styles.btn, styles.secondary)} onClick={onCancel}>
          Cancel
        </button>
        <button className={cx(styles.btn, danger ? styles.danger : styles.primary)} onClick={onConfirm} disabled={busy}>
          {busy ? "Working..." : confirmLabel}
        </button>
      </>
    }
  >
    {/* A div, so a message can hold lists as well as text. */}
    <div style={{ margin: 0, fontSize: 14, color: "var(--color-text-muted)" }}>{message}</div>
  </Modal>
);
