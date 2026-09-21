"use client";

import { useEffect, useRef, useState } from "react";
import { ModulePage } from "@/components/ModulePage";
import { EVENT_TYPES } from "@/lib/catalog";
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
  const stop = useRef(false);

  useEffect(() => {
    return () => {
      stop.current = true;
    };
  }, []);

  async function loop() {
    stop.current = false;
    setRunning(true);
    setStatus("Suscribiendo all…");
    await hppCall({
      path: "/api/hpcgw/v1/mq/subscribe",
      body: { subType: 1, subMode: "all" },
    });
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

  return (
    <>
      <section className="neu" style={{ marginBottom: 18 }}>
        <h3>Muro de alarmas</h3>
        <p className="desc">
          Long-poll desde este navegador. Caché de plataforma ~2 h. Tipos A.4: {EVENT_TYPES.map((e) => e.type).join(", ")}.
        </p>
        <div className="btn-row">
          <button className="btn primary" disabled={running} onClick={() => void loop()}>
            Iniciar muro
          </button>
          <button
            className="btn danger"
            onClick={() => {
              stop.current = true;
              setRunning(false);
            }}
          >
            Detener
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
                {item.deviceSerial} · {item.formatType}
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
