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

interface Trailer {
  id: string;
  trailer: string;
  status: string;
  trailerNumber: string;
}

export const trailersApi = createApi({
  reducerPath: "trailersApi",
  baseQuery: fakeBaseQuery(),
  tagTypes: ["Trailer", "AvailableTrailers"],
  endpoints: (builder) => ({
    fetchTrailers: builder.query<Trailer[], void>({
      async queryFn() {
        try {
          const ref = collection(db, "trailers");
          const querySnapshot = await getDocs(ref);
          const trailers: Trailer[] = [];
          querySnapshot?.forEach((doc) => {
            trailers.push({ id: doc.id, ...doc.data() } as Trailer);
          });
          return { data: trailers };
        } catch (err) {
          console.error(err);
          return { error: err };
        }
      },
      providesTags: ["Trailer"],
    }),
    addNewTrailer: builder.mutation<Trailer, Omit<Trailer, "id">>({
      async queryFn(newTrailer: Trailer) {
        try {
          const docRef = await addDoc(collection(db, "trailers"), {
            ...newTrailer,
            status: "available",
            timeStamp: serverTimestamp(),
          });
          await setDoc(
            doc(db, "trailers", docRef.id),
            { id: docRef.id },
            { merge: true }
          );
          return { data: newTrailer, id: docRef.id };
        } catch (err) {
          return { error: err };
        }
      },
      invalidatesTags: ["Trailer"],
    }),
    deleteTrailer: builder.mutation<string, string>({
      async queryFn(trailerId) {
        try {
          await deleteDoc(doc(db, "trailers", trailerId));
          return { data: trailerId };
        } catch (err) {
          return { error: err };
        }
      },
      invalidatesTags: ["Trailer"],
    }),
    loadTrailer: builder.query<Trailer, string>({
      async queryFn(trailerId) {
        try {
          const ref = doc(db, "trailers", trailerId);
          const querySnapshot = await getDoc(ref);

          if (!querySnapshot.exists()) {
            return { error: { status: 404, data: "Trailer not found" } };
          }

          const trailer: Trailer = {
            id: querySnapshot.id,
            ...querySnapshot.data(),
          } as Trailer;

          return { data: trailer };
        } catch (err) {
          console.error(err);
          // @ts-expect-error not a final version
          return { error: { status: "CUSTOM_ERROR", data: err.message } };
        }
      },
      providesTags: ["Trailer"],
    }),
    editTrailer: builder.mutation<Trailer, Trailer>({
      async queryFn(trailer: Trailer) {
        try {
          const updateDocRef = doc(db, "trailers", trailer.id);
          await updateDoc(updateDocRef, {
            truck: trailer.trailer,
            status: trailer.status,
            truckNumber: trailer.trailerNumber,
          });
          return { data: trailer };
        } catch (err) {
          return { error: err };
        }
      },
      invalidatesTags: ["Trailer"],
    }),
    fetchAvailableTrailers: builder.query<Trailer[], void>({
      async queryFn() {
        try {
          const ref = collection(db, "trailers");
          const querySnapshot = await getDocs(ref);
          const trailers: Trailer[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.status === "available") {
              trailers.push({ id: doc.id, ...data } as Trailer);
            }
          });
          return { data: trailers };
        } catch (err) {
          return { error: err };
        }
      },
      providesTags: ["AvailableTrailers"],
    }),
  }),
});

export const {
  useFetchTrailersQuery,
  useAddNewTrailerMutation,
  useDeleteTrailerMutation,
  useLoadTrailerQuery,
  useEditTrailerMutation,
  useFetchAvailableTrailersQuery,
} = trailersApi;
