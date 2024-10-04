import { createContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { doc, getDoc, DocumentData } from "firebase/firestore";
import { db, auth } from "../config/firebase";

// Define the shape of the auth context
interface AuthContextType {
  user: User | null;
  userData: DocumentData | null; // Firestore user data
  loading: boolean;
  logoutUser: () => Promise<void>;
}

// Create the context
export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);

// Create a provider component
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Set up the onAuthStateChanged listener
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      if (currentUser) {
        // Fetch additional user data from Firestore
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
          setUserData(userDoc.data());
        } else {
          setUserData(null);
        }
      } else {
        setUserData(null);
      }
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const logoutUser = async () => {
    await signOut(auth);
    // After sign out, Firebase automatically updates the auth state (user will be set to null)
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, logoutUser }}>
      {children}
    </AuthContext.Provider>
  );
};
