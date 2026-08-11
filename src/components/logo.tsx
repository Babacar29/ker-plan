type LogoProps = {
  className?: string;
  variant?: "color" | "mono-light";
};

export function LogoMark({ className, variant = "color" }: LogoProps) {
  const stroke = variant === "mono-light" ? "#FFFFFF" : "#1d1d1f";
  const accent = variant === "mono-light" ? "#2997ff" : "#0066cc";

  return (
    <svg
      viewBox="0 0 72 72"
      fill="none"
      className={className}
      role="img"
      aria-label="ker-plan"
    >
      <path
        d="M12 34L36 12L60 34"
        stroke={stroke}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="18" y="34" width="36" height="26" rx="3" stroke={stroke} strokeWidth="4.5" />
      <rect x="30" y="44" width="12" height="16" fill={accent} />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-[0.6rem] ${className ?? ""}`}>
      <LogoMark className="h-10 w-10" />
      <span className="text-[1.6rem] font-semibold tracking-[-0.03em]">
        <span className="text-[#1d1d1f] dark:text-white">ker</span>
        <span className="text-[#0066cc]">-plan</span>
      </span>
    </div>
  );
}
