import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Doctor Console — MediKiosk",
  description: "Physician review console for MediKiosk patient cases",
};

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {children}
    </div>
  );
}
