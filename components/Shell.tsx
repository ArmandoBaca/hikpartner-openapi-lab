"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV } from "@/lib/catalog";
import { loadSession, type SessionInfo } from "@/lib/client";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<SessionInfo>({ connected: false });

  useEffect(() => {
    const refresh = () => {
      loadSession().then(setSession).catch(() => setSession({ connected: false }));
    };
    refresh();
    window.addEventListener("hpp-session", refresh);
    return () => window.removeEventListener("hpp-session", refresh);
  }, [pathname]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <h1>HPP OpenAPI Lab</h1>
          <p>V2.15.500 · cookies · Vercel</p>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={pathname === item.href ? "active" : ""}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="session-pill">
          {session.connected ? (
            <>
              <strong>Sesión activa</strong>
              {session.appKeyMasked}
              <div>{session.areaDomain}</div>
            </>
          ) : (
            <>
              <strong>Sin sesión</strong>
              Pega API Key en Conexión. Nada se guarda en el servidor.
            </>
          )}
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
