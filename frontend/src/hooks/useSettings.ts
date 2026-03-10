"use client";

import { useCallback, useEffect, useState } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

interface CredentialStatus {
  ANTHROPIC_API_KEY: boolean;
  DHAN_ACCESS_TOKEN: boolean;
  DHAN_CLIENT_ID: boolean;
}

interface SettingsState {
  loading: boolean;
  allConfigured: boolean;
  status: CredentialStatus;
}

export function useSettings() {
  const [state, setState] = useState<SettingsState>({
    loading: true,
    allConfigured: false,
    status: { ANTHROPIC_API_KEY: false, DHAN_ACCESS_TOKEN: false, DHAN_CLIENT_ID: false },
  });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/settings`);
      if (!res.ok) return;
      const data = (await res.json()) as { status: CredentialStatus; allConfigured: boolean };
      setState({ loading: false, allConfigured: data.allConfigured, status: data.status });
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  const save = useCallback(
    async (patch: Partial<Record<keyof CredentialStatus, string>>) => {
      const res = await fetch(`${BACKEND_URL}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error: string };
        throw new Error(err.error ?? "Failed to save settings");
      }
      await refresh();
      window.dispatchEvent(new Event("credentials-updated"));
    },
    [refresh]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh, save };
}
