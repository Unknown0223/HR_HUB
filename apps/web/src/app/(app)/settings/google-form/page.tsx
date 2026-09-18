'use client';

import { useEffect, useState } from 'react';
import { PageSubnav } from '@/components/PageSubnav';
import { API_ORIGIN, apiFetch, getSession } from '@/lib/api';
import styles from '../../catalog/absence-types/page.module.css';
import shared from '../../../page-shared.module.css';

type FormField = {
  key: string;
  titleUz: string;
  titleRu: string;
  type: string;
  required?: boolean;
  choices?: string[];
};

type FormSchema = {
  endpoint: string;
  authHeader: string;
  authEnv: string;
  required: string[];
  fields: FormField[];
};

const SCRIPT_HINT = `tools/google-form-employee/Code.gs`;

export default function GoogleFormEmployeesPage() {
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tenantHint, setTenantHint] = useState('demo');

  useEffect(() => {
    const s = getSession();
    if (s?.tenant?.code) setTenantHint(s.tenant.code);
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const sch = await apiFetch<FormSchema>('/api/employee-form/schema');
        setSchema(sch);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Schema yuklanmadi');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const apiBase = API_ORIGIN.replace(/\/$/, '');

  return (
    <div className={shared.wrap}>
      <PageSubnav groupKey="settings" />
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Google Form — yangi xodim</h1>
          <p className={styles.subtitle}>
            Form to‘ldiriladi → Apps Script → HR HUB bazaga xodim yoziladi
          </p>
        </div>
      </div>

      {loading ? <p className={styles.empty}>Загрузка…</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.panel}>
        <h2 className={styles.title}>1. Railway (API)</h2>
        <p className={styles.subtitle}>
          Env o‘zgaruvchi qo‘ying (Punch kalitidan alohida):
        </p>
        <pre className={styles.subtitle}>
          {`EMPLOYEE_FORM_INGEST_KEY=<uzun-random-sir>`}
        </pre>
        <p className={styles.subtitle}>
          Endpoint:{' '}
          <code>
            {apiBase}/api/employee-form/ingest
          </code>
        </p>
        <p className={styles.subtitle}>
          Header: <code>X-Employee-Form-Key</code> · Tenant:{' '}
          <code>{tenantHint}</code>
        </p>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.title}>2. Google Form</h2>
        <ol className={styles.subtitle}>
          <li>
            Google Drive → <b>New → Google Apps Script</b>
          </li>
          <li>
            Repodagi <code>{SCRIPT_HINT}</code> kodini paste qiling
          </li>
          <li>
            <code>CONFIG</code> ichida <code>API_URL</code>, <code>FORM_KEY</code>,{' '}
            <code>TENANT_CODE=&apos;{tenantHint}&apos;</code>
          </li>
          <li>
            <code>createHrHubEmployeeForm</code> — birinchi marta; keyin{' '}
            <code>updateHrHubEmployeeForm</code> (URL saqlanadi)
          </li>
          <li>
            Formada yuz + pasport rasmi majburiy (JPG/PNG). Namuna:{' '}
            <code>SampleBlobs.gs</code>
          </li>
          <li>Form linkini kandidatlarga yuboring</li>
        </ol>
        <p className={styles.subtitle}>
          Batafsil: <code>docs/GOOGLE_FORM_EMPLOYEES.md</code>
        </p>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.title}>3. Maydonlar</h2>
        {!schema ? null : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>API</th>
                <th>Form (UZ)</th>
                <th>Form (RU)</th>
                <th>Majburiy</th>
              </tr>
            </thead>
            <tbody>
              {schema.fields.map((f) => (
                <tr key={f.key}>
                  <td>
                    <code>{f.key}</code>
                  </td>
                  <td>{f.titleUz}</td>
                  <td>{f.titleRu}</td>
                  <td>{f.required ? 'ha' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.title}>4. Curl sinov</h2>
        <pre className={styles.subtitle}>
          {`curl -X POST "${apiBase}/api/employee-form/ingest" \\
  -H "Content-Type: application/json" \\
  -H "X-Employee-Form-Key: $EMPLOYEE_FORM_INGEST_KEY" \\
  -d '{"tenantCode":"${tenantHint}","lastName":"Karimov","firstName":"Ali","phone":"+998901112233"}'`}
        </pre>
      </section>
    </div>
  );
}
