import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hospital Console — MediKiosk",
  description: "Operations console for the MediKiosk kiosk network",
};

export default function HospitalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {children}
    </div>
  );
}
