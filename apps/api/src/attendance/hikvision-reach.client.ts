import { createHash, randomBytes } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';

type DigestParts = {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
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

@Injectable()
export class HikvisionReachClient {
  private readonly logger = new Logger(HikvisionReachClient.name);

  private async digestRequest(
    baseUrl: string,
    path: string,
    opts: {
      method?: string;
      username: string;
      password: string;
      body?: string;
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
      'User-Agent': 'HRHUB-API-Reach/1.0',
    };
    if (opts.body != null && opts.contentType) {
      headers['Content-Type'] = opts.contentType;
    }
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), opts.timeoutMs ?? 45_000);
    try {
      let res = await fetch(url, {
        method,
        headers,
        body: opts.body,
        signal: ac.signal,
      });
      if (res.status === 401) {
        const www = res.headers.get('www-authenticate') || '';
        const parts = parseWwwAuthenticate(www);
        if (!parts) {
          return { status: res.status, text: await res.text().catch(() => '') };
        }
        // URI in digest must be path + query only.
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
          body: opts.body,
          signal: ac.signal,
        });
      }
      const text = await res.text().catch(() => '');
      return { status: res.status, text };
    } finally {
      clearTimeout(t);
    }
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
  ): Promise<boolean> {
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
      });
      if (r.status < 400 || r.text.includes('employeeNoAlreadyExist')) return true;
    }
    return false;
  }

  async enrollFace(
    baseUrl: string,
    username: string,
    password: string,
    employeeId: string,
    faceBase64: string,
  ): Promise<boolean> {
    const empNo = hikvisionEmployeeNo(employeeId);
    let b64 = faceBase64.trim();
    if (b64.toLowerCase().startsWith('data:') && b64.includes(',')) {
      b64 = b64.slice(b64.indexOf(',') + 1).trim();
    }
    if (!b64) return false;
    const payload = {
      faceLibType: 'blackFD',
      FDID: '1',
      FPID: empNo,
      employeeNo: empNo,
      faceData: b64,
    };
    const r = await this.digestRequest(
      baseUrl,
      '/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json',
      {
        method: 'POST',
        username,
        password,
        body: JSON.stringify(payload),
        contentType: 'application/json',
        timeoutMs: 60_000,
      },
    );
    return (
      r.status < 400 || r.text.includes('deviceUserAlreadyExistFace')
    );
  }

  async deleteUser(
    baseUrl: string,
    username: string,
    password: string,
    employeeId: string,
  ): Promise<boolean> {
    const empNo = hikvisionEmployeeNo(employeeId);
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
  ): Promise<boolean> {
    const userOk = await this.upsertUser(
      baseUrl,
      username,
      password,
      employeeId,
      name,
    );
    if (!userOk) return false;
    return this.enrollFace(baseUrl, username, password, employeeId, faceBase64);
  }
}
