import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCONV7Flu6ewalkGsuKvuG6h3HUAnBEOhA",

  authDomain: "logistic-28b65.firebaseapp.com",

  projectId: "logistic-28b65",

  storageBucket: "logistic-28b65.appspot.com",

  messagingSenderId: "526394722991",

  appId: "1:526394722991:web:4a3cff976a6df82866a25a",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const db = getFirestore(app);

export { db };
