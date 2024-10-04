import { createContext } from "react";
import store from "../app/store";

const StoreContext = createContext(store);

export default StoreContext;
