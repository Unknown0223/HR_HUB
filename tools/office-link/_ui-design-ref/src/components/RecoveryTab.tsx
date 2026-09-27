import { Button, Card } from "./ui";
import { WifiIcon, CloudIcon, RefreshIcon } from "./icons";

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

export function RecoveryTab() {
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
          <InfoRow label="Терминал" value="DS-A7EDF7C1 · 192.168.100.127" mono />
          <InfoRow label="Сервер" value="http://127.0.0.1:3001" mono />
          <InfoRow label="Последняя отметка" value="сегодня, 09:42" />
        </div>
        <div className="mt-4 flex justify-end">
          <Button icon={<RefreshIcon />}>Восстановить сеть</Button>
        </div>
      </Card>

      <Card
        title="Диагностика туннеля"
        description="Нужна только при работе через внешний туннель. В локальной сети этот раздел можно не использовать."
        action={
          <span className="mt-0.5 text-[#8A8886]">
            <CloudIcon width={20} height={20} />
          </span>
        }
      >
        <div className="divide-y divide-[#EDEDED]">
          <InfoRow
            label="Процесс"
            value={
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#107C10]" />
                работает · PID 18244
              </span>
            }
          />
          <InfoRow label="URL" value="https://demo-link.trycloudflare.com" mono />
        </div>
        <div className="mt-4 flex justify-end">
          <Button icon={<RefreshIcon />}>Восстановить туннель</Button>
        </div>
      </Card>
    </div>
  );
}
