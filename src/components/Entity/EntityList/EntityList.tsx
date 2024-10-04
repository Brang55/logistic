import styles from "./EntityList.module.css";

interface EntityListProps<T> {
  data: T[];
  renderItem: (item: T) => React.ReactNode;
  headings: string[];
}

export const EntityList = <T,>({
  data,
  renderItem,
  headings,
}: EntityListProps<T>): JSX.Element => {
  return (
    <ul className={styles.truckDriversList}>
      <div className={styles.truckDriversHeadings}>
        {headings.map((heading, index) => (
          <li key={index}>{heading}</li>
        ))}
      </div>
      {data.map((item) => renderItem(item))}
    </ul>
  );
};
