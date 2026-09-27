import { useEffect, useState } from "react";
import { Button } from "./ui";
import { CheckIcon } from "./icons";

const STEPS = [
  "Проверка pairing-токена на сервере",
  "Авторизация на терминале",
  "Запись адреса сервера в терминал",
  "Тестовая отметка и подтверждение",
];

export function ConnectDialog({
  open,
  location,
  onClose,
}: {
  open: boolean;
  location: string | null;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!open) {
      setCurrent(0);
      return;
    }
    if (current >= STEPS.length) return;
    const t = setTimeout(() => setCurrent((c) => c + 1), 900);
    return () => clearTimeout(t);
  }, [open, current]);

  if (!open) return null;
  const done = current >= STEPS.length;
  const progress = Math.round((Math.min(current, STEPS.length) / STEPS.length) * 100);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/30 p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
        className="w-full max-w-[440px] overflow-hidden rounded-lg border border-[#DADADA] bg-[#F9F9F9] shadow-[0_32px_64px_rgba(0,0,0,0.28)]"
      >
        <div className="px-6 pb-5 pt-6">
          <h3 id="dlg-title" className="text-[20px] font-semibold text-[#1A1A1A]">
            {done ? "Терминал привязан" : "Подключение терминала"}
          </h3>
          <p className="mt-1 text-[13px] text-[#605E5C]">
            {done
              ? "Отметки теперь идут с терминала на сервер напрямую. Эту программу можно закрыть."
              : "Не выключайте терминал и не закрывайте окно."}
          </p>

          {/* Progress bar */}
          <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-[#E0E0E0]">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                done ? "bg-[#107C10]" : "bg-[#2563EB]"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <ul className="mt-4 space-y-2">
            {STEPS.map((s, i) => {
              const state = i < current ? "done" : i === current ? "active" : "pending";
              return (
                <li key={s} className="flex items-center gap-2.5 text-[13px]">
                  {state === "done" && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#107C10] text-white">
                      <CheckIcon width={10} height={10} strokeWidth={2.2} />
                    </span>
                  )}
                  {state === "active" && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#2563EB] border-t-transparent" />
                  )}
                  {state === "pending" && (
                    <span className="h-4 w-4 rounded-full border border-[#C8C6C4]" />
                  )}
                  <span className={state === "pending" ? "text-[#8A8886]" : "text-[#1A1A1A]"}>
                    {s}
                  </span>
                </li>
              );
            })}
          </ul>

          {done && (
            <div className="mt-4 rounded-md border border-[#E5E5E5] bg-white px-3 py-2.5 text-[12.5px]">
              <div className="flex justify-between py-0.5">
                <span className="text-[#605E5C]">Терминал</span>
                <span className="font-mono text-[#1A1A1A]">DS-A7EDF7C1 · 192.168.100.127</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-[#605E5C]">Локация</span>
                <span className="text-[#1A1A1A]">{location ?? "—"}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-[#605E5C]">Сервер</span>
                <span className="font-mono text-[#1A1A1A]">http://127.0.0.1:3001</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#E5E5E5] bg-[#F3F3F3] px-6 py-4">
          {done ? (
            <>
              <Button onClick={onClose}>Остаться</Button>
              <Button variant="accent" onClick={onClose} className="min-w-[120px]">
                Готово
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>Отмена</Button>
          )}
        </div>
      </div>
    </div>
  );
}
