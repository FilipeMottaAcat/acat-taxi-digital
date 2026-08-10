import { useEffect } from "react";
import { getSocket } from "../lib/socket";
import { useAuth } from "../context/AuthContext";

/** Connects/disconnects the shared socket as the session comes and goes. Mount once, near the app root. */
export function useSocketConnection() {
  const { user } = useAuth();

  useEffect(() => {
    const socket = getSocket();
    if (user) {
      socket.connect();
    } else {
      socket.disconnect();
    }
  }, [user]);
}

/** Subscribes to a server event for the lifetime of the component. */
export function useSocketEvent<T = unknown>(event: string, handler: (payload: T) => void) {
  useEffect(() => {
    const socket = getSocket();
    socket.on(event, handler as (...args: unknown[]) => void);
    return () => {
      socket.off(event, handler as (...args: unknown[]) => void);
    };
  }, [event, handler]);
}
