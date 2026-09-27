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
import { LOCATIONS, TERMINALS, type ConnectForm } from "../hooks/useConnectForm";

function Dropdown({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string | null;
  placeholder: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
        <span className={`flex-1 truncate ${value ? "text-[#1A1A1A]" : "text-[#8A8886]"}`}>
          {value ?? placeholder}
        </span>
        <span className={`text-[#605E5C] transition-transform ${open ? "rotate-180" : ""}`}>
          <ChevronIcon width={12} height={12} />
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-[#E5E5E5] bg-[#F9F9F9] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.14)]"
        >
          {options.map((o) => {
            const sel = o === value;
            return (
              <li key={o}>
                <button
                  type="button"
                  role="option"
                  aria-selected={sel}
                  onClick={() => {
                    onChange(o);
                    setOpen(false);
                  }}
                  className={`relative flex h-8 w-full items-center rounded px-3 text-left text-[13px] text-[#1A1A1A] hover:bg-[#00000010] ${
                    sel ? "fluent-selected bg-[#00000008]" : ""
                  }`}
                >
                  {o}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ConnectTab({ form }: { form: ConnectForm }) {
  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) form.setToken(text.trim());
    } catch {
      /* clipboard unavailable in mockup */
    }
  };

  return (
    <Card
      title="Параметры подключения"
      description="Это приложение привязано к указанному web. Для другого клиента скачайте новый пакет с того же web."
      action={
        <span className="mt-0.5 shrink-0 rounded-full bg-[#F3F3F3] px-2 py-[2px] text-[11px] text-[#605E5C]">
          {form.readyCount} / {form.checks.length} готово
        </span>
      }
    >
      {/* Bound web */}
      <div className="flex items-center gap-2.5 rounded-md border border-[#E5E5E5] bg-[#FAFAFA] px-3 py-2">
        <span className="text-[#1E3A5F]">
          <CloudIcon />
        </span>
        <span className="truncate font-mono text-[12px] text-[#1A1A1A]">
          http://127.0.0.1:3001 · tenant=demo
        </span>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] text-[#0F5F0F]">
          <CheckIcon width={11} height={11} strokeWidth={2} />
          привязан
        </span>
      </div>

      <div className="mt-5 flex flex-col gap-5">
        <Field
          step={1}
          label="Pairing-токен"
          done={form.checks[0].ok}
          help="Выдаётся в web-панели: Терминалы → Добавить терминал"
          status={
            <StatusText ok={form.tokenSaved}>
              {form.tokenSaved ? "сохранён" : "не сохранён"}
            </StatusText>
          }
        >
          <Row>
            <TextInput type="password" value={form.token} onChange={form.setToken} mono icon={<KeyIcon />} />
            <Button icon={<ClipboardIcon />} onClick={paste}>
              Вставить
            </Button>
            <Button icon={<SaveIcon />} onClick={form.saveToken}>
              Сохранить
            </Button>
          </Row>
        </Field>

        <Field
          step={2}
          label="IP-адрес"
          hint="необязательно"
          done={form.selected !== null}
          help="Оставьте пустым, чтобы искать во всей локальной сети"
        >
          <Row>
            <TextInput value={form.ip} onChange={form.setIp} mono icon={<NetworkIcon />} placeholder="Автопоиск" />
            <Button icon={<SearchIcon />}>Найти</Button>
          </Row>
        </Field>

        <Field
          step={3}
          label="Найденные терминалы"
          done={form.checks[1].ok}
          status={
            <StatusText ok={form.selected !== null}>
              {form.selected !== null ? "выбран 1 из 1" : "не выбран"}
            </StatusText>
          }
          help="Найдено: 1 · последний поиск 09:41"
        >
          <ul
            role="listbox"
            aria-label="Найденные терминалы"
            className="win-scroll max-h-[112px] overflow-y-auto rounded-md border border-[#E5E5E5] bg-white p-1"
          >
            {TERMINALS.map((t, i) => {
              const active = i === form.selected;
              return (
                <li key={t.ip}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => form.setSelected(i)}
                    className={`relative flex h-9 w-full items-center gap-2.5 rounded px-3 text-left ${
                      active ? "bg-[#2563EB] text-white" : "text-[#1A1A1A] hover:bg-[#F3F3F3]"
                    }`}
                  >
                    <DeviceIcon className={active ? "text-white" : "text-[#605E5C]"} />
                    <span className="font-mono text-[13px]">{t.ip}</span>
                    <span className={active ? "text-white/60" : "text-[#8A8886]"}>·</span>
                    <span className="font-mono text-[13px]">{t.model}</span>
                    <span className={`ml-auto font-mono text-[11px] ${active ? "text-white/70" : "text-[#8A8886]"}`}>
                      {t.fw} · {t.mac}
                    </span>
                  </button>
                </li>
              );
            })}
            <li className="h-9" />
          </ul>
        </Field>

        <Field
          step={4}
          label="Локация"
          done={form.checks[2].ok}
          help="К этой локации будут относиться все отметки с терминала"
          status={
            <StatusText ok={form.location !== null}>
              {form.location ?? "требуется выбор"}
            </StatusText>
          }
        >
          <Row>
            <Dropdown
              value={form.location}
              placeholder="Выберите локацию"
              options={LOCATIONS}
              onChange={form.setLocation}
            />
            <Button icon={<RefreshIcon />}>Обновить</Button>
          </Row>
        </Field>

        <Field
          step={5}
          label="Текущий пароль администратора"
          done={form.checks[3].ok}
          help="Пароль от терминала Hikvision, не от HR HUB"
          status={
            <StatusText ok={form.pwdVerified}>
              {form.pwdVerified ? "проверен · 1 из 1" : "не проверен"}
            </StatusText>
          }
        >
          <Row>
            <TextInput
              type={form.showPwd ? "text" : "password"}
              value={form.adminPwd}
              onChange={form.setAdminPwd}
              mono
              icon={<LockIcon />}
            />
            <Button icon={form.showPwd ? <EyeOffIcon /> : <EyeIcon />} onClick={form.toggleShowPwd}>
              {form.showPwd ? "Скрыть" : "Показать"}
            </Button>
            <Button onClick={form.verifyPwd}>Проверить на всех</Button>
          </Row>
        </Field>
      </div>
    </Card>
  );
}
