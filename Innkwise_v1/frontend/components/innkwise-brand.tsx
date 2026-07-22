import type { HTMLAttributes } from "react";

type PointMarkProps = HTMLAttributes<SVGSVGElement> & {
  title?: string;
};

export function PointMark({ className = "", title, ...props }: PointMarkProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} {...props}>
      {title ? <title>{title}</title> : null}
      <circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M32.2 27.6c2.5.1 4.3 1.9 4.1 4.6-.2 2.5-2 4.2-4.7 4.1-2.4-.1-4.1-1.8-4-4.5.1-2.4 1.9-4.3 4.6-4.2Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BrandLockup({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center ${compact ? "gap-2" : "gap-2.5"} ${className}`}>
      <PointMark className={compact ? "h-7 w-7 shrink-0" : "h-9 w-9 shrink-0"} />
      <span className={`${compact ? "text-[15px]" : "text-xl"} font-bold tracking-[-0.035em]`}>innkwise</span>
    </span>
  );
}
