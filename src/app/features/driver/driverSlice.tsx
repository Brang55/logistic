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

interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: number;
  truckDriverEmail: string;
  truckNumber: string;
  content: string;
  status: string;
}

export const driversApi = createApi({
  reducerPath: "driversApi",
  baseQuery: fakeBaseQuery(),
  tagTypes: ["Driver", "AvailableDrivers"],
  endpoints: (builder) => ({
    fetchDrivers: builder.query<Driver[], void>({
      async queryFn() {
        try {
          const ref = collection(db, "drivers");
          const querySnapshot = await getDocs(ref);
          const drivers: Driver[] = [];
          querySnapshot?.forEach((doc) => {
            drivers.push({ id: doc.id, ...doc.data() } as Driver);
          });
          return { data: drivers };
        } catch (err) {
          console.error(err);
          return { error: err };
        }
      },
      providesTags: ["Driver"],
    }),
    addNewDriver: builder.mutation<Driver, Omit<Driver, "id">>({
      async queryFn(newDriver: Driver) {
        try {
          const docRef = await addDoc(collection(db, "drivers"), {
            ...newDriver,
            status: "available",
            timeStamp: serverTimestamp(),
          });
          await setDoc(
            doc(db, "drivers", docRef.id),
            { id: docRef.id },
            { merge: true }
          );
          return { data: newDriver, id: docRef.id };
        } catch (err) {
          return { error: err };
        }
      },
      invalidatesTags: ["Driver", "AvailableDrivers"],
    }),
    deleteDriver: builder.mutation<string, string>({
      async queryFn(driverId) {
        try {
          await deleteDoc(doc(db, "drivers", driverId));
          return { data: driverId };
        } catch (err) {
          return { error: err };
        }
      },
      invalidatesTags: ["Driver"],
    }),
    loadDriver: builder.query<Driver, string>({
      async queryFn(driverId) {
        try {
          const ref = doc(db, "drivers", driverId);
          const querySnapshot = await getDoc(ref);

          if (!querySnapshot.exists()) {
            return { error: { status: 404, data: "Driver not found" } };
          }

          const driver: Driver = {
            id: querySnapshot.id,
            ...querySnapshot.data(),
          } as Driver;

          return { data: driver };
        } catch (err) {
          console.error(err);
          // @ts-expect-error not a final version
          return { error: { status: "CUSTOM_ERROR", data: err.message } };
        }
      },
      providesTags: ["Driver"],
    }),
    editDriver: builder.mutation<Driver, Driver>({
      async queryFn(driver: Driver) {
        try {
          const updateDocRef = doc(db, "drivers", driver.id);
          await updateDoc(updateDocRef, {
            firstName: driver.firstName,
            lastName: driver.lastName,
            phoneNumber: driver.phoneNumber,
            truckDriverEmail: driver.truckDriverEmail,
            truckNumber: driver.truckNumber,
          });
          return { data: driver };
        } catch (err) {
          return { error: err };
        }
      },
      invalidatesTags: ["Driver", "AvailableDrivers"],
    }),
    fetchAvailableDrivers: builder.query<Driver[], void>({
      async queryFn() {
        try {
          const ref = collection(db, "drivers");
          const querySnapshot = await getDocs(ref);
          const drivers: Driver[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.status === "available") {
              drivers.push({ id: doc.id, ...data } as Driver);
            }
          });
          return { data: drivers };
        } catch (err) {
          return { error: err };
        }
      },
      providesTags: ["AvailableDrivers"],
    }),
  }),
});

export const {
  useFetchDriversQuery,
  useAddNewDriverMutation,
  useDeleteDriverMutation,
  useLoadDriverQuery,
  useEditDriverMutation,
  useFetchAvailableDriversQuery,
} = driversApi;
