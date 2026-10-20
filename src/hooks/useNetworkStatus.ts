import { useEffect, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

interface UseNetworkStatusOptions {
  onReconnect?: () => void;
}

export function useNetworkStatus({ onReconnect }: UseNetworkStatusOptions = {}) {
  const [isOffline, setIsOffline] = useState(false);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = !state.isConnected;
      setIsOffline(offline);

      // Fire onReconnect only when transitioning from offline to online
      // (not on first mount when wasOfflineRef is still false)
      if (wasOfflineRef.current && !offline && onReconnect) {
        onReconnect();
      }

      wasOfflineRef.current = offline;
    });

    return () => {
      unsubscribe();
    };
  }, [onReconnect]);

  return { isOffline };
}
