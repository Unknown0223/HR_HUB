/** Verifix «Оборотно-сальдовая ведомость по счету» — report UI settings */

export type AccountBalanceReportSettings = {
  /** Значение по умолчанию для пустых ячеек */
  defaultCellValue: string;
};

export const DEFAULT_ACCOUNT_BALANCE_REPORT: AccountBalanceReportSettings = {
  defaultCellValue: '',
};

export function mergeAccountBalanceReportSettings(
  raw: unknown,
): AccountBalanceReportSettings {
  const o =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    defaultCellValue:
      o.defaultCellValue != null
        ? String(o.defaultCellValue)
        : DEFAULT_ACCOUNT_BALANCE_REPORT.defaultCellValue,
  };
}
