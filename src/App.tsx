import Navigation from "./components/Navigation/Navigation";

import "./assets/css/styles.css";
import OngoingDelivery from "./components/OngoingDelivery/OngoingDelivery";
import { Route, Routes } from "react-router-dom";
import Dashboard from "./components/Dashboard/Dashboard";
import TruckDriversList from "./components/TruckDrivers/TruckDriversList/TruckDriversList";
import TrucksList from "./components/Trucks/TrucksList/TrucksList";
import TrailersList from "./components/Trailers/TrailersList/TrailersList";
import AddCargoForm from "./components/Cargo/AddCargoForm/AddCargoForm";
import { CargoList } from "./components/Cargo/CargoList/CargoList";
import { CargoPreview } from "./components/Cargo/CargoPreview/CargoPreview";

import Dispatcher from "./components/Dispatcher/Dispatcher";
import LiveFleet from "./components/Fleet/LiveFleet";
import DriverTrip from "./components/Driver/DriverTrip";
import Traffic from "./components/Traffic/Traffic";
import LoadBoard from "./components/LoadBoard/LoadBoard";
import Login from "./components/Account/Login/Login";

import PrivateRoute from "./components/Account/PrivateRoute/PrivateRoute";
import { STAFF } from "./app/roles";

function App() {
  return (
    <>
      <Navigation />
      <main className="main">
        <Routes>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/" element={<Dashboard />} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/dashboard" element={<Dashboard />} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/dispatcher" element={<Dispatcher />} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/fleet" element={<LiveFleet />} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/track" element={<OngoingDelivery />} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/drivers" element={<div className="page"><TruckDriversList /></div>} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/trucks" element={<div className="page"><TrucksList /></div>} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/trailers" element={<div className="page"><TrailersList /></div>} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/cargo" element={<div className="page"><AddCargoForm /></div>} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/cargoList" element={<div className="page"><CargoList /></div>} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/cargoList/:id/preview" element={<div className="page"><CargoPreview /></div>} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/cargoList/:id/edit" element={<div className="page"><AddCargoForm /></div>} />
          </Route>

          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/traffic" element={<Traffic />} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/loadboard" element={<LoadBoard />} />
          </Route>
          <Route element={<PrivateRoute roles={["driver"]} />}>
            <Route path="/driver" element={<DriverTrip />} />
          </Route>

          <Route path="/login" element={<Login />} />
        </Routes>
      </main>
    </>
  );
}

export default App;
