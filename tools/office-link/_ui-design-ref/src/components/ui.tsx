import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Card({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-[#E5E5E5] bg-white ${className}`}>
      {title && (
        <div className="flex items-start justify-between gap-4 border-b border-[#EDEDED] px-4 py-3">
          <div>
            <h2 className="text-[15px] font-semibold leading-tight text-[#1A1A1A]">{title}</h2>
            {description && (
              <p className="mt-1 text-[12.5px] leading-snug text-[#605E5C]">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

export function Field({
  step,
  label,
  hint,
  done,
  help,
  status,
  children,
}: {
  step?: number;
  label: string;
  hint?: string;
  done?: boolean;
  help?: string;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      {step !== undefined && (
        <div className="flex w-5 shrink-0 justify-center pt-[1px]">
          {done ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#107C10] text-white">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8.5l3 3 7-7" />
              </svg>
            </span>
          ) : (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#EEF3FD] text-[11px] font-semibold text-[#2563EB]">
              {step}
            </span>
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <label className="mb-1.5 block text-[13px] font-medium text-[#1A1A1A]">
          {label}
          {hint && <span className="ml-1 font-normal text-[#605E5C]">({hint})</span>}
        </label>
        {children}
        {(help || status) && (
          <div className="mt-1.5 flex items-start justify-between gap-3 text-[11.5px] leading-snug">
            <span className="text-[#8A8886]">{help}</span>
            {status && <span className="shrink-0">{status}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export function StatusText({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 ${ok ? "text-[#0F5F0F]" : "text-[#8A8886]"}`}>
      {ok ? (
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8.5l3 3 7-7" />
        </svg>
      ) : (
        <span className="inline-block h-[5px] w-[5px] rounded-full bg-[#C8C6C4]" />
      )}
      {children}
    </span>
  );
}

export function TextInput({
  value,
  onChange,
  type = "text",
  placeholder,
  mono,
  readOnly,
  icon,
}: {
  value: string;
  onChange?: (v: string) => void;
  type?: "text" | "password";
  placeholder?: string;
  mono?: boolean;
  readOnly?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className="fluent-input flex h-8 min-w-0 flex-1 items-center">
      {icon && <span className="ml-2.5 shrink-0 text-[#605E5C]">{icon}</span>}
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        className={`h-full w-full min-w-0 bg-transparent px-2.5 text-[13px] text-[#1A1A1A] outline-none placeholder:text-[#8A8886] ${
          mono ? "font-mono tracking-tight" : ""
        }`}
      />
    </div>
  );
}

export function Button({
  children,
  variant = "default",
  icon,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "accent";
  icon?: ReactNode;
}) {
  const base =
    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 px-3 text-[13px] select-none outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A] focus-visible:ring-offset-1 whitespace-nowrap";
  const v =
    variant === "accent" ? "fluent-btn-accent font-semibold" : "fluent-btn text-[#1A1A1A]";
  return (
    <button type="button" className={`${base} ${v} ${className}`} {...rest}>
      {icon && <span className="-ml-0.5 shrink-0 opacity-80">{icon}</span>}
      {children}
    </button>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>;
}
