/** `accent`: kelas warna token untuk busur (mis. "text-gold"); default ikut warna teks. */
export function Spinner({ size = 18, accent = "" }: { size?: number; accent?: string }) {
  return (
    <svg className="spin flex-none" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".25" />
      <path className={accent} d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2.2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2.2" />
  </svg>
);

/** `className`: kelas warna token (mis. "text-err-icon"); default ikut warna teks. */
export const AlertIcon = ({ className = "" }: { className?: string }) => (
  <svg className={`flex-none ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.2" />
    <path d="M12 7v6M12 16.5v.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);
