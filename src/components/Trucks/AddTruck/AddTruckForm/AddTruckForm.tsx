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
  heightM?: number | null;
  widthM?: number | null;
  weightT?: number | null;
  axles?: number | null;
}

interface TruckFormValues {
  id?: string;
  status?: string;
  truckNumber?: string;
  truckModels?: string[];
  engineVariations?: string[];
  truckModel?: string;
  engineVariation?: string;
  heightM?: string;
  widthM?: string;
  weightT?: string;
  axles?: string;
  values?: object;
}

// Empty inputs are allowed; filled ones must be numbers in the routing engine's range.
const optionalNumber = (max: number, label: string) =>
  Yup.number()
    .transform((value, original) => (original === "" ? undefined : value))
    .typeError(`${label} must be a number`)
    .min(0, `${label} cannot be negative`)
    .max(max, `${label} must be at most ${max}`);

const fieldLabels = {
  heightM: "Height (m)",
  widthM: "Width (m)",
  weightT: "Gross weight (t)",
  axles: "Axles",
};

const truckValidationSchema = Yup.object().shape({
  truckNumber: Yup.string().required("Truck Number is required"),
  truckModel: Yup.string().required("Select Truck"),
  engineVariation: Yup.string().required("Choose Engine"),
  heightM: optionalNumber(10, "Height"),
  widthM: optionalNumber(10, "Width"),
  weightT: optionalNumber(100, "Weight"),
  axles: optionalNumber(20, "Axles").integer("Axles must be a whole number"),
});

const toInput = (value?: number | null) => (value == null ? "" : String(value));

const AddTruckForm: React.FC<AddTruckFormProps> = ({
  id,
  open,
  onClose,
  truckNumber,
  editTruckForm,
  truckModel,
  engineVariation,
  heightM,
  widthM,
  weightT,
  axles,
}) => {
  const [addNewTruck] = useAddNewTruckMutation();

  const [editTruck] = useEditTruckMutation();

  // Keep a model that isn't in the list (e.g. from imported data) selectable.
  const truckModels = ["Scania", "DAF"];
  if (truckModel && !truckModels.includes(truckModel)) truckModels.push(truckModel);
  const engineVariations = ["Petrol", "Diesel"];

  const initialValues: TruckFormValues = {
    id: id || "",
    truckModel: truckModel || "",
    truckNumber: truckNumber || "",
    engineVariation: engineVariation || "",
    heightM: toInput(heightM),
    widthM: toInput(widthM),
    weightT: toInput(weightT),
    axles: toInput(axles),
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
        fieldLabels={fieldLabels}
      />
    </>
  );
};

export default AddTruckForm;
