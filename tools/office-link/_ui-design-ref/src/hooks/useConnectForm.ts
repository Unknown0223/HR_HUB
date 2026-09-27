import { useMemo, useState } from "react";

export const TERMINALS = [
  { ip: "192.168.100.127", model: "DS-A7EDF7C1", mac: "A4:14:37:ED:F7:C1", fw: "V3.2.30" },
];
export const LOCATIONS = ["Главный офис", "Склад №2", "Производство"];

export function useConnectForm() {
  const [token, setToken] = useState("phk_2f9a71c3e0b84d1a9f6c");
  const [tokenSaved, setTokenSaved] = useState(true);
  const [ip, setIp] = useState("192.168.100.127");
  const [selected, setSelected] = useState<number | null>(0);
  const [location, setLocation] = useState<string | null>(null);
  const [adminPwd, setAdminPwd] = useState("Hik12345admin");
  const [pwdVerified, setPwdVerified] = useState(true);
  const [showPwd, setShowPwd] = useState(false);

  const checks = useMemo(
    () => [
      { label: "Токен сохранён", ok: tokenSaved && token.length > 0 },
      { label: "Терминал выбран", ok: selected !== null },
      { label: "Локация выбрана", ok: location !== null },
      { label: "Пароль проверен", ok: pwdVerified && adminPwd.length > 0 },
    ],
    [tokenSaved, token, selected, location, pwdVerified, adminPwd],
  );

  const readyCount = checks.filter((c) => c.ok).length;
  const ready = readyCount === checks.length;
  const nextHint = checks.find((c) => !c.ok)?.label;

  return {
    token,
    setToken: (v: string) => {
      setToken(v);
      setTokenSaved(false);
    },
    tokenSaved,
    saveToken: () => setTokenSaved(token.length > 0),
    ip,
    setIp,
    selected,
    setSelected,
    location,
    setLocation,
    adminPwd,
    setAdminPwd: (v: string) => {
      setAdminPwd(v);
      setPwdVerified(false);
    },
    pwdVerified,
    verifyPwd: () => setPwdVerified(adminPwd.length > 0),
    showPwd,
    toggleShowPwd: () => setShowPwd((s) => !s),
    checks,
    readyCount,
    ready,
    nextHint,
  };
}

export type ConnectForm = ReturnType<typeof useConnectForm>;
