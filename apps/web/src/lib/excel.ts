import { apiDownload } from '@/lib/api';
export { rowsToCsv } from '@/lib/csv';

/** Download an Excel file from the API (server-side generation). */
export async function downloadXlsxViaApi(path: string, filename: string): Promise<void> {
  const name = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  return apiDownload(path, name);
}
