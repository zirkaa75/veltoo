"use client";

import type { ReactNode } from "react";

type PortalSplashScreenProps = {
  portal: "admin" | "business";
  welcome: string;
  showSplashTransition?: boolean;
  children: ReactNode;
};

export default function PortalSplashScreen({
  portal,
  welcome,
  showSplashTransition = false,
  children,
}: PortalSplashScreenProps) {
  return (
    <main className={`auth-page portal-entry-page ${portal}-auth-page`}>
      {showSplashTransition && (
        <div className="portal-splash-transition" aria-hidden="true">
          <div className="portal-splash-identity">
            <span className="portal-splash-mark">V</span>
            <span className="portal-splash-name">VELTO</span>
          </div>
          <p>{welcome}</p>
        </div>
      )}
      <header className="portal-entry-header">
        <div className="brand portal-entry-brand" aria-label="VELTO">
          <span className="brand-mark">V</span><span>VELTO</span>
        </div>
        <p>{welcome}</p>
      </header>
      <div className="portal-entry-content">{children}</div>
      <p className="portal-entry-footer">VELTO · {portal === "admin" ? "SUPER ADMIN" : "BUSINESS WORKSPACE"} · © 2026</p>
    </main>
  );
}
