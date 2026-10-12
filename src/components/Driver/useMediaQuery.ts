import { useEffect, useState } from "react";

// From this width driver pages put the map in its own column next to the details.
export const WIDE_QUERY = "(min-width: 1100px)";

export const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
};
