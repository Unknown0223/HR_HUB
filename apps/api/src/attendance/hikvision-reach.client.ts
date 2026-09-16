import { createHash, randomBytes } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';

type DigestParts = {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
};

export type ReachResult = {
  ok: boolean;
  error?: string;
  /** Transient tunnel/device blip — keep queue retryable. */
  retryable?: boolean;
};

function md5(s: string) {
  return createHash('md5').update(s).digest('hex');
}

function parseWwwAuthenticate(header: string): DigestParts | null {
  if (!header || !/digest/i.test(header)) return null;
  const get = (name: string) => {
    const m = header.match(new RegExp(`${name}=(?:"([^"]+)"|([^,\\s]+))`, 'i'));
    return (m?.[1] || m?.[2] || '').trim();
  };
  const realm = get('realm');
  const nonce = get('nonce');
  if (!realm || !nonce) return null;
  return {
    realm,
    nonce,
    qop: get('qop').split(',')[0]?.trim() || undefined,
    opaque: get('opaque') || undefined,
    algorithm: get('algorithm') || 'MD5',
  };
}

function buildDigestAuth(
  parts: DigestParts,
  username: string,
  password: string,
  method: string,
  uriPath: string,
): string {
  const ha1 = md5(`${username}:${parts.realm}:${password}`);
  const ha2 = md5(`${method.toUpperCase()}:${uriPath}`);
  const nc = '00000001';
  const cnonce = randomBytes(8).toString('hex');
  let response: string;
  if (parts.qop) {
    response = md5(`${ha1}:${parts.nonce}:${nc}:${cnonce}:${parts.qop}:${ha2}`);
  } else {
    response = md5(`${ha1}:${parts.nonce}:${ha2}`);
  }
  const fields = [
    `username="${username}"`,
    `realm="${parts.realm}"`,
    `nonce="${parts.nonce}"`,
    `uri="${uriPath}"`,
    `response="${response}"`,
  ];
  if (parts.opaque) fields.push(`opaque="${parts.opaque}"`);
  if (parts.qop) {
    fields.push(`qop=${parts.qop}`);
    fields.push(`nc=${nc}`);
    fields.push(`cnonce="${cnonce}"`);
  }
  return `Digest ${fields.join(', ')}`;
}

export function hikvisionEmployeeNo(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return String(raw || '').slice(0, 32);
  return String(BigInt(digits));
}

function isRetryableHttp(status: number, text: string): boolean {
  if ([408, 425, 429, 502, 503, 504, 520, 521, 522, 523, 524, 530].includes(status)) {
    return true;
  }
  const low = (text || '').toLowerCase();
  return (
    low.includes('timeout') ||
    low.includes('temporar') ||
    low.includes('busy') ||
    low.includes('try again') ||
    low.includes('devicebusy') ||
    low.includes('service unavailable') ||
    low.includes('bad gateway') ||
    low.includes('cloudflare')
  );
}

function isUserAlreadyOk(text: string): boolean {
  return (text || '').includes('employeeNoAlreadyExist');
}

function isFaceAlreadyExists(text: string): boolean {
  const t = text || '';
  return (
    t.includes('deviceUserAlreadyExistFace') || t.includes('faceAlreadyExist')
  );
}

