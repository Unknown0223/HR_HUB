import { DeviceIcon, LinkIcon, CheckIcon } from "./icons";
import type { StatusPayload } from "../bridge/linkApi";

export function Header({
  step,
  boundWeb,
  tenantLabel,
}: {
  step: 1 | 2;
  boundWeb: string;
  tenantLabel?: string;
}) {
  const webLine = [boundWeb, tenantLabel ? `tenant=${tenantLabel}` : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="relative shrink-0 overflow-hidden bg-[#1E3A5F] px-5 pb-5 pt-4 text-white">
      <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full border-[28px] border-white/[0.04]" />
      <div className="pointer-events-none absolute -right-2 top-10 h-24 w-24 rounded-full border-[14px] border-white/[0.04]" />

      <div className="relative flex items-start gap-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
          <LinkIcon width={22} height={22} strokeWidth={1.4} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em]">HR HUB Link</h1>
          <p className="mt-1 text-[12.5px] leading-snug text-white/85">
            Одноразовая привязка терминала · дальше отметки идут без этой программы
          </p>
        </div>
      </div>

      <div className="relative mt-4 flex items-center justify-between gap-4">
        <p className="truncate font-mono text-[11px] text-white/60">
          Привязанный web: {webLine || "—"}
        </p>
        <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-white/70">
          <span className={`h-1.5 w-6 rounded-full ${step === 1 ? "bg-white" : "bg-white/30"}`} />
          <span className={`h-1.5 w-6 rounded-full ${step === 2 ? "bg-white" : "bg-white/30"}`} />
          <span className="ml-1">Шаг {step} из 2</span>
        </div>
      </div>
    </div>
  );
}

function kindColor(kind?: string) {
  if (kind === "ok") return { dot: "bg-[#107C10]", badge: "bg-[#DFF6DD] text-[#0F5F0F]", label: "ONLINE" };
  if (kind === "danger") return { dot: "bg-[#C42B1C]", badge: "bg-[#FDE7E9] text-[#A4262C]", label: "ERROR" };
  if (kind === "warn") return { dot: "bg-[#F7630C]", badge: "bg-[#FFF4CE] text-[#835C00]", label: "WARN" };
  return { dot: "bg-[#2563EB]", badge: "bg-[#EEF3FD] text-[#1E3A5F]", label: "READY" };
}

export function StatusStrip({
  status,
  device,
}: {
  status: StatusPayload;
  device: { name?: string; host?: string; state?: string };
}) {
  const colors = kindColor(status.kind);
  const name = device.name && device.name !== "—" ? device.name : "—";
  const host = device.host && device.host !== "—" ? device.host : "—";

  return (
    <section className="rounded-lg border border-[#E5E5E5] bg-white">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#F3F3F3] text-[#1E3A5F]">
          <DeviceIcon width={22} height={22} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className={`absolute inline-flex h-full w-full rounded-full ${colors.dot} opacity-25`} />
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${colors.dot}`} />
            </span>
            <span className="text-[14px] font-semibold text-[#1A1A1A]">
              {status.title || "Статус"}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-[1px] text-[10.5px] font-semibold tracking-wide ${colors.badge}`}
            >
              {status.kind === "ok" && <CheckIcon width={10} height={10} strokeWidth={2} />}
              {status.badge || colors.label}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[13px] text-[#1A1A1A]">
            Устройство: <span className="font-mono">{name}</span>
            <span className="mx-2 text-[#D0D0D0]">|</span>
            <span className="font-mono">{host}</span>
          </div>
        </div>

        <div className="hidden shrink-0 border-l border-[#EDEDED] pl-4 text-right sm:block">
          <div className="text-[11px] uppercase tracking-wide text-[#8A8886]">Состояние</div>
          <div className="text-[13px] text-[#605E5C]">{status.sub || device.state || "—"}</div>
        </div>
      </div>
    </section>
  );
}
