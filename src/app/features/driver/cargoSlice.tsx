import { api } from "../../api";

export default interface Cargo {
  key: string;
  id: string;
  contactPerson: string;
  deliveryDate: string;
  deliveryLocation: string;
  descriptionOfGoods: string;
  dimensions: string;
  emailAddress: string;
  freightCost: string;
  hazardousMaterial: string;
  notes: string;
  paymentTerms: string;
  phoneNumber: string;
  pickupDate: string;
  pickupLocation: string;
  quantity: string;
  receiverAddress: string;
  receiverContact: string;
  receiverEmail: string;
  receiverName: string;
  receiverPhone: string;
  serviceType: string;
  shipperAddress: string;
  shipperName: string;
  specialHandlingInstructions: string;
  temperatureControl: string;
  truckType: string;
  weight: string;
  values: object;
  driverId?: string | null;
  truckId?: string | null;
  trailerId?: string | null;
  status: string;
  pickupPoint?: { x: number; y: number } | null;
  deliveryPoint?: { x: number; y: number } | null;
}

export type CargoAssignment = Pick<Cargo, "driverId" | "truckId" | "trailerId">;

// Assigning or releasing a driver, truck or trailer changes its availability.
const ASSIGNMENT_TAGS = [
  "Cargo",
  "Driver",
  "AvailableDrivers",
  "Truck",
  "AvailableTrucks",
  "Trailer",
  "AvailableTrailers",
] as const;

export const cargosApi = api.injectEndpoints({
  endpoints: (builder) => ({
    fetchCargos: builder.query<Cargo[], void>({
      query: () => "/cargos",
      providesTags: ["Cargo"],
    }),
    addNewCargo: builder.mutation<Cargo, Omit<Cargo, "id">>({
      query: (body) => ({ url: "/cargos", method: "POST", body }),
      invalidatesTags: [...ASSIGNMENT_TAGS],
    }),
    deleteCargo: builder.mutation<void, string>({
      query: (id) => ({ url: `/cargos/${id}`, method: "DELETE" }),
      invalidatesTags: [...ASSIGNMENT_TAGS],
    }),
    loadCargo: builder.query<Cargo, string>({
      query: (id) => `/cargos/${id}`,
      providesTags: ["Cargo"],
    }),
    editCargo: builder.mutation<Cargo, Cargo>({
      query: ({ id, ...body }) => ({ url: `/cargos/${id}`, method: "PATCH", body }),
      invalidatesTags: [...ASSIGNMENT_TAGS],
    }),
    // Assigns driver/truck/trailer without changing the cargo's status.
    assignCargo: builder.mutation<Cargo, { id: string } & CargoAssignment>({
      query: ({ id, ...body }) => ({ url: `/cargos/${id}/assign`, method: "POST", body }),
      invalidatesTags: [...ASSIGNMENT_TAGS],
    }),
    confirmCargo: builder.mutation<void, string>({
      query: (id) => ({ url: `/cargos/${id}/confirm`, method: "POST" }),
      invalidatesTags: ["Cargo"],
    }),
    fetchConfirmedCargos: builder.query<Cargo[], void>({
      query: () => "/cargos?status=confirmed",
      providesTags: ["Cargo"],
    }),
  }),
});

export const {
  useFetchCargosQuery,
  useAddNewCargoMutation,
  useDeleteCargoMutation,
  useLoadCargoQuery,
  useEditCargoMutation,
  useAssignCargoMutation,
  useConfirmCargoMutation,
  useFetchConfirmedCargosQuery,
} = cargosApi;
