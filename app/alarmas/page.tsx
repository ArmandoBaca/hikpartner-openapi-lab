"use client";

import { useEffect, useRef, useState } from "react";
import { DevicePicker } from "@/components/DevicePicker";
import { ModulePage } from "@/components/ModulePage";
import { hppCall } from "@/lib/client";

type AlarmItem = {
  id: string;
  deviceSerial?: string;
  formatType?: string;
  eventType?: string;
  alarmData?: unknown;
  at: string;
};

function extractType(alarmData: unknown): string {
  if (!alarmData) return "unknown";
  if (typeof alarmData === "object" && alarmData && "eventType" in alarmData) {
    return String((alarmData as { eventType?: string }).eventType);
  }
  if (typeof alarmData === "string") {
    const m = alarmData.match(/<eventType>([^<]+)<\/eventType>/i) || alarmData.match(/"eventType"\s*:\s*"([^"]+)"/);
    if (m) return m[1];
  }
  return "raw";
}

function AlarmWall() {
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<AlarmItem[]>([]);
  const [status, setStatus] = useState("Parado");
  const [picturePath, setPicturePath] = useState("");
  const [pictureOut, setPictureOut] = useState("");
  const [scope, setScope] = useState<"all" | "list">("all");
  const [selectedSerials, setSelectedSerials] = useState<string[]>([]);
  const stop = useRef(false);

  useEffect(() => {
    return () => {
      stop.current = true;
    };
  }, []);

  async function loop() {
    if (scope === "list" && !selectedSerials.length) {
      setStatus("Selecciona al menos un dispositivo");
      return;
    }
    stop.current = false;
    setRunning(true);
    const subscriptionBody = {
      subType: 1,
      subMode: scope,
      ...(scope === "list" ? { deviceSerialList: selectedSerials } : {}),
    };
    setStatus(scope === "all" ? "Suscribiendo todos los dispositivos…" : `Suscribiendo ${selectedSerials.length} dispositivo(s)…`);
    const subscription = await hppCall({
      path: "/api/hpcgw/v1/mq/subscribe",
      body: subscriptionBody,
    });
    const subscriptionResult = subscription.result as { errorCode?: string; message?: string } | undefined;
    if (subscriptionResult?.errorCode !== "0") {
      setStatus(`No se pudo suscribir: ${subscriptionResult?.message ?? subscriptionResult?.errorCode ?? "error"}`);
      setRunning(false);
      return;
    }
    while (!stop.current) {
      setStatus("Esperando mq/messages (~20 s)…");
      const res = await hppCall({
        path: "/api/hpcgw/v1/mq/messages",
        timeoutMs: 25_000,
      });
      const result = res.result as {
        errorCode?: string;
        data?: { batchId?: string; list?: Array<{ deviceSerial?: string; formatType?: string; alarmData?: unknown }> };
        message?: string;
      };
      if (result?.errorCode && result.errorCode !== "0") {
        setStatus(`error ${result.errorCode} ${result.message ?? ""}`);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      const list = result?.data?.list ?? [];
      const batchId = result?.data?.batchId;
      if (list.length) {
        setItems((prev) =>
          [
            ...list.map((row) => ({
              id: `${batchId}-${Math.random()}`,
              deviceSerial: row.deviceSerial,
              formatType: row.formatType,
              eventType: extractType(row.alarmData),
              alarmData: row.alarmData,
              at: new Date().toLocaleTimeString(),
            })),
            ...prev,
          ].slice(0, 80),
        );
        if (batchId) {
          await hppCall({ path: "/api/hpcgw/v1/mq/offset", body: { batchId } });
        }
        setStatus(`Lote ${batchId || "—"} · ${list.length} evento(s) · ACK enviado`);
      } else {
        setStatus("Sin eventos en este poll");
      }
    }
    setRunning(false);
    setStatus("Parado");
  }

  async function stopMonitor() {
    stop.current = true;
    setRunning(false);
    setStatus("Deteniendo y cancelando suscripción…");
    const body = {
      subType: 0,
      subMode: scope,
      ...(scope === "list" ? { deviceSerialList: selectedSerials } : {}),
    };
    const response = await hppCall({ path: "/api/hpcgw/v1/mq/subscribe", body });
    const result = response.result as { errorCode?: string; message?: string } | undefined;
    setStatus(result?.errorCode === "0" ? "Monitor y suscripción detenidos" : `Monitor detenido · ${result?.message ?? result?.errorCode ?? "sin confirmar baja"}`);
  }

  return (
    <>
      <section className="neu" style={{ marginBottom: 18 }}>
        <div className="section-title">
          <div>
            <h3>Muro de alarmas</h3>
            <p className="desc">
              Elige si HPP debe enviar eventos de toda la cuenta o solo de equipos concretos.
            </p>
          </div>
          <span className={`chip ${running ? "ok" : ""}`}>{running ? "escuchando" : "detenido"}</span>
        </div>
        <div className="scope-picker">
          <button
            className={scope === "all" ? "active" : ""}
            disabled={running}
            onClick={() => {
              setScope("all");
              setItems([]);
            }}
          >
            <strong>Todos los dispositivos</strong>
            <span>Recomendado para el centro de monitoreo</span>
          </button>
          <button
            className={scope === "list" ? "active" : ""}
            disabled={running}
            onClick={() => {
              setScope("list");
              setItems([]);
            }}
          >
            <strong>Elegir dispositivos</strong>
            <span>Pruebas dirigidas o investigación puntual</span>
          </button>
        </div>
        {scope === "list" && (
          <DevicePicker
            selected={selectedSerials}
            onChange={setSelectedSerials}
            hint="La suscripción se limitará a estos seriales. Puedes elegir uno o varios."
          />
        )}
        <p className="desc">
          Alcance actual: <strong>{scope === "all" ? "todos los dispositivos" : `${selectedSerials.length} seleccionado(s)`}</strong>.
          Long-poll desde este navegador; caché de plataforma ~2 h.
        </p>
        <div className="btn-row">
          <button
            className="btn primary"
            disabled={running || (scope === "list" && !selectedSerials.length)}
            onClick={() => void loop()}
          >
            Iniciar muro
          </button>
          <button className="btn danger" disabled={!running} onClick={() => void stopMonitor()}>
            Detener
          </button>
          <button className="btn" disabled={!items.length} onClick={() => setItems([])}>
            Limpiar ({items.length})
          </button>
          <span className="chip">{status}</span>
        </div>
        <div className="alarm-wall" style={{ marginTop: 14 }}>
          {items.length === 0 && <div className="note">Aún no hay eventos en esta pestaña.</div>}
          {items.map((item) => (
            <article key={item.id} className="alarm">
              <header>
                <span className="type">{item.eventType}</span>
                <span>{item.at}</span>
              </header>
              <div className="serial">
                {item.deviceSerial || "Sin serial"} · {item.formatType}
              </div>
              <pre className="result">
                {typeof item.alarmData === "string" ? item.alarmData : JSON.stringify(item.alarmData, null, 2)}
              </pre>
            </article>
          ))}
        </div>
      </section>
      <section className="neu" style={{ marginBottom: 18 }}>
        <h3>Resolver foto ISAPI_FILES</h3>
        <p className="desc">
          Úsalo cuando el payload de una alarma contenga un <code>filePath</code> que empiece por
          ISAPI_FILES. HPP devolverá una URL temporal para visualizar o descargar la imagen.
        </p>
        <label className="label">
          filePath
          <textarea className="field" value={picturePath} onChange={(e) => setPicturePath(e.target.value)} />
        </label>
        <div className="btn-row">
          <button
            className="btn primary"
            onClick={async () => {
              const res = await hppCall({
                path: "/api/hpcgw/v1/alarm/pictureurl",
                body: { filePath: picturePath },
              });
              setPictureOut(JSON.stringify(res, null, 2));
            }}
          >
            Obtener URL
          </button>
        </div>
        {pictureOut && <pre className="result">{pictureOut}</pre>}
      </section>
    </>
  );
}

export default function Page() {
  return <ModulePage slug="alarmas" extra={<AlarmWall />} />;
}
