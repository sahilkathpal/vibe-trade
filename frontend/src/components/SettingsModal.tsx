"use client";

import { useState } from "react";
import { useSettings } from "../hooks/useSettings";

interface Props {
  onSaved: () => void;
  onSkip: () => void;
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx={12} cy={12} r={3} />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22" />
    </svg>
  );
}

const FIELDS: { key: "ANTHROPIC_API_KEY" | "DHAN_ACCESS_TOKEN" | "DHAN_CLIENT_ID"; label: string; placeholder: string }[] = [
  { key: "ANTHROPIC_API_KEY", label: "Anthropic API Key", placeholder: "sk-ant-..." },
  { key: "DHAN_ACCESS_TOKEN", label: "Dhan Access Token", placeholder: "Your Dhan access token" },
  { key: "DHAN_CLIENT_ID", label: "Dhan Client ID", placeholder: "Your Dhan client ID" },
];

export function SettingsModal({ onSaved, onSkip }: Props) {
  const { status, save } = useSettings();
  const [values, setValues] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const patch: Record<string, string> = {};
    for (const { key } of FIELDS) {
      if (values[key]?.trim()) patch[key] = values[key].trim();
    }
    if (Object.keys(patch).length === 0) {
      setError("Please fill in at least one credential.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await save(patch);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-white mb-1">Configure API Credentials</h2>
        <p className="text-sm text-gray-400 mb-5">
          VibeTrade needs your API credentials to connect to Dhan and Claude.
        </p>

        <div className="space-y-4">
          {FIELDS.map(({ key, label, placeholder }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-gray-300">{label}</label>
                {status[key] && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800/40">
                    Configured
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={visible[key] ? "text" : "password"}
                  value={values[key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  placeholder={status[key] ? "Leave blank to keep existing" : placeholder}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-9 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setVisible((v) => ({ ...v, [key]: !v[key] }))}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                >
                  <EyeIcon open={!!visible[key]} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {saving ? "Saving..." : "Save & Continue"}
          </button>
          <button
            onClick={onSkip}
            className="w-full py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Skip for now
          </button>
        </div>

        <p className="mt-3 text-xs text-gray-500 text-center">
          Credentials are stored locally on the server and never shared.
        </p>
      </div>
    </div>
  );
}
