import {
  type TruckInput,
  useAddNewTruckMutation,
  useEditTruckMutation,
  useFetchTrucksQuery,
} from "../../../../app/api/trucks";
import { useFetchTrailersQuery } from "../../../../app/api/trailers";
import { ftToM, lbToT, mToFt, toInputValue, tToLb } from "../../../../utils/units";

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
  lengthM?: number | null;
  weightT?: number | null;
  axles?: number | null;
  trailerId?: string | null;
}

// Dimensions are entered in feet and pounds and stored metric, as the routing engine expects.
interface TruckFormValues {
  truckNumber: string;
  truckModel: string;
  engineVariation: string;
  heightFt: string;
  widthFt: string;
  lengthFt: string;
  weightLb: string;
  axles: string;
  trailerId: string;
}

// Empty inputs are allowed; filled ones must be numbers in the routing engine's range.
const optionalNumber = (max: number, label: string) =>
  Yup.number()
    .transform((value, original) => (original === "" ? undefined : value))
    .typeError(`${label} must be a number`)
    .min(0, `${label} cannot be negative`)
    .max(max, `${label} must be at most ${max}`);

const fieldLabels = {
  truckModel: "Make and model",
  truckNumber: "Truck number",
  engineVariation: "Engine",
  heightFt: "Height (ft)",
  widthFt: "Width (ft)",
  lengthFt: "Length (ft)",
  weightLb: "Gross weight (lb)",
  axles: "Axles",
  trailerId: "Current trailer",
};

const truckValidationSchema = Yup.object().shape({
  truckNumber: Yup.string().required("Truck number is required"),
  truckModel: Yup.string().required("Make and model are required"),
  engineVariation: Yup.string().required("Choose an engine"),
  heightFt: optionalNumber(30, "Height"),
  widthFt: optionalNumber(30, "Width"),
  lengthFt: optionalNumber(150, "Length"),
  weightLb: optionalNumber(200_000, "Weight"),
  axles: optionalNumber(20, "Axles").integer("Axles must be a whole number"),
});

const toInput = (value?: number | null) => (value == null ? "" : String(value));

const metric = (value: string | undefined, convert: (n: number) => number) =>
  value === undefined || value.trim() === "" ? null : Number(convert(Number(value)).toFixed(3));

const toApi = ({ heightFt, widthFt, lengthFt, weightLb, axles, ...rest }: TruckFormValues): TruckInput => ({
  ...rest,
  axles: axles.trim() === "" ? null : Number(axles),
  heightM: metric(heightFt, ftToM),
  widthM: metric(widthFt, ftToM),
  lengthM: metric(lengthFt, ftToM),
  weightT: metric(weightLb, lbToT),
});

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
  lengthM,
  weightT,
  axles,
  trailerId,
}) => {
  const [addNewTruck] = useAddNewTruckMutation();

  const [editTruck] = useEditTruckMutation();
  const { data: trucks = [] } = useFetchTrucksQuery();
  const { data: trailers = [] } = useFetchTrailersQuery();

  // Hooking a trailer that is on another truck unhooks it there.
  const hookedTo = new Map(trucks.filter((t) => t.trailerId && t.id !== id).map((t) => [t.trailerId, t.truckNumber]));
  const trailerOptions = [
    { value: "", label: "No trailer" },
    ...trailers.map((trailer) => ({
      value: trailer.id,
      label: [trailer.trailerNumber, trailer.trailer, hookedTo.has(trailer.id) && `on ${hookedTo.get(trailer.id)}`]
        .filter(Boolean)
        .join(" · "),
    })),
  ];

  // Keep a value that isn't in the list (e.g. from imported data) selectable.
  const engineVariations = ["Diesel", "LNG", "Electric", "Hybrid"];
  if (engineVariation && !engineVariations.includes(engineVariation)) engineVariations.push(engineVariation);

  const initialValues: TruckFormValues = {
    truckModel: truckModel || "",
    truckNumber: truckNumber || "",
    engineVariation: engineVariation || "",
    heightFt: toInputValue(heightM, mToFt, 1),
    widthFt: toInputValue(widthM, mToFt, 1),
    lengthFt: toInputValue(lengthM, mToFt, 1),
    weightLb: toInputValue(weightT, tToLb),
    axles: toInput(axles),
    trailerId: trailerId || "",
  };

  return (
    <>
      <AddEntityForm
        id={id}
        open={open}
        onClose={onClose}
        initialValues={initialValues}
        validationSchema={truckValidationSchema}
        editEntityForm={editTruckForm}
        addEntity={(values) => addNewTruck(toApi(values))}
        editEntity={({ id, ...values }) => editTruck({ id, ...toApi(values) })}
        entityLabel="truck"
        engineVariations={engineVariations}
        selects={{ trailerId: trailerOptions }}
        fieldLabels={fieldLabels}
      />
    </>
  );
};

export default AddTruckForm;
