import { DeviceIcon, CloudIcon, LinkIcon } from "./icons";

function Node({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#EEF3FD] text-[#1E3A5F]">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-[#1A1A1A]">{title}</div>
        <div className="truncate font-mono text-[11px] text-[#605E5C]">{sub}</div>
      </div>
    </div>
  );
}

export function FlowDiagram({
  deviceName,
  deviceHost,
  serverLabel,
}: {
  deviceName?: string;
  deviceHost?: string;
  serverLabel?: string;
}) {
  const term =
    deviceName && deviceName !== "—"
      ? `${deviceName}${deviceHost && deviceHost !== "—" ? ` · ${deviceHost}` : ""}`
      : deviceHost && deviceHost !== "—"
        ? deviceHost
        : "ещё не выбран";
  const server = serverLabel && serverLabel !== "—" ? serverLabel.replace(/^https?:\/\//, "") : "HR HUB";

  return (
    <section className="rounded-lg border border-[#E5E5E5] bg-white px-4 py-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#8A8886]">
          Как это работает
        </span>
        <span className="text-[11px] text-[#605E5C]">после привязки программа не нужна</span>
      </div>

      <div className="flex items-center gap-3">
        <Node icon={<DeviceIcon width={22} height={22} />} title="Терминал" sub={term} />

        <div className="relative flex min-w-[100px] flex-1 flex-col items-center">
          <span className="mb-1 text-[10.5px] font-medium text-[#2563EB]">отметки · напрямую</span>
          <div className="relative h-[2px] w-full rounded-full bg-[#2563EB]">
            <span className="absolute -right-[1px] top-1/2 h-0 w-0 -translate-y-1/2 border-y-[4px] border-l-[7px] border-y-transparent border-l-[#2563EB]" />
          </div>
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-[#E5E5E5] bg-[#FAFAFA] px-2 py-[2px] text-[10.5px] text-[#605E5C]">
            <LinkIcon width={11} height={11} />
            HR HUB Link · настраивает один раз
          </span>
        </div>

        <Node icon={<CloudIcon width={22} height={22} />} title="Сервер HR HUB" sub={server} />
      </div>
    </section>
  );
}
