import { useState } from "react";
import { TitleBar } from "./components/TitleBar";
import { Header, StatusStrip } from "./components/Header";
import { FlowDiagram } from "./components/FlowDiagram";
import { ConnectTab } from "./components/ConnectTab";
import { RecoveryTab } from "./components/RecoveryTab";
import { ConnectDialog } from "./components/ConnectDialog";
import { ResizeHandles } from "./components/ResizeHandles";
import { Button } from "./components/ui";
import { LinkIcon } from "./components/icons";
import { useLinkSession } from "./hooks/useLinkSession";

type TabId = "connect" | "recovery";

const TABS: { id: TabId; label: string }[] = [
  { id: "connect", label: "1. Подключение" },
  { id: "recovery", label: "2. Восстановление" },
];

export default function App() {
  const [tab, setTab] = useState<TabId>("connect");
  const session = useLinkSession();

  return (
    <div className="flex h-full min-h-full flex-col bg-[#F3F3F3]">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden border border-[#B9BEC6] bg-[#F3F3F3]">
        <ResizeHandles />
        <TitleBar
          boundWeb={session.boundWeb}
          onMinimize={session.windowMinimize}
          onMaximize={session.windowToggleMaximize}
          onClose={session.windowClose}
        />
        <Header
          step={tab === "connect" ? 1 : 2}
          boundWeb={session.boundWeb}
          tenantLabel={session.tenantLabel}
        />

        <div className="win-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex flex-col gap-4 px-5 pb-5 pt-4">
            <StatusStrip status={session.status} device={session.device} />
            <FlowDiagram
              deviceName={session.device.name}
              deviceHost={session.device.host || session.ip}
              serverLabel={session.boundWeb || session.webUrl}
            />

            <div role="tablist" className="flex gap-1 rounded-md border border-[#E5E5E5] bg-[#EAEAEA] p-1">
              {TABS.map((t) => {
                const active = t.id === tab;
                return (
                  <button
                    key={t.id}
                    role="tab"
                    type="button"
                    aria-selected={active}
                    disabled={session.busy && !session.connectOpen}
                    onClick={() => setTab(t.id)}
                    className={`relative h-8 flex-1 rounded text-[13px] transition-colors ${
                      active
                        ? "bg-white font-semibold text-[#1A1A1A] shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                        : "text-[#605E5C] hover:bg-white/60 hover:text-[#1A1A1A]"
                    }`}
                  >
                    {t.label}
                    {active && (
                      <span className="absolute bottom-0 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full bg-[#2563EB]" />
                    )}
                  </button>
                );
              })}
            </div>

            {tab === "connect" ? (
              <ConnectTab session={session} />
            ) : (
              <RecoveryTab session={session} />
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-[#E5E5E5] bg-white px-5 py-3">
          {tab === "connect" ? (
            <>
              <div className="min-w-0">
                {session.formReady ? (
                  <>
                    <div className="text-[13px] font-medium text-[#0F5F0F]">Всё готово к подключению</div>
                    <div className="text-[12px] text-[#605E5C]">
                      После привязки программу можно закрыть.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[13px] font-medium text-[#1A1A1A]">
                      Готово {session.readyCount} из {session.checks.length}
                    </div>
                    <div className="text-[12px] text-[#605E5C]">
                      Осталось: {session.nextHint?.toLowerCase()}
                    </div>
                  </>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="mr-1 flex items-center gap-1" aria-hidden="true">
                  {session.checks.map((c) => (
                    <span
                      key={c.label}
                      className={`h-1.5 w-1.5 rounded-full ${c.ok ? "bg-[#107C10]" : "bg-[#D0D0D0]"}`}
                    />
                  ))}
                </div>
                <Button
                  variant="accent"
                  icon={<LinkIcon />}
                  disabled={!session.formReady || session.busy}
                  title={session.formReady ? undefined : `Сначала: ${session.nextHint}`}
                  onClick={() => void session.startConnect()}
                  className="h-9 min-w-[150px] px-6 text-[14px] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Подключить
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[12px] leading-snug text-[#605E5C]">
                Восстановление не меняет привязку — только сеть и туннель.
              </p>
              <Button className="h-9" onClick={() => setTab("connect")}>
                ← К подключению
              </Button>
            </>
          )}
        </div>

        <ConnectDialog
          open={session.connectOpen}
          done={session.connectDone}
          step={session.connectStep}
          location={session.locationLabel}
          deviceName={session.device.name}
          deviceHost={session.device.host || session.ip}
          server={session.boundWeb || session.webUrl}
          onClose={() => session.setConnectOpen(false)}
          onFinish={() => {
            session.setConnectOpen(false);
            session.windowClose();
          }}
        />

        {session.busy && !session.connectOpen && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/25"
            onClick={session.cancelBusy}
            role="status"
          >
            <div className="rounded-lg border border-[#E5E5E5] bg-white px-5 py-4 text-center shadow-lg">
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#2563EB] border-t-transparent" />
              <div className="text-[14px] font-medium text-[#1A1A1A]">
                {session.busyText || "Подождите…"}
              </div>
              <div className="mt-1 text-[12px] text-[#8A8886]">Esc / клик — отмена ожидания</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
