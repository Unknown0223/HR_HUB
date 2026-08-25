/**
 * Verifix «Настройки счетов» — TenantSetting.extras.accountSettings
 * Order = display order (2-column CSS grid: left/right by odd/even).
 */

export type AccountSettingsField = {
  key: string;
  label: string;
  /** Default "CODE. Name" display value */
  defaultValue: string;
};

export const ACCOUNT_SETTINGS_FIELDS: AccountSettingsField[] = [
  { key: 'tmcOpeningBalance', label: 'Ввод начальных остатков ТМЦ', defaultValue: '0000. Остатки' },
  { key: 'cash', label: 'Наличные деньги', defaultValue: '5010. Денежные средства в национальной валюте' },
  { key: 'settlementAccount', label: 'Расчетный счет', defaultValue: '5110. Расчетный счет' },
  { key: 'accountsReceivable', label: 'Счет к получению', defaultValue: '4010. Счета к получению от покупателей и заказчиков' },
  { key: 'customerAdvances', label: 'Получение авансов от покупателей/заказчиков', defaultValue: '6310. Авансы, полученные от покупателей и заказчиков' },
  { key: 'accountsPayable', label: 'Счет к оплате', defaultValue: '6010. Счета к оплате поставщикам и подрядчикам' },
  { key: 'finishedGoods', label: 'Продукция', defaultValue: '2810. Готовая продукция на складе' },
  { key: 'goodsInStock', label: 'Товары на складе', defaultValue: '2910. Товары на складе' },
  { key: 'rawMaterials', label: 'Сырье', defaultValue: '1010. Сырье и материалы' },
  { key: 'vatPayable', label: 'Налог на НДС', defaultValue: '6412. Налог на добавленную стоимость (НДС)' },
  { key: 'vatAdvance', label: 'Налог на НДС (авансовый платеж)', defaultValue: '4412. Налог на добавленную стоимость (НДС) (авансовый платеж)' },
  { key: 'goodsProcurement', label: 'Заготовление или приобретение товаров', defaultValue: '1510. Заготовление и приобретение материалов' },
  { key: 'customerDiscounts', label: 'Скидки, предоставленные покупателям/заказчикам', defaultValue: '9050. Скидки, предоставленные покупателям и заказчикам' },
  { key: 'vatInput', label: 'Налог на НДС (входной)', defaultValue: '4410. Налог на добавленную стоимость (НДС)' },
  { key: 'incomeFinishedGoods', label: 'Доход от реализованной готовой продукции', defaultValue: '9010. Доходы от реализации готовой продукции' },
  { key: 'rawMaterialsInTransit', label: 'Счет сырья в пути', defaultValue: '1017. Сырье и материалы в пути' },
  { key: 'cogsFinishedGoods', label: 'Себестоимость реализованных товаров', defaultValue: '9110. Себестоимость реализованной готовой продукции' },
  { key: 'incomeServices', label: 'Доход от оказанных услуг', defaultValue: '9030. Доходы от выполнения работ и оказания услуг' },
  { key: 'periodExpenseGoods', label: 'Счета учета расходов периода (по товарам)', defaultValue: '9420. Расходы отчетного периода, прочие возвраты' },
  { key: 'tmcWriteOff', label: 'ТМЦ на списание', defaultValue: '1020. ТМЦ на списание' },
  { key: 'orderedMaterialsInTransit', label: 'Заказанные материалы на склад: в пути', defaultValue: '1012. Заказанные материалы на складе: в пути' },
  { key: 'orderedRawInTransit', label: 'Заказанное сырье на склад: в пути', defaultValue: '2912. Заказанное сырье на складе в пути' },
  { key: 'orderedGoodsInTransit', label: 'Заказанные товары на склад: в пути', defaultValue: '2912. Заказанные товары на складе: в пути' },
  { key: 'inventoryDebt', label: 'Задолженность по ТМЦ при инвентаризации', defaultValue: '6360. Задолженность по инвентаризации ТМЦ по корректировке' },
  { key: 'inventoryWriteOff', label: 'Списание ТМЦ при инвентаризации', defaultValue: '9210. ТМЦ на списание по корректировке' },
  { key: 'otherTmcExpense', label: 'Прочие расходы по ТМЦ', defaultValue: '9430. Прочие операционные расходы' },
  { key: 'incomeGoodsSales', label: 'Доход от реализации готовой продукции', defaultValue: '9010. Доходы от реализации готовой продукции' },
  { key: 'incomeMerchandise', label: 'Доход от реализации товаров', defaultValue: '9020. Доходы от реализации товаров' },
  { key: 'incomeRawSales', label: 'Доход от реализации сырья', defaultValue: '9120. Доходы от реализации товаров' },
  { key: 'incomeServicesAlt', label: 'Доход от оказания услуг', defaultValue: '9030. Доходы от выполнения работ и оказания услуг' },
  { key: 'cogsProducts', label: 'Себестоимость реализованных товаров (готовой продукции)', defaultValue: '9110. Себестоимость реализованной готовой продукции' },
  { key: 'cogsMerchandise', label: 'Себестоимость реализованных товаров (товары)', defaultValue: '9120. Себестоимость реализованных товаров' },
  { key: 'cogsSpareParts', label: 'Себестоимость запасных частей', defaultValue: '9120. Себестоимость реализованных товаров' },
  { key: 'cogsRaw', label: 'Себестоимость реализованных товаров (сырье)', defaultValue: '9120. Себестоимость реализованных товаров' },
  { key: 'cogsServices', label: 'Себестоимость оказанных услуг', defaultValue: '9130. Себестоимость выполненных работ и оказанных услуг' },
  { key: 'salesReturns', label: 'Возврат проданных товаров', defaultValue: '9040. Возврат проданных товаров' },
  { key: 'mainProduction', label: 'Основное производство', defaultValue: '2010. Основное производство' },
  { key: 'auxProduction', label: 'Вспомогательное производство', defaultValue: '2310. Вспомогательное производство' },
  { key: 'otherExpenses', label: 'Прочие расходы', defaultValue: '9430. Прочие операционные расходы' },
  { key: 'fxGain', label: 'Доход от валютных курсовых разниц', defaultValue: '9540. Доходы от валютных курсовых разниц' },
  { key: 'fxLoss', label: 'Убыток от валютных курсовых разниц', defaultValue: '9620. Убытки от валютных курсовых разниц' },
  { key: 'sharesContributions', label: 'Паи и вклады', defaultValue: '6620. Паи и вклады' },
  { key: 'foundersDebt', label: 'Задолженность учредителей по вкладам в уставный капитал', defaultValue: '4610. Задолженность учредителей по вкладам в уставный капитал' },
  { key: 'retainedEarnings', label: 'Нераспределенная прибыль за отчетный период', defaultValue: '8710. Нераспределенная прибыль (непокрытый убыток) отчетного периода' },
  { key: 'dividendsPayable', label: 'Дивиденды к оплате', defaultValue: '6610. Дивиденды к оплате' },
  { key: 'finalFinancialResult', label: 'Конечный финансовый результат', defaultValue: '9910. Конечный финансовый результат' },
  { key: 'otherIncome', label: 'Прочие статьи дохода', defaultValue: '9390. Прочие операционные доходы' },
  { key: 'payrollSettlements', label: 'Расчеты с персоналом по оплате труда', defaultValue: '6710. Расчеты с персоналом по оплате труда' },
  { key: 'deductions', label: 'Удержания', defaultValue: '6710. Расчеты с персоналом по оплате труда' },
  { key: 'budgetDebt', label: 'Задолженность по платежам в бюджет (по видам)', defaultValue: '6410. Подоходный налог' },
  { key: 'pensionFund', label: 'Платежи в пенсионный фонд', defaultValue: '6520. Платежи в Пенсионный фонд' },
  { key: 'employeePension', label: 'Платежи из зарплаты работников в пенсионный фонд', defaultValue: '6521. Единый социальный платеж' },
  { key: 'payrollAdvances', label: 'Авансы, выданные по оплате труда', defaultValue: '4210. Авансы, выданные по оплате труда' },
];

export type AccountSettings = Record<string, string>;

export function defaultAccountSettings(): AccountSettings {
  const out: AccountSettings = {};
  for (const f of ACCOUNT_SETTINGS_FIELDS) {
    out[f.key] = f.defaultValue;
  }
  return out;
}

export function mergeAccountSettings(raw: unknown): AccountSettings {
  const base = defaultAccountSettings();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const o = raw as Record<string, unknown>;
  const out: AccountSettings = { ...base };
  for (const f of ACCOUNT_SETTINGS_FIELDS) {
    if (o[f.key] != null) out[f.key] = String(o[f.key]);
  }
  // keep unknown keys from patch (forward-compat)
  for (const [k, v] of Object.entries(o)) {
    if (!(k in out) && typeof v === 'string') out[k] = v;
  }
  return out;
}

/** Unique COA items derived from defaults (for seed). */
export function coaItemsFromAccountDefaults(): { code: string; name: string }[] {
  const map = new Map<string, string>();
  for (const f of ACCOUNT_SETTINGS_FIELDS) {
    const m = f.defaultValue.match(/^(\d+)\.\s*(.+)$/);
    if (!m) continue;
    if (!map.has(m[1])) map.set(m[1], m[2]);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([code, name]) => ({ code, name }));
}
