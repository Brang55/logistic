import { combineReducers, configureStore } from "@reduxjs/toolkit";

import { setupListeners } from "@reduxjs/toolkit/query";

import { driversApi } from "./features/driver/driverSlice";
import { trucksApi } from "./features/driver/truckSlice";
import { trailersApi } from "./features/driver/trailerSlice";
import { cargosApi } from "./features/driver/cargoSlice";
import { authApi } from "./features/driver/authSlice";

const rootReducer = combineReducers({
  [driversApi.reducerPath]: driversApi.reducer,
  [trucksApi.reducerPath]: trucksApi.reducer,
  [trailersApi.reducerPath]: trailersApi.reducer,
  [cargosApi.reducerPath]: cargosApi.reducer,
  [authApi.reducerPath]: authApi.reducer,
});

const store = configureStore({
  reducer: rootReducer,

  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(
      driversApi.middleware,
      trucksApi.middleware,
      trailersApi.middleware,
      cargosApi.middleware,
      authApi.middleware
    ),
});

console.log("hello store");

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;

setupListeners(store.dispatch);
