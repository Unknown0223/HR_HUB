/* eslint-disable @typescript-eslint/no-explicit-any */

export type StatusKind = "ok" | "warn" | "danger" | "accent";

export type StatusPayload = {
  title?: string;
  sub?: string;
  kind?: StatusKind;
  badge?: string;
};

export type AlertPayload = { text: string; kind?: StatusKind };

export type LocationRow = { id: string; label: string };

export type DeviceInfo = {
  name?: string;
  host?: string;
  state?: string;
  location?: string;
  apiUrl?: string;
  serialNumber?: string;
};

export type DeviceRow = {
  host: string;
  port?: number;
  name?: string;
  serialNumber?: string;
  ok?: boolean | null;
  needPick?: boolean;
  model?: string;
  mac?: string;
  fw?: string;
};

export type TunnelInfo = { state?: string; url?: string };

export type BootstrapData = {
  tenantCode?: string;
  tenantName?: string;
  webUrl?: string;
  apiUrl?: string;
  boundWeb?: string;
  token?: string;
  ip?: string;
  locations?: LocationRow[];
  locationId?: string;
  status?: StatusPayload;
  alert?: AlertPayload | null;
  device?: DeviceInfo;
  tunnel?: TunnelInfo;
};

declare global {
  interface Window {
    pywebview?: { api?: Record<string, (...args: any[]) => any> };
    __hrhub?: Record<string, (payload: any) => void>;
  }
}

export function linkApi() {
  return window.pywebview?.api;
}

export async function callApi<T = any>(name: string, ...args: any[]): Promise<T | null> {
  const a = linkApi();
  if (!a || typeof a[name] !== "function") return null;
  return (await a[name](...args)) as T;
}

export async function waitForApi(timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (linkApi()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return !!linkApi();
}
