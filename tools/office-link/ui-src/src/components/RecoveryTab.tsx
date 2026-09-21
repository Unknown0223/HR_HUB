import { Button, Card } from "./ui";
import { WifiIcon, CloudIcon, RefreshIcon } from "./icons";
import type { LinkSession } from "../hooks/useLinkSession";

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5 text-[13px]">
      <span className="w-[136px] shrink-0 text-[#605E5C]">{label}</span>
      <span className={`min-w-0 truncate text-[#1A1A1A] ${mono ? "font-mono text-[12px]" : ""}`}>
        {value}
      </span>
    </div>
  );
}

export function RecoveryTab({ session }: { session: LinkSession }) {
  const s = session;
  const term =
    s.device.name && s.device.name !== "—"
      ? `${s.device.name}${s.device.host && s.device.host !== "—" ? ` · ${s.device.host}` : ""}`
      : s.device.host && s.device.host !== "—"
        ? s.device.host
        : s.ip || "—";
  const tunnelOk = /онлайн|online|ok|работа/i.test(String(s.tunnel.state || ""));

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Сеть терминала"
        description="Если терминал перестал отправлять отметки после смены Wi-Fi или роутера — найдём его в сети и заново пропишем адрес сервера."
        action={
          <span className="mt-0.5 text-[#1E3A5F]">
            <WifiIcon width={20} height={20} />
          </span>
        }
      >
        <div className="divide-y divide-[#EDEDED]">
          <InfoRow label="Терминал" value={term} mono />
          <InfoRow label="Сервер" value={s.boundWeb || s.webUrl || "—"} mono />
          <InfoRow label="API" value={s.apiUrl || s.device.apiUrl || "—"} mono />
        </div>
        {s.reconnectSteps.length > 0 && (
          <ol className="mt-3 space-y-1.5 border-t border-[#EDEDED] pt-3 text-[12px]">
            {s.reconnectSteps.map((step, i) => {
              const st = String(step.state || "").toLowerCase();
              const ok = st === "ok" || st === "done" || st === "success";
              const fail = st === "fail" || st === "error";
              const active = st === "active" || st === "pending" || st === "run";
              const color = ok
                ? "text-[#0F5F0F]"
                : fail
                  ? "text-[#A4262C]"
                  : active
                    ? "text-[#1E3A5F]"
                    : "text-[#605E5C]";
              const mark = ok ? "✓" : fail ? "✕" : active ? "●" : "○";
              return (
                <li key={step.id || i} className={`flex gap-2 leading-snug ${color}`}>
                  <span className="w-3 shrink-0 font-semibold" aria-hidden="true">
                    {mark}
                  </span>
                  <span>
                    <span className={ok ? "font-medium" : undefined}>
                      {step.label || step.id}
                    </span>
                    {step.detail ? ` — ${step.detail}` : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        <div className="mt-4 flex justify-end">
          <Button icon={<RefreshIcon />} onClick={() => void s.reconnect()} disabled={s.busy}>
            Восстановить сеть
          </Button>
        </div>
      </Card>

      <Card
        title="Диагностика туннеля"
        description="Внешний Cloudflare-туннель или LAN: если лимит Cloudflare активен, «Восстановить туннель» объявит локальный IP терминала API (достаточно для сервера в той же сети)."
        action={
          <span className="mt-0.5 text-[#8A8886]">
            <CloudIcon width={20} height={20} />
          </span>
        }
      >
        <div className="divide-y divide-[#EDEDED]">
          <InfoRow
            label="Состояние"
            value={
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${tunnelOk ? "bg-[#107C10]" : "bg-[#C8C6C4]"}`}
                />
                {s.tunnel.state || "не проверено"}
              </span>
            }
          />
          <InfoRow label="URL" value={s.tunnel.url || "—"} mono />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => void s.checkTunnel()} disabled={s.busy}>
            Проверить
          </Button>
          <Button icon={<RefreshIcon />} onClick={() => void s.restoreTunnel()} disabled={s.busy}>
            Восстановить туннель
          </Button>
        </div>
      </Card>
    </div>
  );
}
