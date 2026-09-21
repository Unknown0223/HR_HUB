import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  callApi,
  waitForApi,
  type AlertPayload,
  type BootstrapData,
  type DeviceInfo,
  type DeviceRow,
  type LocationRow,
  type StatusPayload,
  type TunnelInfo,
} from "../bridge/linkApi";

export type ConnectStepState = "idle" | "running" | "done" | "error";

export function useLinkSession() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState("");
  const [token, setTokenRaw] = useState("");
  const [tokenSaved, setTokenSaved] = useState(false);
  const [ip, setIp] = useState("");
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [selectedHost, setSelectedHost] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [adminPwd, setAdminPwdRaw] = useState("");
  const [pwdVerified, setPwdVerified] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [status, setStatus] = useState<StatusPayload>({
    title: "Загрузка…",
    sub: "Устройство: —",
    kind: "accent",
    badge: "…",
  });
  const [alert, setAlert] = useState<AlertPayload | null>(null);
  const [device, setDevice] = useState<DeviceInfo>({});
  const [tunnel, setTunnel] = useState<TunnelInfo>({});
  const [boundWeb, setBoundWeb] = useState("—");
  const [tenantLabel, setTenantLabel] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [webUrl, setWebUrl] = useState("");
  const [locked, setLocked] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectStep, setConnectStep] = useState(0);
  const [connectDone, setConnectDone] = useState(false);
  const [reconnectSteps, setReconnectSteps] = useState<
    { id?: string; label?: string; state?: string; detail?: string }[]
  >([]);
  const [scanMeta, setScanMeta] = useState("");
  const busyTimer = useRef<number | null>(null);
  const pollTimer = useRef<number | null>(null);

  const locationLabel = useMemo(() => {
    const row = locations.find((l) => l.id === locationId);
    return row?.label ?? null;
  }, [locations, locationId]);

  const selectedDevice = useMemo(
    () => devices.find((d) => d.host === selectedHost) ?? null,
    [devices, selectedHost],
  );

  const checks = useMemo(
    () => [
      { label: "Токен сохранён", ok: tokenSaved && token.trim().length > 0 },
      { label: "Терминал выбран", ok: !!selectedHost },
      { label: "Локация выбрана", ok: !!locationId },
      { label: "Пароль проверен", ok: pwdVerified && adminPwd.trim().length > 0 },
    ],
    [tokenSaved, token, selectedHost, locationId, pwdVerified, adminPwd],
  );
  const readyCount = checks.filter((c) => c.ok).length;
  const formReady = readyCount === checks.length;
  const nextHint = checks.find((c) => !c.ok)?.label;

  const clearBusyTimer = () => {
    if (busyTimer.current) {
      window.clearTimeout(busyTimer.current);
      busyTimer.current = null;
    }
  };

  const startBusy = useCallback((text: string) => {
    setBusy(true);
    setBusyText(text);
    clearBusyTimer();
    busyTimer.current = window.setTimeout(() => {
      setBusy(false);
      setAlert({
        text: "Операция слишком долгая. Попробуйте ещё раз или проверьте сеть/терминал.",
        kind: "warn",
      });
      setStatus({
        title: "Таймаут",
        sub: "Операция прервана",
        kind: "warn",
        badge: "TIMEOUT",
      });
    }, 90000);
  }, []);

  const stopBusy = useCallback(() => {
    clearBusyTimer();
    setBusy(false);
    setBusyText("");
  }, []);

  const applyDevices = useCallback((rows: DeviceRow[], preferHost?: string) => {
    setDevices(rows);
    if (!rows.length) {
      setSelectedHost(null);
      return;
    }
    const prefer =
      (preferHost && rows.find((d) => d.host === preferHost)?.host) ||
      rows.find((d) => d.ok === true || d.needPick)?.host ||
      rows[0]?.host ||
      null;
    setSelectedHost(prefer);
    if (prefer) setIp(prefer);
  }, []);

  const applyBootstrap = useCallback(
    (data: BootstrapData | null) => {
      if (!data) return;
      setTenantLabel(data.tenantName || data.tenantCode || "Офисный клиент");
      setBoundWeb(data.boundWeb || data.webUrl || "—");
      setWebUrl(data.webUrl || "");
      setApiUrl(data.apiUrl || "");
      const tok = data.token || "";
      setTokenRaw(tok);
      setTokenSaved(!!tok.trim());
      if (data.ip) setIp(data.ip);
      setLocations(data.locations || []);
      setLocationId(data.locationId || null);
      if (data.status) setStatus(data.status);
      setAlert(data.alert || null);
      if (data.device) setDevice(data.device);
      if (data.tunnel) setTunnel(data.tunnel);
    },
    [],
  );

  const handlersRef = useRef<{
    onScanDone: (result: any) => void;
    onProbeDone: (result: any) => void;
    onConnectProgress: (result: any) => void;
    onConnectDone: (result: any) => void;
    onReconnectProgress: (steps: any) => void;
    onReconnectDone: (result: any) => void;
    onTunnelDone: (result: any) => void;
    onLocations: (result: any) => void;
  }>(null as any);

  handlersRef.current = {
    onScanDone(result: any) {
      stopBusy();
      if (!result) return;
      if (result.ok === false) {
        setAlert({ text: result.message || "Поиск не удался", kind: "danger" });
        setStatus({
          title: "Ошибка поиска",
          sub: result.message || "",
          kind: "danger",
          badge: "ОШИБКА",
        });
        applyDevices([]);
        return;
      }
      if (result.ip && !result.needPick) setIp(result.ip);
      applyDevices(result.devices || [], result.ip || "");
      const n = (result.devices || []).length;
      setScanMeta(n ? `Найдено: ${n}` : "Ничего не найдено");
      if (result.status) setStatus(result.status);
      if (result.device) setDevice(result.device);
      if (result.alert) setAlert(result.alert);
      else setAlert(null);
    },
    onProbeDone(result: any) {
      stopBusy();
      if (!result) return;
      if (result.ip && result.reason === "ok") setIp(result.ip);
      applyDevices(result.devices || [], result.ip || "");
      if (result.reason === "ok" || result.status?.kind === "ok") setPwdVerified(true);
      if (result.status) setStatus(result.status);
      if (result.alert) setAlert(result.alert);
      if (result.device) setDevice(result.device);
    },
    onConnectProgress(result: any) {
      if (result?.status) setStatus(result.status);
      setConnectStep((s) => Math.min(s + 1, 3));
    },
    onConnectDone(result: any) {
      stopBusy();
      if (!result) {
        setConnectOpen(false);
        return;
      }
      if (result.clearPassword) {
        setAdminPwdRaw("");
        setPwdVerified(false);
      }
      if (result.status) setStatus(result.status);
      if (result.alert) setAlert(result.alert);
      else setAlert(null);
      if (result.device) setDevice(result.device);
      if (result.tunnel) setTunnel(result.tunnel);
      if (result.devices) applyDevices(result.devices, result.ip || undefined);
      if (result.needPick && result.ip) setIp(result.ip);
      if (result.needPick && Array.isArray(result.matches)) {
        applyDevices(
          result.matches.map((m: DeviceRow) => ({ ...m, ok: true, needPick: true })),
          result.ip,
        );
      }
      setLocked(!!result.locked);
      const linkedOk =
        result.device?.state === "linked" ||
        result.status?.badge === "ОК" ||
        /подключено|привязка|подтвержден/i.test(String(result.status?.title || ""));
      if (linkedOk && !result.locked && !result.needPick) {
        setConnectDone(true);
        setConnectStep(4);
      } else {
        setConnectDone(false);
        setConnectOpen(false);
      }
    },
    onReconnectProgress(steps: any) {
      setReconnectSteps(Array.isArray(steps) ? steps : []);
    },
    onReconnectDone(result: any) {
      stopBusy();
      if (!result) return;
      if (result.status) setStatus(result.status);
      if (result.alert) setAlert(result.alert);
      if (result.device) setDevice(result.device);
      if (result.tunnel) setTunnel(result.tunnel);
      if (result.steps) setReconnectSteps(result.steps);
      if (result.needPick && Array.isArray(result.matches)) {
        applyDevices(
          result.matches.map((m: DeviceRow) => ({ ...m, ok: true, needPick: true })),
        );
      }
    },
    onTunnelDone(result: any) {
      stopBusy();
      if (!result) return;
      if (result.tunnel) setTunnel(result.tunnel);
      if (result.status) setStatus(result.status);
      if (result.alert) setAlert(result.alert);
    },
    onLocations(result: any) {
      stopBusy();
      if (!result) return;
      setLocations(result.locations || []);
      if (result.locationId) setLocationId(result.locationId);
      if (result.alert) setAlert(result.alert);
    },
  };

  useEffect(() => {
    const map: Record<string, (p: any) => void> = {
      setBusy: (on: any) => (on ? startBusy(String(on)) : stopBusy()),
      setAlert: (a: any) => setAlert(a || null),
      setStatus: (s: any) => s && setStatus(s),
      fillBootstrap: applyBootstrap,
      fillLocations: (items: any, selectedId?: string) => {
        setLocations(items || []);
        if (selectedId) setLocationId(selectedId);
      },
      fillDevice: (d: any) => d && setDevice(d),
      fillDeviceList: (rows: any, host?: string) => applyDevices(rows || [], host),
      fillTunnel: (t: any) => t && setTunnel(t),
      onConnectProgress: (p) => handlersRef.current.onConnectProgress(p),
      onScanDone: (p) => handlersRef.current.onScanDone(p),
      onProbeDone: (p) => handlersRef.current.onProbeDone(p),
      onConnectDone: (p) => handlersRef.current.onConnectDone(p),
      onReconnectProgress: (p) => handlersRef.current.onReconnectProgress(p),
      onReconnectDone: (p) => handlersRef.current.onReconnectDone(p),
      onTunnelDone: (p) => handlersRef.current.onTunnelDone(p),
      onLocations: (p) => handlersRef.current.onLocations(p),
    };
    window.__hrhub = map;

    let cancelled = false;
    const drain = async () => {
      try {
        const batch = await callApi<any[]>("poll_events");
        if (!Array.isArray(batch)) return;
        for (const evt of batch) {
          if (!evt?.fn) continue;
          const fn = window.__hrhub?.[evt.fn];
          if (typeof fn === "function") fn(evt.payload);
        }
      } catch {
        /* ignore */
      }
    };

    (async () => {
      await waitForApi();
      if (cancelled) return;
      const data = await callApi<BootstrapData>("bootstrap");
      applyBootstrap(data);
      setReady(true);
      await drain();
      pollTimer.current = window.setInterval(drain, 200);
    })();

    const onReady = () => {
      void (async () => {
        const data = await callApi<BootstrapData>("bootstrap");
        applyBootstrap(data);
        setReady(true);
        await drain();
      })();
    };
    window.addEventListener("pywebviewready", onReady);

    return () => {
      cancelled = true;
      window.removeEventListener("pywebviewready", onReady);
      if (pollTimer.current) window.clearInterval(pollTimer.current);
      clearBusyTimer();
    };
  }, [applyBootstrap, applyDevices, startBusy, stopBusy]);

  const setToken = (v: string) => {
    setTokenRaw(v);
    setTokenSaved(false);
  };

  const setAdminPwd = (v: string) => {
    setAdminPwdRaw(v);
    setPwdVerified(false);
  };

  const pasteToken = async () => {
    const text = await callApi<string>("clipboard_text");
    if (text) setToken(String(text).trim());
  };

  const saveToken = async () => {
    const res = await callApi<any>("save_token", token);
    if (res?.alert) setAlert(res.alert);
    if (res?.status) setStatus(res.status);
    setTokenSaved(!!token.trim());
    if (token.trim()) {
      startBusy("Локации…");
      await callApi("refresh_locations", token);
    }
  };

  const scan = async () => {
    startBusy("Поиск терминала…");
    await callApi("scan", ip);
  };

  const chooseDevice = async (host: string, port = 80) => {
    setSelectedHost(host);
    setIp(host);
    const res = await callApi<any>("choose_device", host, port);
    if (res?.device) setDevice(res.device);
    if (res?.status) setStatus(res.status);
  };

  const refreshLocations = async () => {
    startBusy("Локации…");
    await callApi("refresh_locations", token);
  };

  const selectLocation = async (id: string) => {
    setLocationId(id);
    await callApi("set_location", id);
  };

  const probePasswords = async () => {
    if (!adminPwd.trim()) {
      setAlert({ text: "Введите текущий пароль администратора.", kind: "warn" });
      return;
    }
    startBusy("Проверка пароля на всех IP…");
    await callApi("probe_passwords", adminPwd, ip);
  };

  const startConnect = async () => {
    if (!adminPwd.trim()) {
      setAlert({ text: "Введите текущий пароль администратора.", kind: "warn" });
      return;
    }
    const ok = await callApi<boolean>(
      "confirm_connect",
      ip,
      locationLabel || "",
      adminPwd,
    );
    if (!ok) return;
    setConnectOpen(true);
    setConnectDone(false);
    setConnectStep(0);
    startBusy("Подключение…");
    await callApi("connect", {
      token,
      ip,
      locationId,
      password: adminPwd,
    });
  };

  const unlockAuth = async () => {
    const res = await callApi<any>("unlock_auth");
    setLocked(false);
    if (res?.alert) setAlert(res.alert);
    if (res?.status) setStatus(res.status);
  };

  const reconnect = async () => {
    startBusy("Восстановление сети…");
    await callApi("reconnect", { password: adminPwd, ip });
  };

  const checkTunnel = async () => {
    startBusy("Проверка туннеля…");
    await callApi("tunnel_status");
  };

  const restoreTunnel = async () => {
    startBusy("Восстановление туннеля…");
    await callApi("restore_tunnel");
  };

  const windowMinimize = () => void callApi("window_minimize");
  const windowToggleMaximize = () => void callApi("window_toggle_maximize");
  const windowClose = () => void callApi("window_close");

  const cancelBusy = () => {
    stopBusy();
    setAlert({ text: "Ожидание отменено. Можно повторить действие.", kind: "warn" });
  };

  return {
    ready,
    busy,
    busyText,
    cancelBusy,
    token,
    setToken,
    tokenSaved,
    saveToken,
    pasteToken,
    ip,
    setIp,
    devices,
    selectedHost,
    selectedDevice,
    chooseDevice,
    scan,
    scanMeta,
    locations,
    locationId,
    locationLabel,
    selectLocation,
    refreshLocations,
    adminPwd,
    setAdminPwd,
    pwdVerified,
    showPwd,
    toggleShowPwd: () => setShowPwd((s) => !s),
    probePasswords,
    status,
    alert,
    setAlert,
    device,
    tunnel,
    boundWeb,
    tenantLabel,
    apiUrl,
    webUrl,
    locked,
    unlockAuth,
    checks,
    readyCount,
    formReady,
    nextHint,
    startConnect,
    connectOpen,
    setConnectOpen,
    connectStep,
    connectDone,
    reconnect,
    reconnectSteps,
    checkTunnel,
    restoreTunnel,
    windowMinimize,
    windowToggleMaximize,
    windowClose,
  };
}

export type LinkSession = ReturnType<typeof useLinkSession>;
