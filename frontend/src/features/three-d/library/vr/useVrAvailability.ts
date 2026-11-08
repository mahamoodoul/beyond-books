import { useEffect, useState } from "react";

export type VrAvailability = "checking" | "ready" | "no-headset" | "needs-https";

/** Whether this browser can start an immersive VR session right now. */
export function useVrAvailability(): VrAvailability {
  const [status, setStatus] = useState<VrAvailability>("checking");
  useEffect(() => {
    // browsers hide navigator.xr entirely on plain http, so report that first
    if (typeof window === "undefined" || !window.isSecureContext) {
      setStatus("needs-https");
      return;
    }
    const xr = navigator.xr;
    if (!xr) {
      setStatus("no-headset");
      return;
    }
    let live = true;
    const check = () => {
      xr.isSessionSupported("immersive-vr")
        .then((yes) => live && setStatus(yes ? "ready" : "no-headset"))
        .catch(() => live && setStatus("no-headset"));
    };
    check();
    // a PC headset can be plugged in while the page is open
    xr.addEventListener("devicechange", check);
    return () => {
      live = false;
      xr.removeEventListener("devicechange", check);
    };
  }, []);
  return status;
}
