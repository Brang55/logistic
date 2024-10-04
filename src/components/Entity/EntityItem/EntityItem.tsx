import styles from "./EntityItem.module.css";

interface EntityItemProps<T> {
  entityFields: Array<keyof T>;
  item: T;
  onDeleteClick: (id: string, firstName: string, lastName: string) => void;
  onEditClick: (id: string) => void;
}

export const EntityItem = <
  T extends {
    id: string;
    firstName: string;
    lastName: string;
  }
>({
  entityFields,
  item,
  onDeleteClick,
  onEditClick,
}: EntityItemProps<T>): JSX.Element => {
  return (
    <div className={styles.tableRow} key={item.id}>
      {entityFields.map((field) => (
        <li key={field as string}>{String(item[field])}</li>
      ))}
      <li>
        <button
          className={styles.driverPreview}
          onClick={() => onEditClick(item.id)}
        >
          Edit
        </button>
        <button
          className={styles.driverDelete}
          onClick={() => onDeleteClick(item.id, item.firstName, item.lastName)}
        >
          Delete
        </button>
      </li>
    </div>
  );
};
