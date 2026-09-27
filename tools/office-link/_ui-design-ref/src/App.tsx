import { useState } from "react";
import { TitleBar } from "./components/TitleBar";
import { Header, StatusStrip } from "./components/Header";
import { FlowDiagram } from "./components/FlowDiagram";
import { ConnectTab } from "./components/ConnectTab";
import { RecoveryTab } from "./components/RecoveryTab";
import { ConnectDialog } from "./components/ConnectDialog";
import { Button } from "./components/ui";
import { LinkIcon } from "./components/icons";
import { useConnectForm } from "./hooks/useConnectForm";

type TabId = "connect" | "recovery";

const TABS: { id: TabId; label: string }[] = [
  { id: "connect", label: "1. Подключение" },
  { id: "recovery", label: "2. Восстановление" },
];

export default function App() {
  const [tab, setTab] = useState<TabId>("connect");
  const [dialogOpen, setDialogOpen] = useState(false);
  const form = useConnectForm();

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      {/* Window */}
      <div
        className="relative flex h-[760px] w-[600px] min-h-[680px] min-w-[560px] max-w-full flex-col overflow-hidden rounded-lg border border-[#B9BEC6] bg-[#F3F3F3] shadow-[0_32px_64px_rgba(0,0,0,0.22),0_2px_6px_rgba(0,0,0,0.08)]"
        style={{ resize: "both" }}
      >
        <TitleBar />
        <Header step={tab === "connect" ? 1 : 2} />

        {/* Scrollable content */}
        <div className="win-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex flex-col gap-4 px-5 pb-5 pt-4">
            <StatusStrip />
            <FlowDiagram />

            {/* Segmented tabs */}
            <div role="tablist" className="flex gap-1 rounded-md border border-[#E5E5E5] bg-[#EAEAEA] p-1">
              {TABS.map((t) => {
                const active = t.id === tab;
                return (
                  <button
                    key={t.id}
                    role="tab"
                    type="button"
                    aria-selected={active}
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

            {tab === "connect" ? <ConnectTab form={form} /> : <RecoveryTab />}
          </div>
        </div>

        {/* Command bar (installer-style footer) */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-[#E5E5E5] bg-white px-5 py-3">
          {tab === "connect" ? (
            <>
              <div className="min-w-0">
                {form.ready ? (
                  <>
                    <div className="text-[13px] font-medium text-[#0F5F0F]">Всё готово к подключению</div>
                    <div className="text-[12px] text-[#605E5C]">
                      После привязки программу можно закрыть.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[13px] font-medium text-[#1A1A1A]">
                      Готово {form.readyCount} из {form.checks.length}
                    </div>
                    <div className="text-[12px] text-[#605E5C]">
                      Осталось: {form.nextHint?.toLowerCase()}
                    </div>
                  </>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {/* Readiness dots */}
                <div className="mr-1 flex items-center gap-1" aria-hidden="true">
                  {form.checks.map((c) => (
                    <span
                      key={c.label}
                      className={`h-1.5 w-1.5 rounded-full ${c.ok ? "bg-[#107C10]" : "bg-[#D0D0D0]"}`}
                    />
                  ))}
                </div>
                <Button
                  variant="accent"
                  icon={<LinkIcon />}
                  disabled={!form.ready}
                  title={form.ready ? undefined : `Сначала: ${form.nextHint}`}
                  onClick={() => setDialogOpen(true)}
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

        <ConnectDialog open={dialogOpen} location={form.location} onClose={() => setDialogOpen(false)} />
      </div>
    </div>
  );
}
