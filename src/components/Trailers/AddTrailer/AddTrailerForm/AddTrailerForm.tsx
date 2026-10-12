import {
  useAddNewTrailerMutation,
  useEditTrailerMutation,
} from "../../../../app/api/trailers";

import * as Yup from "yup";

import AddEntityForm from "../../../Entity/AddEntityForm/AddEntityForm";

interface AddTrailerFormProps {
  id?: string;
  open: boolean;
  onClose: () => void;
  trailer?: string;
  status?: string;
  trailerNumber?: string;
  editTrailerForm: boolean;
}

interface TrailerFormValues {
  trailer: string;
  trailerNumber: string;
}

const trailerValidationSchema = Yup.object().shape({
  trailer: Yup.string().required("Trailer type is required"),
  trailerNumber: Yup.string().required("Trailer number is required"),
});

const AddTrailerForm: React.FC<AddTrailerFormProps> = ({
  id,
  open,
  onClose,
  trailer,
  trailerNumber,
  editTrailerForm,
}) => {
  const [addNewTrailer] = useAddNewTrailerMutation();

  const [editTrailer] = useEditTrailerMutation();

  const initialValues: TrailerFormValues = {
    trailer: trailer || "",
    trailerNumber: trailerNumber || "",
  };

  return (
    <>
      <AddEntityForm
        id={id}
        open={open}
        onClose={onClose}
        initialValues={initialValues}
        validationSchema={trailerValidationSchema}
        editEntityForm={editTrailerForm}
        addEntity={addNewTrailer}
        editEntity={editTrailer}
        entityLabel="trailer"
        fieldLabels={{ trailer: "Trailer type", trailerNumber: "Trailer number" }}
      />
    </>
  );
};

export default AddTrailerForm;
