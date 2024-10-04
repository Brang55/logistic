import { useState } from "react";

import AddTrailerForm from "./AddTrailerForm/AddTrailerForm";

import styles from "./AddTrailer.module.css";

const AddTrailer: React.FC = () => {
  const [openForm, setOpenForm] = useState<boolean>(false);

  return (
    <div className={styles.addDriverHolder}>
      <h3>Trailers List</h3>
      <button
        onClick={() => setOpenForm(true)}
        className={styles.addDriverButton}
      >
        Add Trailer
      </button>
      <AddTrailerForm
        open={openForm}
        onClose={() => setOpenForm(false)}
        editTrailerForm={false}
      />
    </div>
  );
};

export default AddTrailer;
