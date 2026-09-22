"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { EVENT_TYPES } from "@/lib/catalog";
import { hppCall } from "@/lib/client";

type Device = {
  id?: string;
  deviceName?: string;
  deviceSerial?: string;
  deviceOnlineStatus?: number;
  healthStatus?: string;
  siteName?: string;
  deviceType?: string;
};

type EventItem = {
  id: string;
  type: string;
  label: string;
  serial: string;
  format: string;
  receivedAt: Date;
  data: unknown;
};

function eventType(data: unknown) {
  if (data && typeof data === "object" && "eventType" in data) {
    return String((data as { eventType?: string }).eventType ?? "unknown");
  }
  if (typeof data === "string") {
    return (
      data.match(/<eventType>([^<]+)<\/eventType>/i)?.[1] ??
      data.match(/"eventType"\s*:\s*"([^"]+)"/)?.[1] ??
      "raw"
    );
  }
  return "unknown";
}

function typeLabel(type: string) {
  return EVENT_TYPES.find((item) => item.type.toLowerCase() === type.toLowerCase())?.label ?? type;
}

function severity(type: string) {
  const value = type.toLowerCase();
  if (/(offline|error|full|loss|intrusion|field|line|tamper|shelter)/.test(value)) return "critical";
  if (/(online|recover|added)/.test(value)) return "ok";
  return "info";
}

