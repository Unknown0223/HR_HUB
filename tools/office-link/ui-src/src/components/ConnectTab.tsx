import { useEffect, useRef, useState } from "react";
import { Card, Field, Row, TextInput, Button, StatusText } from "./ui";
import {
  KeyIcon,
  NetworkIcon,
  DeviceIcon,
  PinIcon,
  LockIcon,
  ChevronIcon,
  SearchIcon,
  RefreshIcon,
  ClipboardIcon,
  SaveIcon,
  EyeIcon,
  EyeOffIcon,
  CheckIcon,
  CloudIcon,
} from "./icons";
import type { LinkSession } from "../hooks/useLinkSession";
import type { LocationRow } from "../bridge/linkApi";

function Dropdown({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string | null;
  placeholder: string;
  options: LocationRow[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = options.find((o) => o.id === value)?.label ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative min-w-0 flex-1" ref={ref}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="fluent-input flex h-8 w-full items-center gap-2.5 px-2.5 text-left text-[13px]"
      >
        <span className="shrink-0 text-[#605E5C]">
          <PinIcon />
        </span>
        <span className={`flex-1 truncate ${label ? "text-[#1A1A1A]" : "text-[#8A8886]"}`}>
          {label ?? placeholder}
        </span>
        <span className={`text-[#605E5C] transition-transform ${open ? "rotate-180" : ""}`}>
          <ChevronIcon width={12} height={12} />
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-[#E5E5E5] bg-[#F9F9F9] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.14)]"
        >
          {options.length === 0 && (
            <li className="px-3 py-2 text-[12px] text-[#8A8886]">Нет локаций — обновите список</li>
          )}
          {options.map((o) => {
            const sel = o.id === value;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={sel}
                  onClick={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                  className={`relative flex h-8 w-full items-center rounded px-3 text-left text-[13px] text-[#1A1A1A] hover:bg-[#00000010] ${
                    sel ? "fluent-selected bg-[#00000008]" : ""
                  }`}
                >
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ConnectTab({ session }: { session: LinkSession }) {
  const s = session;
  const boundOk = !!(s.boundWeb && s.boundWeb !== "—");

  return (
    <Card
      title="Параметры подключения"
      description="Это приложение привязано к указанному web. Для другого клиента скачайте новый пакет с того же web."
      action={
        <span className="mt-0.5 shrink-0 rounded-full bg-[#F3F3F3] px-2 py-[2px] text-[11px] text-[#605E5C]">
          {s.readyCount} / {s.checks.length} готово
        </span>
      }
    >
      <div className="flex items-center gap-2.5 rounded-md border border-[#E5E5E5] bg-[#FAFAFA] px-3 py-2">
        <span className="text-[#1E3A5F]">
          <CloudIcon />
        </span>
        <span className="truncate font-mono text-[12px] text-[#1A1A1A]">
          {s.boundWeb || "—"}
          {s.tenantLabel ? ` · ${s.tenantLabel}` : ""}
        </span>
        {boundOk && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] text-[#0F5F0F]">
            <CheckIcon width={11} height={11} strokeWidth={2} />
            привязан
          </span>
        )}
      </div>

      {s.alert && (
        <div
          className={`mt-3 rounded-md border px-3 py-2 text-[12.5px] ${
            s.alert.kind === "ok"
              ? "border-[#9FD89F] bg-[#DFF6DD] text-[#0F5F0F]"
              : s.alert.kind === "danger"
                ? "border-[#F1A9A9] bg-[#FDE7E9] text-[#A4262C]"
                : "border-[#F0D78C] bg-[#FFF4CE] text-[#835C00]"
          }`}
        >
          {s.alert.text}
          {s.locked && (
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => void s.unlockAuth()}
            >
              Сбросить блокировку
            </button>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-5">
        <Field
          step={1}
          label="Pairing-токен"
          done={s.checks[0].ok}
          help="Выдаётся в web-панели: Терминалы → Добавить терминал"
          status={
            <StatusText ok={s.tokenSaved}>{s.tokenSaved ? "сохранён" : "не сохранён"}</StatusText>
          }
        >
          <Row>
            <TextInput
              type="password"
              value={s.token}
              onChange={s.setToken}
              mono
              icon={<KeyIcon />}
              placeholder="Из Web → Связь с офисом"
            />
            <Button icon={<ClipboardIcon />} onClick={() => void s.pasteToken()} disabled={s.busy}>
              Вставить
            </Button>
            <Button icon={<SaveIcon />} onClick={() => void s.saveToken()} disabled={s.busy}>
              Сохранить
            </Button>
          </Row>
        </Field>

        <Field
          step={2}
          label="IP-адрес"
          hint="необязательно"
          done={!!s.selectedHost}
          help="Оставьте пустым, чтобы искать во всей локальной сети"
        >
          <Row>
            <TextInput
              value={s.ip}
              onChange={s.setIp}
              mono
              icon={<NetworkIcon />}
              placeholder="Автопоиск"
            />
            <Button icon={<SearchIcon />} onClick={() => void s.scan()} disabled={s.busy}>
              Найти
            </Button>
          </Row>
        </Field>

        <Field
          step={3}
          label="Найденные терминалы"
          done={s.checks[1].ok}
          status={
            <StatusText ok={!!s.selectedHost}>
              {s.selectedHost
                ? `выбран · ${s.selectedHost}`
                : s.devices.length
                  ? "не выбран"
                  : "поиск не выполнен"}
            </StatusText>
          }
          help={s.scanMeta || (s.devices.length ? `Найдено: ${s.devices.length}` : "Нажмите «Найти»")}
        >
          <ul
            role="listbox"
            aria-label="Найденные терминалы"
            className="win-scroll max-h-[112px] overflow-y-auto rounded-md border border-[#E5E5E5] bg-white p-1"
          >
            {s.devices.length === 0 && (
              <li className="px-3 py-2 text-[12px] text-[#8A8886]">Список пуст</li>
            )}
            {s.devices.map((t) => {
              const active = t.host === s.selectedHost;
              const mark = t.ok === true || t.needPick ? "✓" : t.ok === false ? "✗" : "•";
              return (
                <li key={`${t.host}:${t.port || 80}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => void s.chooseDevice(t.host, t.port || 80)}
                    className={`relative flex h-9 w-full items-center gap-2.5 rounded px-3 text-left ${
                      active ? "bg-[#2563EB] text-white" : "text-[#1A1A1A] hover:bg-[#F3F3F3]"
                    }`}
                  >
                    <DeviceIcon className={active ? "text-white" : "text-[#605E5C]"} />
                    <span className="font-mono text-[13px]">
                      {mark} {t.host}
                    </span>
                    <span className={active ? "text-white/60" : "text-[#8A8886]"}>·</span>
                    <span className="truncate font-mono text-[13px]">{t.name || "Hikvision"}</span>
                    {t.serialNumber && (
                      <span
                        className={`ml-auto shrink-0 font-mono text-[11px] ${
                          active ? "text-white/70" : "text-[#8A8886]"
                        }`}
                      >
                        S/N {t.serialNumber}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Field>

        <Field
          step={4}
          label="Локация"
          done={s.checks[2].ok}
          help="К этой локации будут относиться все отметки с терминала"
          status={
            <StatusText ok={!!s.locationId}>
              {s.locationLabel ?? "требуется выбор"}
            </StatusText>
          }
        >
          <Row>
            <Dropdown
              value={s.locationId}
              placeholder="Выберите локацию"
              options={s.locations}
              onChange={(id) => void s.selectLocation(id)}
            />
            <Button
              icon={<RefreshIcon />}
              onClick={() => void s.refreshLocations()}
              disabled={s.busy}
            >
              Обновить
            </Button>
          </Row>
        </Field>

        <Field
          step={5}
          label="Текущий пароль администратора"
          done={s.checks[3].ok}
          help="Пароль от терминала Hikvision, не от HR HUB"
          status={
            <StatusText ok={s.pwdVerified}>
              {s.pwdVerified ? "проверен" : "не проверен"}
            </StatusText>
          }
        >
          <Row>
            <TextInput
              type={s.showPwd ? "text" : "password"}
              value={s.adminPwd}
              onChange={s.setAdminPwd}
              mono
              icon={<LockIcon />}
            />
            <Button
              icon={s.showPwd ? <EyeOffIcon /> : <EyeIcon />}
              onClick={s.toggleShowPwd}
            >
              {s.showPwd ? "Скрыть" : "Показать"}
            </Button>
            <Button onClick={() => void s.probePasswords()} disabled={s.busy}>
              Проверить на всех
            </Button>
          </Row>
        </Field>
      </div>
    </Card>
  );
}