function snipError(status: number, text: string, prefix: string): string {
  const body = (text || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  return body
    ? `${prefix} HTTP ${status}: ${body}`
    : `${prefix} HTTP ${status}`;
}

function isRetryableNetwork(msg: string): boolean {
  const low = (msg || '').toLowerCase();
  return (
    low.includes('abort') ||
    low.includes('timeout') ||
    low.includes('fetch failed') ||
    low.includes('econnreset') ||
    low.includes('econnrefused') ||
    low.includes('econnaborted') ||
    low.includes('epipe') ||
    low.includes('socket') ||
    low.includes('disconnected') ||
    low.includes('network') ||
    low.includes('other side closed') ||
    low.includes('und_err') ||
    low.includes('headers timeout') ||
    low.includes('body timeout')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

@Injectable()
export class HikvisionReachClient {
  private readonly logger = new Logger(HikvisionReachClient.name);

  private async digestRequestOnce(
    baseUrl: string,
    path: string,
    opts: {
      method?: string;
      username: string;
      password: string;
      body?: string | Uint8Array;
      contentType?: string;
      timeoutMs?: number;
    },
  ): Promise<{ status: number; text: string }> {
    const base = baseUrl.replace(/\/$/, '');
    const pathOnly = path.startsWith('/') ? path : `/${path}`;
    const url = `${base}${pathOnly}`;
    const method = (opts.method || 'GET').toUpperCase();
    const headers: Record<string, string> = {
      Accept: '*/*',
      Connection: 'close',
      'User-Agent': 'HRHUB-API-Reach/1.1',
    };
    if (opts.body != null && opts.contentType) {
      headers['Content-Type'] = opts.contentType;
    }
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), opts.timeoutMs ?? 45_000);
    const bodyInit: BodyInit | undefined =
      opts.body == null
        ? undefined
        : typeof opts.body === 'string'
          ? opts.body
          : new Uint8Array(opts.body);
    try {
      let res = await fetch(url, {
        method,
        headers,
        body: bodyInit,
        signal: ac.signal,
        keepalive: false,
      });
      if (res.status === 401) {
        const www = res.headers.get('www-authenticate') || '';
        const parts = parseWwwAuthenticate(www);
        if (!parts) {
          return { status: res.status, text: await res.text().catch(() => '') };
        }
        const uriPath = pathOnly;
        headers.Authorization = buildDigestAuth(
          parts,
          opts.username,
          opts.password,
          method,
          uriPath,
        );
        res = await fetch(url, {
          method,
          headers,
          body: bodyInit,
          signal: ac.signal,
          keepalive: false,
        });
      }
      const text = await res.text().catch(() => '');
      return { status: res.status, text };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isRetryableNetwork(msg)) {
        return { status: 0, text: `network: ${msg}` };
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  private async digestRequest(
    baseUrl: string,
    path: string,
    opts: {
      method?: string;
      username: string;
      password: string;
      body?: string | Uint8Array;
      contentType?: string;
      timeoutMs?: number;
      retries?: number;
    },
  ): Promise<{ status: number; text: string }> {
    const retries = Math.max(1, opts.retries ?? 4);
    let last = { status: 0, text: 'no attempt' };
    for (let attempt = 0; attempt < retries; attempt += 1) {
      last = await this.digestRequestOnce(baseUrl, path, opts);
      if (last.status === 401 || last.status === 403) return last;
      if (last.status > 0 && last.status < 500 && !isRetryableHttp(last.status, last.text)) {
        return last;
      }
      if (attempt + 1 >= retries) break;
      const delay = Math.min(4000, 400 * Math.pow(1.7, attempt));
      await sleep(delay);
    }
    return last;
  }

  async probe(
    baseUrl: string,
    username: string,
    password: string,
  ): Promise<boolean> {
    try {
      const r = await this.digestRequest(
        baseUrl,
        '/ISAPI/System/deviceInfo?format=json',
        { method: 'GET', username, password, timeoutMs: 15_000 },
      );
      return r.status > 0 && r.status < 400;
    } catch (e) {
      this.logger.warn(`reach probe failed: ${e instanceof Error ? e.message : e}`);
      return false;
    }
  }

  async upsertUser(
    baseUrl: string,
    username: string,
    password: string,
    employeeId: string,
    name: string,
  ): Promise<ReachResult> {
    const empNo = hikvisionEmployeeNo(employeeId);
    const safeName = (name || empNo).slice(0, 32);
    const payload = {
      UserInfo: {
        employeeNo: empNo,
        name: safeName,
        userType: 'normal',
        Valid: {
          enable: true,
          beginTime: '2017-08-01T00:00:00',
          endTime: '2037-12-31T23:59:59',
          timeType: 'local',
        },
        doorRight: '1',
        RightPlan: [{ doorNo: 1, planTemplateNo: '1' }],
      },
    };
    const body = JSON.stringify(payload);
    let last = 'UserInfo failed';
    for (const path of [
      '/ISAPI/AccessControl/UserInfo/SetUp?format=json',
      '/ISAPI/AccessControl/UserInfo/Modify?format=json',
      '/ISAPI/AccessControl/UserInfo/Record?format=json',
    ]) {
      const method = path.includes('Record') ? 'POST' : 'PUT';
      const r = await this.digestRequest(baseUrl, path, {
        method,
        username,
        password,
        body,
        contentType: 'application/json',
        timeoutMs: 30_000,
      });
      if (r.status < 400 || isUserAlreadyOk(r.text)) {
        return { ok: true };
      }
      last = snipError(r.status, r.text, 'UserInfo');
      if (isRetryableHttp(r.status, r.text)) {
        return { ok: false, error: last, retryable: true };
      }
    }
    return { ok: false, error: last, retryable: false };
  }

  /**
   * Soft size hint only — office-link shrinks for recognition quality.
   * Never treat already-exist face as enroll success (stale/weak templates).
   */
  private prepareFaceBytes(faceBase64: string): {
    b64: string;
    raw: Buffer;
    tooLarge: boolean;
  } {
    let b64 = faceBase64.trim();
    if (b64.toLowerCase().startsWith('data:') && b64.includes(',')) {
      b64 = b64.slice(b64.indexOf(',') + 1).trim();
    }
    const raw = Buffer.from(b64, 'base64');
    return { b64, raw, tooLarge: raw.length > 100_000 };
  }

  private async deleteFace(
    baseUrl: string,
    username: string,
    password: string,
    empNo: string,
  ): Promise<void> {
    const payload = JSON.stringify({
      FaceDataRecord: {
        faceLibType: 'blackFD',
        FDID: '1',
        FPID: empNo,
        employeeNo: empNo,
      },
    });
    for (const method of ['PUT', 'POST'] as const) {
      await this.digestRequest(
        baseUrl,
        '/ISAPI/Intelligent/FDLib/FDSearch/Delete?format=json',
        {
          method,
          username,
          password,
          body: payload,
          contentType: 'application/json',
          timeoutMs: 20_000,
        },
      );
    }
  }

  private buildMultipart(
    recordJson: string,
    jpeg: Buffer,
  ): { body: Buffer; contentType: string } {
    const boundary = `----HRHUB${randomBytes(12).toString('hex')}`;
    const chunks: Buffer[] = [];
    const push = (s: string | Buffer) => {
      chunks.push(typeof s === 'string' ? Buffer.from(s, 'utf8') : s);
    };
    push(`--${boundary}\r\n`);
    push(
      'Content-Disposition: form-data; name="FaceDataRecord"\r\nContent-Type: application/json\r\n\r\n',
    );
    push(recordJson);
    push(`\r\n--${boundary}\r\n`);
    push(
      'Content-Disposition: form-data; name="FaceImage"; filename="face.jpg"\r\nContent-Type: image/jpeg\r\n\r\n',
    );
    push(jpeg);
    push(`\r\n--${boundary}--\r\n`);
    return {
      body: Buffer.concat(chunks),
      contentType: `multipart/form-data; boundary=${boundary}`,
    };
  }

  async enrollFace(
    baseUrl: string,
    username: string,
    password: string,
    employeeId: string,
    faceBase64: string,
  ): Promise<ReachResult> {
    const empNo = hikvisionEmployeeNo(employeeId);
    let prepared: { b64: string; raw: Buffer; tooLarge: boolean };
    try {
      prepared = this.prepareFaceBytes(faceBase64);
    } catch {
      return { ok: false, error: 'Bad face image base64', retryable: false };
    }
    if (!prepared.b64 || prepared.raw.length < 32) {
      return { ok: false, error: 'Empty face image', retryable: false };
    }

    const record = {
      faceLibType: 'blackFD',
      FDID: '1',
      FPID: empNo,
      employeeNo: empNo,
    };
    const path = '/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json';

    // Clear stale/weak FDLib face before upload (synced≠recognizable otherwise).
    await this.deleteFace(baseUrl, username, password, empNo);

    // DS-K1T: multipart first; never send faceURL data-URI (badJsonContent/faceURL).
    const mp = this.buildMultipart(JSON.stringify(record), prepared.raw);
    const attempts: Array<{
      label: string;
      body: string | Uint8Array;
      contentType: string;
    }> = [
      {
        label: 'multipart',
        body: new Uint8Array(mp.body),
        contentType: mp.contentType,
      },
      {
        label: 'json-faceData',
        body: JSON.stringify({ ...record, faceData: prepared.b64 }),
        contentType: 'application/json',
      },
      {
        label: 'json-FaceDataRecord',
        body: JSON.stringify({
          FaceDataRecord: { ...record, faceData: prepared.b64 },
        }),
        contentType: 'application/json',
      },
    ];

    let last = 'Face enroll failed';
    let retryable = false;
    let deletedAgain = false;
    for (const attempt of attempts) {
      const r = await this.digestRequest(baseUrl, path, {
        method: 'POST',
        username,
        password,
        body: attempt.body,
        contentType: attempt.contentType,
        timeoutMs: 90_000,
      });
      if (r.status > 0 && r.status < 400) {
        return { ok: true };
      }
      if (isFaceAlreadyExists(r.text) && !deletedAgain) {
        deletedAgain = true;
        await this.deleteFace(baseUrl, username, password, empNo);
        const again = await this.digestRequest(baseUrl, path, {
          method: 'POST',
          username,
          password,
          body: attempt.body,
          contentType: attempt.contentType,
          timeoutMs: 90_000,
        });
        if (again.status > 0 && again.status < 400) {
          return { ok: true };
        }
        last = snipError(again.status, again.text, `Face(${attempt.label})`);
      } else {
        last = snipError(r.status, r.text, `Face(${attempt.label})`);
      }
      const low = (r.text || '').toLowerCase();
      if (
        isRetryableHttp(r.status, r.text) ||
        r.status === 0 ||
        low.includes('disconnect') ||
        low.includes('10053') ||
        low.includes('timeout')
      ) {
        retryable = true;
      }
      // Permanent reject of faceURL/JSON — do not keep hammering same style.
      if (low.includes('badjsoncontent') || low.includes('"facemsg":"faceurl"') || low.includes('facemsg')) {
        if (low.includes('faceurl')) {
          retryable = false;
          continue;
        }
      }
      this.logger.warn(
        `reach enroll emp=${empNo} via ${attempt.label}: ${r.status} ${(r.text || '').slice(0, 120)}`,
      );
    }
    if (prepared.tooLarge && !retryable) {
      last = `${last} (photo ${prepared.raw.length}B — shrink on office agent preferred)`;
    }
    return { ok: false, error: last.slice(0, 400), retryable };
  }

  async deleteUser(
    baseUrl: string,
    username: string,
    password: string,
    employeeId: string,
  ): Promise<boolean> {
    const empNo = hikvisionEmployeeNo(employeeId);
    await this.deleteFace(baseUrl, username, password, empNo);
    const payload = {
      UserInfoDelCond: { EmployeeNoList: [{ employeeNo: empNo }] },
    };
    const r = await this.digestRequest(
      baseUrl,
      '/ISAPI/AccessControl/UserInfo/Delete?format=json',
      {
        method: 'PUT',
        username,
        password,
        body: JSON.stringify(payload),
        contentType: 'application/json',
      },
    );
    const low = r.text.toLowerCase();
    return (
      r.status < 400 ||
      low.includes('employeenotexist') ||
      low.includes('usernotexist') ||
      low.includes('invalidoperation')
    );
  }

  async listUsers(
    baseUrl: string,
    username: string,
    password: string,
    opts: { pageSize?: number; maxUsers?: number } = {},
  ): Promise<Array<{ employeeNo: string; name: string; userType: string }>> {
    const pageSize = Math.max(1, Math.min(50, opts.pageSize ?? 30));
    const maxUsers = Math.max(pageSize, opts.maxUsers ?? 2000);
    const out: Array<{ employeeNo: string; name: string; userType: string }> =
      [];
    let pos = 0;
    while (pos < maxUsers) {
      const payload = {
        UserInfoSearchCond: {
          searchID: '1',
          searchResultPosition: pos,
          maxResults: Math.min(pageSize, maxUsers - pos),
        },
      };
      const r = await this.digestRequest(
        baseUrl,
        '/ISAPI/AccessControl/UserInfo/Search?format=json',
        {
          method: 'POST',
          username,
          password,
          body: JSON.stringify(payload),
          contentType: 'application/json',
          timeoutMs: 45_000,
        },
      );
      if (r.status >= 400) break;
      let data: any = {};
      try {
        data = JSON.parse(r.text || '{}');
      } catch {
        break;
      }
      const search = data?.UserInfoSearch || data || {};
      let rows = search.UserInfo || [];
      if (!Array.isArray(rows)) rows = rows ? [rows] : [];
      if (!rows.length) break;
      for (const row of rows) {
        const no = hikvisionEmployeeNo(
          String(row?.employeeNo || row?.employeeNoString || ''),
        );
        if (!no) continue;
        out.push({
          employeeNo: no,
          name: String(row?.name || '').trim(),
          userType: String(row?.userType || '')
            .trim()
            .toLowerCase(),
        });
      }
      const total = Number(search.totalMatches || 0);
      pos += rows.length;
      if (total && pos >= total) break;
      if (rows.length < pageSize) break;
    }
    return out;
  }

  async purgeOrphanUsers(
    baseUrl: string,
    username: string,
    password: string,
    keepEmployeeNos: Iterable<string>,
  ): Promise<{ removed: number; failed: number }> {
    const keep = new Set(
      [...keepEmployeeNos]
        .map((x) => hikvisionEmployeeNo(String(x || '')))
        .filter(Boolean),
    );
    const users = await this.listUsers(baseUrl, username, password);
    let removed = 0;
    let failed = 0;
    for (const u of users) {
      const ut = u.userType || '';
      if (ut === 'administrator' || ut === 'admin') continue;
      if (!u.employeeNo || keep.has(u.employeeNo)) continue;
      const ok = await this.deleteUser(
        baseUrl,
        username,
        password,
        u.employeeNo,
      );
      if (ok) removed += 1;
      else failed += 1;
    }
    return { removed, failed };
  }

  async syncFace(
    baseUrl: string,
    username: string,
    password: string,
    employeeId: string,
    name: string,
    faceBase64: string,
  ): Promise<ReachResult> {
    // Extra outer retries for flaky Cloudflare → terminal path.
    let last: ReachResult = { ok: false, error: 'Reach sync failed' };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const user = await this.upsertUser(
        baseUrl,
        username,
        password,
        employeeId,
        name,
      );
      if (!user.ok) {
        last = {
          ok: false,
          error: user.error || 'UserInfo failed',
          retryable: user.retryable,
        };
        if (user.retryable && attempt < 2) {
          await sleep(700 + attempt * 500);
          continue;
        }
        return last;
      }
      const face = await this.enrollFace(
        baseUrl,
        username,
        password,
        employeeId,
        faceBase64,
      );
      if (face.ok) return { ok: true };
      last = {
        ok: false,
        error: face.error || 'Face enroll failed',
        retryable: face.retryable,
      };
      if (face.retryable && attempt < 2) {
        await sleep(1000 + attempt * 600);
        continue;
      }
      return last;
    }
    return last;
  }
}
