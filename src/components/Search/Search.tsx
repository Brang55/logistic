import styles from "./Search.module.css";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";

const Search = () => {
  return (
    <div className={styles.searchHandler}>
      <FontAwesomeIcon
        icon={faMagnifyingGlass}
        className={styles.loopIcon}
        size="lg"
      />
      <input type="text" className={styles.search} placeholder="Search here" />
    </div>
  );
};

export default Search;
