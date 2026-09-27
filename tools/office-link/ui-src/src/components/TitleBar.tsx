import { useEffect, useRef, useState } from "react";

function AppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1" y="1" width="14" height="14" rx="3.5" fill="#1E3A5F" />
      <path
        d="M4.5 11.5v-7M4.5 8h3.5M8 11.5v-7"
        stroke="#fff"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="11.5" cy="8" r="1.4" fill="#5EB0FF" />
    </svg>
  );
}

function CaptionButton({
  label,
  children,
  close,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  close?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.();
      }}
      className={`flex h-full w-[46px] items-center justify-center text-[#1A1A1A] transition-colors ${
        close ? "hover:bg-[#C42B1C] hover:text-white" : "hover:bg-[#00000012]"
      }`}
      style={{ WebkitAppRegion: "no-drag", appRegion: "no-drag" } as React.CSSProperties}
    >
      {children}
    </button>
  );
}

export function TitleBar({
  onMinimize,
  onMaximize,
  onClose,
  boundWeb,
}: {
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
  boundWeb?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  return (
    <div className="shrink-0 select-none bg-[#F3F3F3]">
      <div className="flex h-8 items-stretch">
        <div className="pywebview-drag-region flex flex-1 items-center gap-2 pl-3 pr-2">
          <AppIcon />
          <span className="text-[12px] text-[#1A1A1A]">HR HUB Link</span>
        </div>

        <div className="relative flex items-center" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={`rounded px-2 py-[3px] text-[12px] text-[#1A1A1A] hover:bg-[#00000012] ${
              menuOpen ? "bg-[#00000012]" : ""
            }`}
          >
            Админ
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute left-0 top-full z-30 mt-1 w-60 rounded-lg border border-[#E5E5E5] bg-[#F9F9F9] p-1 text-[13px] shadow-[0_8px_24px_rgba(0,0,0,0.14)]"
            >
              {boundWeb && boundWeb !== "—" && (
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    try {
                      window.open(boundWeb, "_blank");
                    } catch {
                      /* ignore */
                    }
                  }}
                  className="block w-full rounded px-3 py-1.5 text-left text-[#1A1A1A] hover:bg-[#00000010]"
                >
                  Открыть web-панель…
                </button>
              )}
              <div className="my-1 border-t border-[#E5E5E5]" />
              <button
                role="menuitem"
                type="button"
                onClick={() => setMenuOpen(false)}
                className="block w-full rounded px-3 py-1.5 text-left text-[#1A1A1A] hover:bg-[#00000010]"
              >
                О программе · HR HUB Link
              </button>
            </div>
          )}
        </div>

        <div className="flex items-stretch">
          <CaptionButton label="Свернуть" onClick={onMinimize}>
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
            </svg>
          </CaptionButton>
          <CaptionButton label="Развернуть" onClick={onMaximize}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="0.5" y="0.5" width="9" height="9" rx="1.5" stroke="currentColor" />
            </svg>
          </CaptionButton>
          <CaptionButton label="Закрыть" close onClick={onClose}>
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
            </svg>
          </CaptionButton>
        </div>
      </div>
    </div>
  );
}