export default function DashboardPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Monitor detenido");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const stop = useRef(false);

  useEffect(() => () => {
    stop.current = true;
  }, []);

  async function refreshDevices() {
    setLoading(true);
    try {
      const response = await hppCall({
        path: "/api/hpcgw/v1/device/list",
        body: { page: 1, pageSize: 100 },
      });
      const result = response.result as { data?: { rows?: Device[] }; errorCode?: string };
      if (result?.errorCode === "0") setDevices(result.data?.rows ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function monitor() {
    stop.current = false;
    setRunning(true);
    setStatus("Suscribiendo todos los dispositivos…");
    const subscription = await hppCall({
      path: "/api/hpcgw/v1/mq/subscribe",
      body: { subType: 1, subMode: "all" },
    });
    const subscriptionResult = subscription.result as { errorCode?: string; message?: string };
    if (subscriptionResult?.errorCode !== "0") {
      setStatus(`No se pudo suscribir: ${subscriptionResult?.message ?? subscriptionResult?.errorCode ?? "error"}`);
      setRunning(false);
      return;
    }

    while (!stop.current) {
      setStatus("Escuchando eventos de HPP…");
      const response = await hppCall({
        path: "/api/hpcgw/v1/mq/messages",
        timeoutMs: 25_000,
      });
      const result = response.result as {
        errorCode?: string;
        message?: string;
        data?: {
          batchId?: string;
          list?: Array<{ deviceSerial?: string; formatType?: string; alarmData?: unknown }>;
        };
      };
      if (result?.errorCode && result.errorCode !== "0") {
        setStatus(`Error ${result.errorCode}: ${result.message ?? "reintentando"}`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      const rows = result?.data?.list ?? [];
      if (rows.length) {
        const receivedAt = new Date();
        setEvents((previous) => [
          ...rows.map((row, index) => {
            const type = eventType(row.alarmData);
            return {
              id: `${result.data?.batchId ?? receivedAt.getTime()}-${index}`,
              type,
              label: typeLabel(type),
              serial: row.deviceSerial ?? "Sin serial",
              format: row.formatType ?? "—",
              receivedAt,
              data: row.alarmData,
            };
          }),
          ...previous,
        ].slice(0, 200));
        if (result.data?.batchId) {
          await hppCall({
            path: "/api/hpcgw/v1/mq/offset",
            body: { batchId: result.data.batchId },
          });
        }
        setStatus(`${rows.length} evento(s) recibido(s) y confirmados`);
        void refreshDevices();
      } else {
        setStatus("Sin eventos nuevos; escuchando…");
      }
    }
    setRunning(false);
    setStatus("Monitor detenido");
  }

  const visibleEvents = useMemo(
    () => filter === "all" ? events : events.filter((item) => severity(item.type) === filter),
    [events, filter],
  );
  const online = devices.filter((item) => item.deviceOnlineStatus === 1).length;
  const faults = devices.filter((item) => item.healthStatus === "fault").length;
  const critical = events.filter((item) => severity(item.type) === "critical").length;

  return (
    <>
      <header className="page-head dashboard-head">
        <div>
          <span className="eyebrow">Centro operativo</span>
          <h2>Dashboard unificado</h2>
          <p>Estado de la instalación y eventos de todos los dispositivos en una sola vista.</p>
        </div>
        <div className="btn-row">
          <button className="btn" disabled={loading} onClick={() => void refreshDevices()}>
            {loading ? "Actualizando…" : "Actualizar estado"}
          </button>
          <button className="btn primary" disabled={running} onClick={() => void monitor()}>
            Iniciar monitoreo
          </button>
          <button className="btn danger" disabled={!running} onClick={() => {
            stop.current = true;
            setRunning(false);
            setStatus("Monitor detenido");
          }}>
            Detener
          </button>
        </div>
      </header>

      <div className="dashboard-status">
        <span className={`live-dot ${running ? "active" : ""}`} />
        {status}
        <span className="dashboard-memory">Los eventos se conservan solo en esta pestaña.</span>
      </div>

      <section className="metric-grid">
        <article className="neu metric">
          <span>Dispositivos</span>
          <strong>{devices.length}</strong>
          <small>{online} en línea</small>
        </article>
        <article className="neu metric">
          <span>Salud</span>
          <strong className={faults ? "text-danger" : "text-ok"}>{faults}</strong>
          <small>con falla reportada</small>
        </article>
        <article className="neu metric">
          <span>Eventos</span>
          <strong>{events.length}</strong>
          <small>en esta sesión</small>
        </article>
        <article className="neu metric">
          <span>Críticos</span>
          <strong className={critical ? "text-danger" : ""}>{critical}</strong>
          <small>requieren revisión</small>
        </article>
      </section>

      <div className="dashboard-layout">
        <section className="neu event-console">
          <div className="section-title">
            <div>
              <h3>Actividad en vivo</h3>
              <p className="desc">MQ long-poll unifica alarmas, fallas y cambios de estado.</p>
            </div>
            <div className="event-filters">
              {[
                ["all", "Todos"],
                ["critical", "Críticos"],
                ["ok", "Recuperación"],
                ["info", "Otros"],
              ].map(([value, label]) => (
                <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="event-list">
            {!visibleEvents.length && (
              <div className="empty-state">
                <strong>Sin actividad</strong>
                <span>Inicia el monitoreo para recibir eventos de todos los dispositivos.</span>
              </div>
            )}
            {visibleEvents.map((item) => (
              <details className={`event-row ${severity(item.type)}`} key={item.id}>
                <summary>
                  <span className="event-icon">{severity(item.type) === "critical" ? "!" : "•"}</span>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.serial} · {item.format}</small>
                  </span>
                  <time>{item.receivedAt.toLocaleTimeString()}</time>
                </summary>
                <pre className="result">
                  {typeof item.data === "string" ? item.data : JSON.stringify(item.data, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        </section>

        <aside className="dashboard-side">
          <section className="neu">
            <div className="section-title">
              <h3>Dispositivos</h3>
              <Link href="/dispositivos">Administrar</Link>
            </div>
            <div className="compact-devices">
              {!devices.length && <p className="desc">Pulsa “Actualizar estado” para cargar el inventario.</p>}
              {devices.slice(0, 12).map((device) => (
                <div key={device.id ?? device.deviceSerial}>
                  <span className={`device-dot ${device.deviceOnlineStatus === 1 ? "online" : "offline"}`} />
                  <span>
                    <strong>{device.deviceName ?? device.deviceSerial}</strong>
                    <small>{device.siteName ?? "Sin sitio"} · {device.healthStatus ?? "salud n/d"}</small>
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="neu quick-links">
            <h3>Acciones rápidas</h3>
            <Link href="/alarmas">Defensa y fotos de alarma</Link>
            <Link href="/audio">Emitir audio o TTS</Link>
            <Link href="/sitios">Gestionar sitios</Link>
            <Link href="/ayuda">Cómo funciona el lab</Link>
          </section>
        </aside>
      </div>
    </>
  );
}
