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
  id?: string;
  trailer?: string;
  status?: string;
  trailerNumber?: string;
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
    id: id || "",
    trailer: trailer || "",
    trailerNumber: trailerNumber || "",
  };

  return (
    <>
      <AddEntityForm
        id={id}
        open={open}
        onClose={onClose}
        // @ts-expect-error not a final version
        initialValues={initialValues}
        validationSchema={trailerValidationSchema}
        editEntityForm={editTrailerForm}
        // @ts-expect-error not a final version
        addEntity={addNewTrailer}
        // @ts-expect-error not a final version
        editEntity={editTrailer}
        entityLabel="trailer"
        fieldLabels={{ trailer: "Trailer type", trailerNumber: "Trailer number" }}
      />
    </>
  );
};

export default AddTrailerForm;
