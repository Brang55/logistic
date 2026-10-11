import { createContext, ReactNode, useSyncExternalStore } from "react";
import { useDispatch } from "react-redux";
import { api } from "../app/api/base";
import { tokenStore } from "../app/tokenStore";
import {
  AuthUser,
  useLogoutUserMutation,
  useMeQuery,
} from "../app/api/auth";

// Define the shape of the auth context
interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  logoutUser: () => Promise<void>;
}

// Create the context
export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);

// The signed-in user is whoever /auth/me returns for the stored access token.
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const dispatch = useDispatch();
  const hasTokens = useSyncExternalStore(tokenStore.subscribe, tokenStore.hasTokens);
  const { data, isFetching } = useMeQuery(undefined, { skip: !hasTokens });
  const [logout] = useLogoutUserMutation();

  const user = hasTokens ? data ?? null : null;
  const loading = hasTokens && !user && isFetching;

  const logoutUser = async () => {
    const refreshToken = tokenStore.get()?.refreshToken;
    tokenStore.clear();
    // Drop cached data so the next user never sees the previous user's records.
    dispatch(api.util.resetApiState());
    if (refreshToken) await logout(refreshToken);
  };

  return (
    <AuthContext.Provider value={{ user, loading, logoutUser }}>
      {children}
    </AuthContext.Provider>
  );
};
