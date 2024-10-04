import {
  useDeleteTrailerMutation,
  useFetchTrailersQuery,
  useLoadTrailerQuery,
} from "../../../app/features/driver/trailerSlice";
import { Loader } from "../../Loader/Loader";
import { useState } from "react";
import { Confirm } from "../../Confirm/Confirm";
import AddTrailerForm from "../AddTrailer/AddTrailerForm/AddTrailerForm";
import { EntityItem } from "../../Entity/EntityItem/EntityItem";
import { EntityList } from "../../Entity/EntityList/EntityList";
import AddTrailer from "../AddTrailer/AddTrailer";

import { Trailer } from "./Trailer";

const TrailersList = () => {
  const { data: trailers, isError, isLoading } = useFetchTrailersQuery();
  const [deleteTrailer] = useDeleteTrailerMutation();
  const [editTrailerForm, setEditTrailerForm] = useState<boolean>(false);
  const [confirm, setConfirm] = useState<boolean>(false);
  const [clickedTrailer, setClickedTrailer] = useState<string>("");

  const { data: trailer, isLoading: isTrailerLoading } = useLoadTrailerQuery(
    clickedTrailer,
    { skip: !clickedTrailer }
  );

  const headings = ["Trailer", "Trailer No", "Options"];
  const entityFields: Array<keyof Trailer> = ["trailer", "trailerNumber"];

  if (isError) {
    return <h1>There is an error</h1>;
  }

  if (isLoading) {
    return <Loader />;
  }

  const onDeleteClick = (id: string) => {
    setConfirm(true);
    setClickedTrailer(id);
  };

  const onEditClick = (id: string) => {
    setClickedTrailer(id);
    setEditTrailerForm(true);
  };

  const handleDeleteTrailer = async (clickedTrailer: string) => {
    try {
      await deleteTrailer(clickedTrailer);
      setConfirm(false);
    } catch (err) {
      return { error: err };
    }
  };

  return (
    <>
      <AddTrailer />
      {trailers && (
        <EntityList<Trailer>
          data={trailers}
          renderItem={(item: Trailer) => (
            // @ts-expect-error not a final version
            <EntityItem<Trailer>
              key={item.id}
              entityFields={entityFields}
              item={item}
              onDeleteClick={onDeleteClick}
              onEditClick={onEditClick}
            />
          )}
          headings={headings}
        />
      )}
      {editTrailerForm && trailer && !isTrailerLoading && (
        <AddTrailerForm
          id={trailer?.id}
          open={editTrailerForm}
          onClose={() => setEditTrailerForm(false)}
          trailer={trailer?.trailer}
          status={trailer?.status}
          trailerNumber={trailer?.trailerNumber}
          editTrailerForm={editTrailerForm}
        />
      )}
      {confirm && (
        <Confirm
          show={confirm}
          onConfirm={() => handleDeleteTrailer(clickedTrailer)}
          onCancel={() => setConfirm(false)}
          truckName={clickedTrailer}
        />
      )}
    </>
  );
};

export default TrailersList;
