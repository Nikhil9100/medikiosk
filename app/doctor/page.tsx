"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  fetchStaffMe,
  staffJson,
  staffLogout,
  StaffAuthError,
  type StaffIdentity,
} from "@/lib/staff-client";
import { SeverityBadge, StatusBadge } from "@/components/badges";

type QueueCase = {
  caseId: string;
  sessionId: string;
  caseStatus: string;
  language: string;
  primaryComplaint: string | null;
  complaintCount: number;
  topSeverity: string | null;
  unreviewedSignals: number;
  documentCount: number;
  documentsProcessing: number;
  demoFlag: boolean;
  createdAt: string;
  completedAt: string | null;
  startedAt: string | null;
  doctorName: string | null;
};

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function DoctorQueuePage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffIdentity | null>(null);
  const [cases, setCases] = useState<QueueCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const identity = await fetchStaffMe();
      setStaff(identity);
      const data = await staffJson<{ cases: QueueCase[] }>("/api/staff/queue");
      setCases(data.cases);
    } catch (err) {
      if (err instanceof StaffAuthError) {
        router.replace("/doctor/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load queue");
    }
  }, [router]);

  useEffect(() => {
    // Standard data-load: load() awaits the network before any setState, so
    // no state is set synchronously during the render commit.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async initial fetch; setState only runs after await
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => clearInterval(timer);
  }, [load]);

  async function handleLogout() {
    await staffLogout();
    router.replace("/doctor/login");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-baseline gap-3">
            <span className="text-sm font-bold uppercase tracking-wider text-indigo-600">MediKiosk</span>
            <h1 className="text-lg font-semibold text-slate-900">Doctor Console</h1>
          </div>
          {staff && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-600">
                {staff.displayName} · <span className="text-slate-400">{staff.email}</span>
              </span>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <h2 className="text-xl font-semibold text-slate-900">Case queue</h2>
        <p className="mt-1 text-sm text-slate-500">
          Live from the shared case store — urgent cases first. Refreshes every 30 seconds.
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {cases === null && !error && (
          <div className="mt-8 text-sm text-slate-400" aria-live="polite">
            Loading queue…
          </div>
        )}

        {cases !== null && cases.length === 0 && (
          <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            No cases waiting. New kiosk completions will appear here.
          </div>
        )}

        {cases !== null && cases.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-3 font-semibold">Case</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Primary complaint</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Severity</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Signals</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Docs</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Waiting</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Doctor</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.sessionId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/doctor/case/${c.sessionId}`} className="font-semibold text-indigo-700 hover:underline">
                        {c.caseId}
                      </Link>
                      <div className="text-xs text-slate-400">{c.language}{c.demoFlag ? " · demo" : ""}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.caseStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-800">{c.primaryComplaint ?? "—"}</span>
                      {c.complaintCount > 1 && (
                        <span className="ml-1.5 text-xs text-slate-400">+{c.complaintCount - 1} more</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{c.topSeverity ? <SeverityBadge severity={c.topSeverity} /> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3">
                      {c.unreviewedSignals > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                          ▲ {c.unreviewedSignals} unreviewed
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">none</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {c.documentCount > 0 ? (
                        <>
                          {c.documentCount}
                          {c.documentsProcessing > 0 && (
                            <span className="ml-1 text-xs text-amber-600">({c.documentsProcessing} processing)</span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{timeAgo(c.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-600">{c.doctorName ?? <span className="text-slate-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
