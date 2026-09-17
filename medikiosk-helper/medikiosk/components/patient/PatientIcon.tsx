/**
 * Crisp inline icons for the patient console.
 * Replaces emoji glyphs that render inconsistently across kiosk devices and
 * Indic font stacks. Visual only — no behaviour, copy or flow changes.
 */
type IconName =
  | "cross"
  | "alert"
  | "assistant"
  | "shield"
  | "lock"
  | "stethoscope"
  | "refresh"
  | "signal";

const paths: Record<IconName, React.ReactNode> = {
  cross: <path d="M12 5v14M5 12h14" />,
  alert: (
    <>
      <path d="M10.6 3.9 2.5 18a1.6 1.6 0 0 0 1.4 2.4h16.2a1.6 1.6 0 0 0 1.4-2.4L13.4 3.9a1.6 1.6 0 0 0-2.8 0Z" />
      <path d="M12 9.5v4.2M12 17.3h.01" />
    </>
  ),
  assistant: (
    <>
      <circle cx="12" cy="8.2" r="3.7" />
      <path d="M5 20.5c0-3.6 3.1-6.3 7-6.3s7 2.7 7 6.3" />
      <path d="M9.4 20.5 12 16l2.6 4.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.2 5 6v5.6c0 4.2 2.9 7.7 7 9.2 4.1-1.5 7-5 7-9.2V6l-7-2.8Z" />
      <path d="M9.3 12.2l1.9 1.9 3.5-3.6" />
    </>
  ),
  lock: (
    <>
      <rect x="4.8" y="10.4" width="14.4" height="9.8" rx="2.4" />
      <path d="M8.4 10.4V7.8a3.6 3.6 0 0 1 7.2 0v2.6" />
    </>
  ),
  stethoscope: (
    <>
      <path d="M6 3.4v5a4.2 4.2 0 0 0 8.4 0v-5" />
      <path d="M10.2 12.6v3.1a4.3 4.3 0 0 0 8.6 0v-1.4" />
      <circle cx="18.8" cy="12.4" r="1.9" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.7-6" />
      <path d="M20.4 4.4V10h-5.6" />
    </>
  ),
  signal: (
    <>
      <path d="M3.6 9.4a12 12 0 0 1 16.8 0" />
      <path d="M7 12.9a7.2 7.2 0 0 1 10 0" />
      <path d="M12 17.6h.01" />
    </>
  ),
};

export default function PatientIcon({
  name,
  size = 20,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ flex: "none" }}
    >
      {paths[name]}
    </svg>
  );
}
