/* global pywebview */
(function () {
  const $ = (id) => document.getElementById(id);
  const titles = {
    connect: ["Подключение", "Привязка Face ID терминала к HR HUB"],
    reconnect: ["Сеть", "Восстановление связи после смены IP"],
    tunnel: ["Туннель", "Доступ сервера к терминалу"],
    device: ["Устройство", "Текущее состояние привязки"],
  };

  let busy = false;
  let busyTimer = null;
  let pwdVisible = false;
  let pollTimer = null;

  function api() {
    return window.pywebview && window.pywebview.api;
  }

  function setBusy(on, text) {
    busy = !!on;
    const el = $("busy");
    el.classList.toggle("is-on", busy);
    el.setAttribute("aria-hidden", busy ? "false" : "true");
    if (text) $("busyText").textContent = text;
    document.querySelectorAll("button, input, select").forEach((elBtn) => {
      if (elBtn.id === "btnTogglePwd") return;
      elBtn.disabled = on;
    });
    if (busyTimer) {
      clearTimeout(busyTimer);
      busyTimer = null;
    }
    if (on) {
      // Never leave the UI locked forever if a worker stalls.
      busyTimer = setTimeout(() => {
        setBusy(false);
        setAlert("Операция слишком долгая. Попробуйте ещё раз или проверьте сеть/терминал.", "warn");
        setStatus({
          title: "Таймаут",
          sub: "Операция прервана",
          kind: "warn",
          badge: "TIMEOUT",
        });
      }, 90000);
    }
  }

  function setAlert(text, kind) {
    const el = $("alert");
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.className = "alert " + (kind || "warn");
    el.textContent = text;
  }

  function setStatus(payload) {
    if (!payload) return;
    if (payload.title) $("statusTitle").textContent = payload.title;
    if (payload.sub) $("statusSub").textContent = payload.sub;
    const kind = payload.kind || "warn";
    $("statusDot").className = "dot " + kind;
    const pill = $("statusPill");
    pill.className = "pill " + kind;
    pill.textContent = payload.badge || payload.title || "Статус";
  }

  function fillBootstrap(data) {
    if (!data) return;
    $("tenantLabel").textContent = data.tenantName || data.tenantCode || "Офисный клиент";
    $("boundWeb").textContent = data.boundWeb || data.webUrl || "—";
    $("token").value = data.token || "";
    if (data.ip) $("ip").value = data.ip;
    $("devApi").textContent = data.apiUrl || "—";
    if (data.status) setStatus(data.status);
    if (data.alert) setAlert(data.alert.text, data.alert.kind);
    else setAlert("");
    fillLocations(data.locations || [], data.locationId);
    if (data.device) fillDevice(data.device);
    if (data.tunnel) fillTunnel(data.tunnel);
  }

  function fillLocations(items, selectedId) {
    const sel = $("location");
    sel.innerHTML = "";
    items.forEach((it) => {
      const opt = document.createElement("option");
      opt.value = it.id;
      opt.textContent = it.label;
      if (selectedId && it.id === selectedId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function fillDevice(dev) {
    $("devName").textContent = dev.name || "—";
    $("devHost").textContent = dev.host || "—";
    $("devState").textContent = dev.state || "—";
    $("devLocation").textContent = dev.location || "—";
    if (dev.apiUrl) $("devApi").textContent = dev.apiUrl;
  }

  function fillTunnel(t) {
    $("tunnelState").textContent = t.state || "—";
    $("tunnelUrl").textContent = t.url || "—";
  }

  function switchTab(name) {
    if (busy) return;
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === name);
    });
    document.querySelectorAll(".panel").forEach((p) => {
      p.classList.toggle("active", p.id === "tab-" + name);
    });
    const meta = titles[name] || titles.connect;
    $("pageTitle").textContent = meta[0];
    $("pageLede").textContent = meta[1];
  }

  function dispatchEvent(evt) {
    if (!evt || !evt.fn) return;
    const fn = window.__hrhub[evt.fn];
    if (typeof fn === "function") fn(evt.payload);
  }

  async function drainEvents() {
    try {
      const a = api();
      if (!a || typeof a.poll_events !== "function") return;
      const batch = await a.poll_events();
      if (Array.isArray(batch)) batch.forEach(dispatchEvent);
    } catch (_e) {
      /* ignore transient bridge errors */
    }
  }

  window.__hrhub = {
    setBusy,
    setAlert,
    setStatus,
    fillBootstrap,
    fillLocations,
    fillDevice,
    fillTunnel,
    onConnectProgress(result) {
      if (result && result.status) setStatus(result.status);
    },
    onScanDone(result) {
      setBusy(false);
      if (!result) return;
      if (result.ok === false) {
        setAlert(result.message || "Поиск не удался", "danger");
        setStatus({ title: "Ошибка поиска", sub: result.message || "", kind: "danger", badge: "ОШИБКА" });
        return;
      }
      if (result.ip) $("ip").value = result.ip;
      setStatus(result.status || { title: "Найдено", kind: "ok", badge: "ОНЛАЙН", sub: result.sub || "" });
      if (result.device) fillDevice(result.device);
      if (result.alert) setAlert(result.alert.text, result.alert.kind);
      else setAlert("");
    },
    onConnectDone(result) {
      setBusy(false);
      if (!result) return;
      if (result.clearPassword) $("password").value = "";
      setStatus(result.status || {});
      if (result.alert) setAlert(result.alert.text, result.alert.kind);
      else setAlert("");
      if (result.device) fillDevice(result.device);
      if (result.tunnel) fillTunnel(result.tunnel);
      $("btnUnlock").hidden = !result.locked;
    },
    onReconnectProgress(steps) {
      const ol = $("reconnectSteps");
      ol.innerHTML = "";
      (steps || []).forEach((s) => {
        const li = document.createElement("li");
        li.className = s.state || "";
        li.textContent = (s.label || s.id) + (s.detail ? " — " + s.detail : "");
        ol.appendChild(li);
      });
    },
    onReconnectDone(result) {
      setBusy(false);
      if (!result) return;
      setStatus(result.status || {});
      if (result.alert) setAlert(result.alert.text, result.alert.kind);
      if (result.device) fillDevice(result.device);
      if (result.tunnel) fillTunnel(result.tunnel);
      if (result.steps) window.__hrhub.onReconnectProgress(result.steps);
    },
    onTunnelDone(result) {
      setBusy(false);
      if (!result) return;
      if (result.tunnel) fillTunnel(result.tunnel);
      setStatus(result.status || { title: result.tunnel?.state || "Туннель", kind: "accent", badge: "ТУННЕЛЬ" });
      if (result.alert) setAlert(result.alert.text, result.alert.kind);
    },
    onLocations(result) {
      setBusy(false);
      if (!result) return;
      fillLocations(result.locations || [], result.locationId);
      if (result.alert) setAlert(result.alert.text, result.alert.kind);
    },
  };

  async function call(name, ...args) {
    const a = api();
    if (!a || typeof a[name] !== "function") {
      setAlert("Приложение ещё загружается…", "warn");
      return null;
    }
    return a[name](...args);
  }

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Click overlay to unlock if stuck.
  $("busy").addEventListener("click", () => {
    if (!busy) return;
    setBusy(false);
    setAlert("Ожидание отменено. Можно повторить действие.", "warn");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && busy) {
      setBusy(false);
      setAlert("Ожидание отменено.", "warn");
    }
  });

  $("btnPasteToken").addEventListener("click", async () => {
    const text = await call("clipboard_text");
    if (text) $("token").value = String(text).trim();
  });
  $("btnSaveToken").addEventListener("click", async () => {
    const res = await call("save_token", $("token").value);
    if (res?.alert) setAlert(res.alert.text, res.alert.kind);
    if (res?.status) setStatus(res.status);
  });
  $("btnScan").addEventListener("click", async () => {
    setBusy(true, "Поиск терминала…");
    await call("scan", $("ip").value);
  });
  $("btnLocRefresh").addEventListener("click", async () => {
    setBusy(true, "Локации…");
    await call("refresh_locations", $("token").value);
  });
  $("btnTogglePwd").addEventListener("click", () => {
    pwdVisible = !pwdVisible;
    $("password").type = pwdVisible ? "text" : "password";
    $("btnTogglePwd").textContent = pwdVisible ? "Скрыть" : "Показать";
  });
  $("btnConnect").addEventListener("click", async () => {
    const password = $("password").value;
    if (!password.trim()) {
      setAlert("Введите текущий пароль администратора.", "warn");
      return;
    }
    const ok = await call(
      "confirm_connect",
      $("ip").value,
      $("location").selectedOptions[0]?.textContent || "",
      password
    );
    if (!ok) return;
    setBusy(true, "Подключение…");
    await call("connect", {
      token: $("token").value,
      ip: $("ip").value,
      locationId: $("location").value,
      password,
    });
  });
  $("btnUnlock").addEventListener("click", async () => {
    const res = await call("unlock_auth");
    $("btnUnlock").hidden = true;
    if (res?.alert) setAlert(res.alert.text, res.alert.kind);
    if (res?.status) setStatus(res.status);
  });
  $("btnReconnect").addEventListener("click", async () => {
    setBusy(true, "Восстановление сети…");
    await call("reconnect");
  });
  $("btnTunnelRefresh").addEventListener("click", async () => {
    setBusy(true, "Проверка туннеля…");
    await call("tunnel_status");
  });
  $("btnTunnelRestore").addEventListener("click", async () => {
    setBusy(true, "Восстановление туннеля…");
    await call("restore_tunnel");
  });
  $("location").addEventListener("change", async () => {
    await call("set_location", $("location").value);
  });

  window.addEventListener("pywebviewready", async () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(drainEvents, 200);
    const data = await call("bootstrap");
    fillBootstrap(data);
    await drainEvents();
  });
})();
