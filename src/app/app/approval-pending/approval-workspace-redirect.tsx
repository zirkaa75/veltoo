"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ApprovalWorkspaceRedirect() {
  const router = useRouter();

  useEffect(() => {
    const refresh = window.setInterval(() => router.refresh(), 2500);
    return () => window.clearInterval(refresh);
  }, [router]);

  return null;
}
