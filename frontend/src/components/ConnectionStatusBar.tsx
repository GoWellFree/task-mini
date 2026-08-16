import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { useOnlineStatus } from "../lib/useOnlineStatus";

export function ConnectionStatusBar() {
  const online = useOnlineStatus();
  const [showRestored, setShowRestored] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!online) {
      setWasOffline(true);
      return;
    }
    if (wasOffline) {
      setShowRestored(true);
      const t = setTimeout(() => {
        setShowRestored(false);
        setWasOffline(false);
      }, 2200);
      return () => clearTimeout(t);
    }
  }, [online, wasOffline]);

  if (online && !showRestored) return null;

  return (
    <div
      className={`fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-1.5 py-2 pt-[env(safe-area-inset-top)] text-xs font-medium text-white ${
        online ? "bg-success" : "bg-danger"
      }`}
    >
      {online ? <Wifi size={13} /> : <WifiOff size={13} />}
      {online ? "Соединение восстановлено" : "Нет соединения"}
    </div>
  );
}
