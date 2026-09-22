"use client";

import { useCallback, useEffect, useState } from "react";
import { hppCall } from "@/lib/client";

export type HppDevice = {
  id?: string;
  deviceName?: string;
  deviceSerial?: string;
  deviceOnlineStatus?: number;
  deviceCategory?: number;
  deviceSubCategory?: number;
  deviceType?: string;
  siteName?: string;
};

export type DeviceFetch = { devices: HppDevice[]; error: string };

let pending: Promise<DeviceFetch> | null = null;

export function isSpeaker(device: HppDevice) {
  return device.deviceCategory === 12 && device.deviceSubCategory === 19;
}

export function fetchDevices(force = false): Promise<DeviceFetch> {
  if (!pending || force) {
    pending = hppCall({ path: "/api/hpcgw/v1/device/list", body: { page: 1, pageSize: 100 } })
      .then((response) => {
        const result = response.result as {
          errorCode?: string;
          message?: string;
          data?: { rows?: HppDevice[] };
        } | undefined;
        if (result?.errorCode === "0") {
          return { devices: result.data?.rows ?? [], error: "" };
        }
        const detail =
          result?.message ?? result?.errorCode ?? response.message ?? response.errorCode;
        return { devices: [], error: detail ?? "No se pudo leer el inventario" };
      })
      .catch(() => ({ devices: [], error: "Error de red al consultar dispositivos" }));
  }
  return pending;
}

/** Inventario compartido: una sola llamada a device/list por carga de página. */
export function useDevices() {
  const [devices, setDevices] = useState<HppDevice[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    const result = await fetchDevices(force);
    setDevices(result.devices);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { devices, error, loading, reload: () => load(true) };
}
