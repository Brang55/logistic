import {
  useAddNewTruckMutation,
  useEditTruckMutation,
} from "../../../../app/features/driver/truckSlice";

import * as Yup from "yup";

import AddEntityForm from "../../../Entity/AddEntityForm/AddEntityForm";

interface AddTruckFormProps {
  id?: string;
  open: boolean;
  onClose: () => void;
  status?: string;
  truckNumber?: string;
  editTruckForm: boolean;
  truckModel?: string;
  engineVariation?: string;
  truckModels?: string[];
  engineVariations?: string[];
}

interface TruckFormValues {
  id?: string;
  status?: string;
  truckNumber?: string;
  truckModels?: string[];
  engineVariations?: string[];
  truckModel?: string;
  engineVariation?: string;
  values?: object;
}

const truckValidationSchema = Yup.object().shape({
  truckNumber: Yup.string().required("Truck Number is required"),
  truckModel: Yup.string().required("Select Truck"),
  engineVariation: Yup.string().required("Choose Engine"),
});

const AddTruckForm: React.FC<AddTruckFormProps> = ({
  id,
  open,
  onClose,
  truckNumber,
  editTruckForm,
  truckModel,
  engineVariation,
}) => {
  const [addNewTruck] = useAddNewTruckMutation();

  const [editTruck] = useEditTruckMutation();

  const truckModels = ["Scania", "DAF"];
  const engineVariations = ["Petrol", "Diesel"];

  const initialValues: TruckFormValues = {
    id: id || "",
    truckModel: truckModel || "",
    truckNumber: truckNumber || "",
    engineVariation: engineVariation || "",
  };

  return (
    <>
      <AddEntityForm
        id={id}
        truckModels={truckModels}
        open={open}
        onClose={onClose}
        initialValues={initialValues}
        validationSchema={truckValidationSchema}
        editEntityForm={editTruckForm}
        // @ts-expect-error not a final version
        addEntity={addNewTruck}
        // @ts-expect-error not a final version
        editEntity={editTruck}
        entityLabel="truck"
        engineVariations={engineVariations}
      />
    </>
  );
};

export default AddTruckForm;
