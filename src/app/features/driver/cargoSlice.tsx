import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  writeBatch,
  query,
  where,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../../config/firebase";

import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";

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
  driverId?: string;
  truckId?: string;
  trailerId?: string;
  status: string;
}

export const cargosApi = createApi({
  reducerPath: "cargosApi",
  baseQuery: fakeBaseQuery(),
  tagTypes: ["Cargo"],
  endpoints: (builder) => ({
    fetchCargos: builder.query<Cargo[], void>({
      async queryFn() {
        try {
          const ref = collection(db, "cargos");
          const querySnapshot = await getDocs(ref);
          const cargos: Cargo[] = [];
          querySnapshot?.forEach((doc) => {
            cargos.push({ id: doc.id, ...doc.data() } as Cargo);
          });
          return { data: cargos };
        } catch (err) {
          console.error(err);
          return { error: err };
        }
      },
      providesTags: ["Cargo"],
    }),
    addNewCargo: builder.mutation<Cargo, Omit<Cargo, "id">>({
      async queryFn(newCargo: Cargo) {
        try {
          const docRef = await addDoc(collection(db, "cargos"), {
            ...newCargo,
            status: "new",
            timeStamp: serverTimestamp(),
          });
          await setDoc(
            doc(db, "cargos", docRef.id),
            { id: docRef.id },
            { merge: true }
          );
          return { data: newCargo, id: docRef.id };
        } catch (err) {
          return { error: err };
        }
      },
      invalidatesTags: ["Cargo"],
    }),
    deleteCargo: builder.mutation<string, string>({
      async queryFn(cargoId) {
        try {
          await deleteDoc(doc(db, "cargos", cargoId));
          return { data: cargoId };
        } catch (err) {
          return { error: err };
        }
      },
      invalidatesTags: ["Cargo"],
    }),
    loadCargo: builder.query<Cargo, string>({
      async queryFn(cargoId) {
        try {
          const ref = doc(db, "cargos", cargoId);
          const querySnapshot = await getDoc(ref);

          if (!querySnapshot.exists()) {
            return { error: { status: 404, data: "Truck not found" } };
          }

          const cargo: Cargo = {
            id: querySnapshot.id,
            ...querySnapshot.data(),
          } as Cargo;

          return { data: cargo };
        } catch (err) {
          console.error(err);
          // @ts-expect-error not a final version
          return { error: { status: "CUSTOM_ERROR", data: err.message } };
        }
      },
      providesTags: ["Cargo"],
    }),
    editCargo: builder.mutation<Cargo, Cargo>({
      async queryFn(cargo: Cargo) {
        try {
          // Fetch the current cargo details
          const currentCargoRef = doc(db, "cargos", cargo.id);
          const currentCargoSnap = await getDoc(currentCargoRef);
          if (!currentCargoSnap.exists()) {
            throw new Error("Cargo not found");
          }

          const currentCargo = currentCargoSnap.data() as Cargo;

          const batch = writeBatch(db);

          if (
            currentCargo.driverId &&
            currentCargo.driverId !== cargo.driverId
          ) {
            batch.update(doc(db, "drivers", currentCargo.driverId), {
              status: "available",
            });
          }
          if (currentCargo.truckId && currentCargo.truckId !== cargo.truckId) {
            batch.update(doc(db, "trucks", currentCargo.truckId), {
              status: "available",
            });
          }
          if (
            currentCargo.trailerId &&
            currentCargo.trailerId !== cargo.trailerId
          ) {
            batch.update(doc(db, "trailers", currentCargo.trailerId), {
              status: "available",
            });
          }

          // Update the status of new driver, truck, trailer to 'taken'
          if (cargo.driverId && currentCargo.driverId !== cargo.driverId) {
            batch.update(doc(db, "drivers", cargo.driverId), {
              status: "taken",
            });
          }
          if (cargo.truckId && currentCargo.truckId !== cargo.truckId) {
            batch.update(doc(db, "trucks", cargo.truckId), { status: "taken" });
          }
          if (cargo.trailerId && currentCargo.trailerId !== cargo.trailerId) {
            batch.update(doc(db, "trailers", cargo.trailerId), {
              status: "taken",
            });
          }

          batch.update(currentCargoRef, {
            contactPerson: cargo.contactPerson,
            deliveryDate: cargo.deliveryDate,
            deliveryLocation: cargo.deliveryLocation,
            descriptionOfGoods: cargo.descriptionOfGoods,
            dimensions: cargo.dimensions,
            emailAddress: cargo.emailAddress,
            freightCost: cargo.freightCost,
            hazardousMaterial: cargo.hazardousMaterial,
            notes: cargo.notes,
            paymentTerms: cargo.paymentTerms,
            phoneNumber: cargo.phoneNumber,
            pickupDate: cargo.pickupDate,
            pickupLocation: cargo.pickupLocation,
            quantity: cargo.quantity,
            receiverAddress: cargo.receiverAddress,
            receiverContact: cargo.receiverContact,
            receiverEmail: cargo.receiverEmail,
            receiverName: cargo.receiverName,
            receiverPhone: cargo.receiverPhone,
            serviceType: cargo.serviceType,
            shipperAddress: cargo.shipperAddress,
            shipperName: cargo.shipperName,
            specialHandlingInstructions: cargo.specialHandlingInstructions,
            temperatureControl: cargo.temperatureControl,
            truckType: cargo.truckType,
            weight: cargo.weight,
            driverId: cargo.driverId,
            truckId: cargo.truckId,
            trailerId: cargo.trailerId,
            status: "edited",
          });

          await batch.commit();

          return { data: cargo };
        } catch (err) {
          return { error: err };
        }
      },
      invalidatesTags: ["Cargo"],
    }),
    confirmCargo: builder.mutation<void, string>({
      async queryFn(cargoId) {
        try {
          const ref = doc(db, "cargos", cargoId);
          await updateDoc(ref, { status: "confirmed" });
          return { data: undefined };
        } catch (err) {
          return { error: err };
        }
      },
      invalidatesTags: ["Cargo"],
    }),
    // New endpoint for fetching all confirmed cargos
    fetchConfirmedCargos: builder.query<Cargo[], void>({
      async queryFn() {
        try {
          const q = query(
            collection(db, "cargos"),
            where("status", "==", "confirmed")
          );
          const querySnapshot = await getDocs(q);
          const confirmedCargos: Cargo[] = [];
          querySnapshot.forEach((doc) => {
            confirmedCargos.push({ id: doc.id, ...doc.data() } as Cargo);
          });
          return { data: confirmedCargos };
        } catch (err) {
          return { error: err };
        }
      },
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
  useConfirmCargoMutation,
  useFetchConfirmedCargosQuery,
} = cargosApi;
