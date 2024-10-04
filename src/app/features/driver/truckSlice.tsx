import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../../config/firebase";

import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";

interface Truck {
  id: string;
  status: string;
  truckNumber: string;
  truckModel: string;
  engineVariation: string;
}

export const trucksApi = createApi({
  reducerPath: "trucksApi",
  baseQuery: fakeBaseQuery(),
  tagTypes: ["Truck", "AvailableTrucks"],
  endpoints: (builder) => ({
    fetchTrucks: builder.query<Truck[], void>({
      async queryFn() {
        try {
          const ref = collection(db, "trucks");
          const querySnapshot = await getDocs(ref);
          const trucks: Truck[] = [];
          querySnapshot?.forEach((doc) => {
            trucks.push({ id: doc.id, ...doc.data() } as Truck);
          });
          return { data: trucks };
        } catch (err) {
          console.error(err);
          return { error: err };
        }
      },
      providesTags: ["Truck"],
    }),
    addNewTruck: builder.mutation<Truck, Omit<Truck, "id">>({
      async queryFn(newTruck: Truck) {
        try {
          const docRef = await addDoc(collection(db, "trucks"), {
            ...newTruck,
            status: "available",
            timeStamp: serverTimestamp(),
          });
          await setDoc(
            doc(db, "trucks", docRef.id),
            { id: docRef.id },
            { merge: true }
          );
          return { data: newTruck, id: docRef.id };
        } catch (err) {
          return { error: err };
        }
      },
      invalidatesTags: ["Truck"],
    }),
    deleteTruck: builder.mutation<string, string>({
      async queryFn(truckId) {
        try {
          await deleteDoc(doc(db, "trucks", truckId));
          return { data: truckId };
        } catch (err) {
          return { error: err };
        }
      },
      invalidatesTags: ["Truck"],
    }),
    loadTruck: builder.query<Truck, string>({
      async queryFn(truckId) {
        try {
          const ref = doc(db, "trucks", truckId);
          const querySnapshot = await getDoc(ref);

          if (!querySnapshot.exists()) {
            return { error: { status: 404, data: "Truck not found" } };
          }

          const truck: Truck = {
            id: querySnapshot.id,
            ...querySnapshot.data(),
          } as Truck;

          return { data: truck };
        } catch (err) {
          console.error(err);
          // @ts-expect-error not a final version
          return { error: { status: "CUSTOM_ERROR", data: err.message } };
        }
      },
      providesTags: ["Truck"],
    }),
    editTruck: builder.mutation<Truck, Truck>({
      async queryFn(truck: Truck) {
        try {
          const updateDocRef = doc(db, "trucks", truck.id);
          await updateDoc(updateDocRef, {
            truckModel: truck.truckModel,
            status: truck.status,
            truckNumber: truck.truckNumber,
            engineVariation: truck.engineVariation,
          });
          return { data: truck };
        } catch (err) {
          return { error: err };
        }
      },
      invalidatesTags: ["Truck"],
    }),
    fetchAvailableTrucks: builder.query<Truck[], void>({
      async queryFn() {
        try {
          const ref = collection(db, "trucks");
          const querySnapshot = await getDocs(ref);
          const trucks: Truck[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.status === "available") {
              trucks.push({ id: doc.id, ...data } as Truck);
            }
          });
          return { data: trucks };
        } catch (err) {
          return { error: err };
        }
      },
      providesTags: ["AvailableTrucks"],
    }),
  }),
});

export const {
  useFetchTrucksQuery,
  useAddNewTruckMutation,
  useDeleteTruckMutation,
  useLoadTruckQuery,
  useEditTruckMutation,
  useFetchAvailableTrucksQuery,
} = trucksApi;
