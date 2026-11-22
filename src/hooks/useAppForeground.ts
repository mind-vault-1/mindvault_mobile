import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

/**
 * Calls `onForeground` each time the app returns to the foreground from the
 * background or inactive state. Not called on mount.
 */
export function useAppForeground(onForeground: () => void) {
  const callbackRef = useRef(onForeground);
  callbackRef.current = onForeground;

  useEffect(() => {
    let previous: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener("change", (next) => {
      if (previous !== "active" && next === "active") {
        callbackRef.current();
      }
      previous = next;
    });

    return () => subscription.remove();
  }, []);
}
