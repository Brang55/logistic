import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import { auth, db } from "../../../config/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { collection, addDoc, getDocs, query, where } from "firebase/firestore";

// Define the API slice with RTK Query
export const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: fakeBaseQuery(),
  endpoints: (builder) => ({
    registerUser: builder.mutation({
      async queryFn({ email, password }: { email: string; password: string }) {
        try {
          // Register user with Firebase Authentication
          const userCredential = await createUserWithEmailAndPassword(
            auth,
            email,
            password
          );
          const user = userCredential.user;

          // Save user in Firestore
          await addDoc(collection(db, "users"), {
            uid: user.uid,
            email: user.email,
          });

          return { data: user };
        } catch (error) {
          // @ts-expect-error not a final version
          return { error: error.message };
        }
      },
    }),
    loginUser: builder.mutation({
      async queryFn({ email, password }: { email: string; password: string }) {
        try {
          // Authenticate user with Firebase Authentication
          const userCredential = await signInWithEmailAndPassword(
            auth,
            email,
            password
          );
          const user = userCredential.user;

          // Check if user exists in Firestore
          const q = query(
            collection(db, "users"),
            where("uid", "==", user.uid)
          );
          const querySnapshot = await getDocs(q);
          if (querySnapshot.empty) {
            throw new Error("User does not exist in Firestore");
          }

          return { data: user };
        } catch (error) {
          // @ts-expect-error not a final version
          return { error: error.message };
        }
      },
    }),
  }),
});

export const { useRegisterUserMutation, useLoginUserMutation } = authApi;
