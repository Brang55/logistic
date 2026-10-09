import { io, Socket } from "socket.io-client";
import { tokenStore } from "./tokenStore";

let socket: Socket | undefined;
let users = 0;

/**
 * One shared connection to the API's /live namespace. Each subscriber calls
 * `acquireLiveSocket()` and the returned release function; the socket closes when the
 * last subscriber releases it.
 */
export function acquireLiveSocket(): [Socket, () => void] {
  socket ??= io("/live", {
    // Called on every (re)connect so a refreshed access token is used.
    auth: (cb) => cb({ token: tokenStore.get()?.accessToken }),
    transports: ["websocket"],
  });
  users += 1;
  const current = socket;
  let released = false;
  return [
    current,
    () => {
      if (released) return;
      released = true;
      users -= 1;
      if (users === 0) {
        current.close();
        socket = undefined;
      }
    },
  ];
}
