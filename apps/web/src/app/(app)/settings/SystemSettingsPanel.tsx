'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import styles from './system-settings.module.css';

type SystemSettings = Record<string, unknown>;

type Panel = 'general' | 'hr_staff' | 'timepad' | 'required' | 'recruitment';

const OVERTIME_TYPES = [
  { value: 'overtime_pay', label: 'Сверхурочная оплата труда' },
  { value: 'time_off', label: 'Отгул' },
  { value: 'mixed', label: 'Смешанный' },
];

function asBool(v: unknown, fallback = false) {
  return typeof v === 'boolean' ? v : fallback;
}

function asStr(v: unknown, fallback = '') {
  return v == null ? fallback : String(v);
}

function asNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={styles.row}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={styles.toggleRow}>
      <span className={styles.toggleLabel}>{label}</span>
      <span className={styles.switch}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className={styles.slider} />
      </span>
    </label>
  );
}

export function SystemSettingsPanel() {
  const [panel, setPanel] = useState<Panel>('general');
  const [s, setS] = useState<SystemSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await apiFetch<{ system: SystemSettings }>('/api/settings/system');
      setS(data.system || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setS({});
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function set<K extends string>(key: K, value: unknown) {
    setS((prev) => ({ ...(prev || {}), [key]: value }));
  }

  async function save() {
    if (!s) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const res = await apiFetch<{ system: SystemSettings }>('/api/settings/system', {
        method: 'PATCH',
        body: JSON.stringify({ system: s }),
      });
      setS(res.system || s);
      setInfo('Настройки сохранены');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  if (!s) {
    return <p className={styles.stub}>Загрузка настроек…</p>;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.pageHead}>
        <h2 className={styles.pageTitle}>Настройки системы</h2>
        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.saveBtn}
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? '…' : 'Сохранить'}
          </button>
          {info ? <p className={styles.msg}>{info}</p> : null}
          {error ? <p className={styles.err}>{error}</p> : null}
        </div>
      </div>

      <div className={styles.subTabs}>
        {(
          [
            ['general', 'Основные настройки'],
            ['hr_staff', 'Настройки для Verifix HR Staff'],
            ['timepad', 'Настройки для Timepad'],
            ['required', 'Настройки обязательных полей'],
            ['recruitment', 'Настройки рекрутинга'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={panel === id ? styles.subTabActive : styles.subTab}
            onClick={() => setPanel(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {panel === 'general' ? (
        <div className={styles.grid2}>
          <div className={styles.col}>
            <Check
              label="Автогенерация PIN"
              checked={asBool(s.autoPin, true)}
              onChange={(v) => set('autoPin', v)}
            />
            <Check
              label="Использовать фото из профиля для распознавания лица"
              checked={asBool(s.useProfilePhotoForFace, true)}
              onChange={(v) => set('useProfilePhotoForFace', v)}
            />
            <Check
              label="Автоматическая генерация табельных номеров"
              checked={asBool(s.autoTabNumber, true)}
              onChange={(v) => set('autoTabNumber', v)}
            />
            <Check
              label="Блокировать увольнение при наличии займа"
              checked={asBool(s.blockDismissalIfLoan)}
              onChange={(v) => set('blockDismissalIfLoan', v)}
            />
            <Check
              label="Блокировать доступ к системе с нескольких активных устройств"
              checked={asBool(s.blockMultiDevice)}
              onChange={(v) => set('blockMultiDevice', v)}
            />
            <Check
              label="Расширенная организационная структура"
              checked={asBool(s.advancedOrgStructure)}
              onChange={(v) => set('advancedOrgStructure', v)}
            />
            <Check
              label="Импорт результатов задач для расчётов"
              checked={asBool(s.importTaskResults)}
              onChange={(v) => set('importTaskResults', v)}
            />
            <Check
              label="Ограничение времени запроса на изменение графика"
              checked={asBool(s.limitScheduleChangeRequestTime)}
              onChange={(v) => set('limitScheduleChangeRequestTime', v)}
            />
            <Check
              label="Ограничение времени запроса на отсутствие"
              checked={asBool(s.limitAbsenceRequestTime)}
              onChange={(v) => set('limitAbsenceRequestTime', v)}
            />
            <Check
              label="Ограничение количества изменений графика"
              checked={asBool(s.restrictScheduleChangeCount)}
              onChange={(v) => set('restrictScheduleChangeCount', v)}
            />
            <Check
              label="Ограничение количества запросов на отсутствие"
              checked={asBool(s.restrictAbsenceCount)}
              onChange={(v) => set('restrictAbsenceCount', v)}
            />

            <label className={styles.field}>
              Коэффициент сверхурочных
              <input
                type="number"
                step="0.1"
                min={0}
                value={asNum(s.overtimeCoefficient, 1)}
                onChange={(e) => set('overtimeCoefficient', Number(e.target.value))}
              />
            </label>

            <label className={styles.field}>
              Тип начисления сверхурочных по умолчанию *
              <select
                value={asStr(s.defaultOvertimeType, 'overtime_pay')}
                onChange={(e) => set('defaultOvertimeType', e.target.value)}
              >
                {OVERTIME_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <Check
              label="Отслеживание времени ответов в секундах"
              checked={asBool(s.trackResponseTimeSeconds)}
              onChange={(v) => set('trackResponseTimeSeconds', v)}
            />

            <label className={styles.field}>
              Время до прибытия после подтверждения внутренней командировки
              <input
                type="text"
                value={asStr(s.tripArrivalLeadTime, '01:00')}
                onChange={(e) => set('tripArrivalLeadTime', e.target.value)}
                placeholder="01:00"
              />
              <span className={styles.hint}>По умолчанию: 60 минут</span>
            </label>

            <label className={styles.field}>
              Ранний приход (до начала внутренней командировки)
              <input
                type="text"
                value={asStr(s.earlyArrivalTrip, '00:00')}
                onChange={(e) => set('earlyArrivalTrip', e.target.value)}
              />
              <span className={styles.hint}>Макс. время раннего прихода: 30 час</span>
            </label>

            <label className={styles.field}>
              Поздний уход (после окончания внутренней командировки)
              <input
                type="text"
                value={asStr(s.lateDepartureTrip, '00:00')}
                onChange={(e) => set('lateDepartureTrip', e.target.value)}
              />
              <span className={styles.hint}>Макс. время позднего ухода: 30 час</span>
            </label>

            <Check
              label="Тип округления для фактов вида времени"
              checked={asBool(s.dynamicFactRounding)}
              onChange={(v) => set('dynamicFactRounding', v)}
            />
            <Check
              label="Динамический метод"
              checked={asBool(s.dynamicMethod)}
              onChange={(v) => set('dynamicMethod', v)}
            />
            <Check
              label="Изменение формата имен сотрудников для приказов"
              checked={asBool(s.changeNameFormatForOrders)}
              onChange={(v) => set('changeNameFormatForOrders', v)}
            />
            <Check
              label="Показать пользовательскую дашборд в статистике посещаемости"
              checked={asBool(s.showUserDashboardInAttendanceStats)}
              onChange={(v) => set('showUserDashboardInAttendanceStats', v)}
            />

            <Toggle
              label="Отсутствующие сотрудники без подтвержденного запроса"
              checked={asBool(s.missingEmployeesWithoutRequest)}
              onChange={(v) => set('missingEmployeesWithoutRequest', v)}
            />

            <label className={styles.field}>
              Интервал по умолчанию между медосмотрами (в месяцах)
              <input
                type="text"
                value={asStr(s.medicalExamIntervalMonths)}
                onChange={(e) => set('medicalExamIntervalMonths', e.target.value)}
              />
            </label>

            <button type="button" className={styles.linkish}>
              + Добавить настройки уведомлений для типов документов
            </button>

            <Toggle
              label="Ограничение изменения смен за прошлый период"
              checked={asBool(s.restrictPastShiftChange)}
              onChange={(v) => set('restrictPastShiftChange', v)}
            />
            <Toggle
              label="Заблокировать сохранение разовых документов по месяцу начисления"
              checked={asBool(s.blockOneTimeDocsByMonth)}
              onChange={(v) => set('blockOneTimeDocsByMonth', v)}
            />

            <label className={styles.field}>
              Начисление для расходов при ротации
              <input
                type="text"
                placeholder="Поиск..."
                value={asStr(s.rotationExpenseAccrual)}
                onChange={(e) => set('rotationExpenseAccrual', e.target.value)}
              />
            </label>

            <Toggle
              label="Скрыть график в календаре сотрудника"
              checked={asBool(s.hideScheduleInEmployeeCalendar)}
              onChange={(v) => set('hideScheduleInEmployeeCalendar', v)}
            />
            <Toggle
              label="Показывать дополнительные виды времени в календаре сотрудника"
              checked={asBool(s.showExtraTimeTypesInCalendar)}
              onChange={(v) => set('showExtraTimeTypesInCalendar', v)}
            />
          </div>

          <div className={styles.col}>
            <p className={styles.sectionTitle}>Проверка</p>
            <Toggle
              label="Верификация сотрудника"
              checked={asBool(s.employeeVerification, true)}
              onChange={(v) => set('employeeVerification', v)}
            />
            <div className={styles.radioGroup}>
              {(
                [
                  ['fio', 'ФИО'],
                  ['passport', 'Серия и номер паспорта'],
                  ['pinfl', 'ПИНФЛ'],
                ] as const
              ).map(([val, label]) => (
                <label key={val} className={styles.radio}>
                  <input
                    type="radio"
                    name="verificationDataType"
                    checked={asStr(s.verificationDataType, 'fio') === val}
                    onChange={() => set('verificationDataType', val)}
                  />
                  {label}
                </label>
              ))}
            </div>

            <p className={styles.sectionTitle}>Размер QR инвентаря</p>
            <div className={styles.radioGroup}>
              {(
                [
                  ['small', 'Маленький'],
                  ['normal', 'Обычный'],
                ] as const
              ).map(([val, label]) => (
                <label key={val} className={styles.radio}>
                  <input
                    type="radio"
                    name="qrInventorySize"
                    checked={asStr(s.qrInventorySize, 'normal') === val}
                    onChange={() => set('qrInventorySize', val)}
                  />
                  {label}
                </label>
              ))}
            </div>

            <p className={styles.sectionTitle}>Глобальные настройки прихода</p>
            <div className={styles.radioGroup}>
              {(
                [
                  ['first', 'Первая отметка'],
                  ['last', 'Последняя отметка'],
                ] as const
              ).map(([val, label]) => (
                <label key={val} className={styles.radio}>
                  <input
                    type="radio"
                    name="arrivalMarkRule"
                    checked={asStr(s.arrivalMarkRule, 'first') === val}
                    onChange={() => set('arrivalMarkRule', val)}
                  />
                  {label}
                </label>
              ))}
            </div>

            <p className={styles.sectionTitle}>Глобальные настройки ухода</p>
            <div className={styles.radioGroup}>
              {(
                [
                  ['first', 'Первая отметка'],
                  ['last', 'Последняя отметка'],
                ] as const
              ).map(([val, label]) => (
                <label key={val} className={styles.radio}>
                  <input
                    type="radio"
                    name="departureMarkRule"
                    checked={asStr(s.departureMarkRule, 'last') === val}
                    onChange={() => set('departureMarkRule', val)}
                  />
                  {label}
                </label>
              ))}
            </div>

            <p className={styles.sectionTitle}>Настройки штрафа за опоздание</p>
            <div className={styles.radioGroup}>
              {(
                [
                  ['arrival_only', 'Только на приходе'],
                  ['arrival_with_checkout', 'На приходе с проверкой ухода'],
                ] as const
              ).map(([val, label]) => (
                <label key={val} className={styles.radio}>
                  <input
                    type="radio"
                    name="latenessPenalty"
                    checked={asStr(s.latenessPenalty, 'arrival_only') === val}
                    onChange={() => set('latenessPenalty', val)}
                  />
                  {label}
                </label>
              ))}
            </div>

            <Check
              label="Показывать информацию об официальных отсутствиях"
              checked={asBool(s.showOfficialAbsences, true)}
              onChange={(v) => set('showOfficialAbsences', v)}
            />
            <Check
              label="Проверка превышения лимита при корректировке табеля"
              checked={asBool(s.checkTimesheetLimit, true)}
              onChange={(v) => set('checkTimesheetLimit', v)}
            />
            <Check
              label="Использовать обходной лист"
              checked={asBool(s.useClearanceSheet)}
              onChange={(v) => set('useClearanceSheet', v)}
            />
            <Check
              label="Показывать стажировку"
              checked={asBool(s.showInternship)}
              onChange={(v) => set('showInternship', v)}
            />
            <Check
              label="Автоматически ставить уход как время конца внутренней командировки"
              checked={asBool(s.autoOutAsTripEnd)}
              onChange={(v) => set('autoOutAsTripEnd', v)}
            />

            <Toggle
              label="Корпоративная лента новостей"
              checked={asBool(s.corporateNewsFeed)}
              onChange={(v) => set('corporateNewsFeed', v)}
            />

            <Check
              label="Необязательная дата окончания для договора ГПХ"
              checked={asBool(s.optionalGphEndDate)}
              onChange={(v) => set('optionalGphEndDate', v)}
            />
            <Check
              label="Уведомление для HR о приближающейся дате документа"
              checked={asBool(s.hrNotifyDocumentDates)}
              onChange={(v) => set('hrNotifyDocumentDates', v)}
            />
            <Check
              label="Заблокировать интервалы с официальным отсутствием"
              checked={asBool(s.blockOfficialAbsenceIntervals, true)}
              onChange={(v) => set('blockOfficialAbsenceIntervals', v)}
            />
            <Check
              label="Динамический поиск опозданий при приходе с многосменным расписанием"
              checked={asBool(s.dynamicLateSearchMultiShift)}
              onChange={(v) => set('dynamicLateSearchMultiShift', v)}
            />

            <Toggle
              label="Ручной ввод адреса"
              checked={asBool(s.manualAddressEntry)}
              onChange={(v) => set('manualAddressEntry', v)}
            />

            <Check
              label="Отображение графика по умолчанию (09:00 - 18:00)"
              checked={asBool(s.defaultScheduleDisplay0900)}
              onChange={(v) => set('defaultScheduleDisplay0900', v)}
            />
            <Check
              label="Запросы на отсутствие подтверждает только руководитель"
              checked={asBool(s.absenceConfirmManagerOnly)}
              onChange={(v) => set('absenceConfirmManagerOnly', v)}
            />
            <Check
              label="Уведомлять HR о завершении подтвержденного запроса на отсутствие"
              checked={asBool(s.notifyHrAbsenceComplete)}
              onChange={(v) => set('notifyHrAbsenceComplete', v)}
            />
            <Check
              label="Уведомлять HR о завершении подтвержденного запроса на изменение графика"
              checked={asBool(s.notifyHrScheduleChangeComplete)}
              onChange={(v) => set('notifyHrScheduleChangeComplete', v)}
            />
            <Check
              label="Дневной лимит сверхурочных часов"
              checked={asBool(s.dailyOvertimeLimit)}
              onChange={(v) => set('dailyOvertimeLimit', v)}
            />
            <Check
              label="Минимальный лимит сверхурочных часов"
              checked={asBool(s.minOvertimeLimit)}
              onChange={(v) => set('minOvertimeLimit', v)}
            />
            <Check
              label="Ограничение периода создания запроса на сверхурочную работу"
              checked={asBool(s.restrictOvertimeRequestPeriod)}
              onChange={(v) => set('restrictOvertimeRequestPeriod', v)}
            />
            <Check
              label="Ограничение периода создания запроса на отметку"
              checked={asBool(s.restrictMarkRequestPeriod)}
              onChange={(v) => set('restrictMarkRequestPeriod', v)}
            />
            <Check
              label="Уведомлять о неоткрытых сменах"
              checked={asBool(s.notifyUnopenedShifts)}
              onChange={(v) => set('notifyUnopenedShifts', v)}
            />
            <Check
              label="Уведомлять об открытых сменах ближайшие торговые точки"
              checked={asBool(s.notifyOpenShiftsNearby)}
              onChange={(v) => set('notifyOpenShiftsNearby', v)}
            />
            <Check
              label="Уведомлять руководителя при подаче запроса на создание или изменение смены"
              checked={asBool(s.notifyManagerShiftRequest)}
              onChange={(v) => set('notifyManagerShiftRequest', v)}
            />
            <Check
              label="Уведомлять отдел кадров при согласовании запроса на создание или изменение смены"
              checked={asBool(s.notifyHrShiftRequest)}
              onChange={(v) => set('notifyHrShiftRequest', v)}
            />

            <Toggle
              label="Заблокировать запросы на период с закрытым табелем"
              checked={asBool(s.blockRequestsClosedTimesheet)}
              onChange={(v) => set('blockRequestsClosedTimesheet', v)}
            />

            <Check
              label="Проверка совершеннолетия (минимум 18 лет)"
              checked={asBool(s.checkAdultAge18)}
              onChange={(v) => set('checkAdultAge18', v)}
            />
            <Check
              label='Скрыть пункт "Начальный баланс" в карточке сотрудника'
              checked={asBool(s.hideInitialBalance, true)}
              onChange={(v) => set('hideInitialBalance', v)}
            />
          </div>
        </div>
      ) : panel === 'hr_staff' ? (
        <HrStaffSettingsForm
          value={(s.hrStaff && typeof s.hrStaff === 'object' ? s.hrStaff : {}) as SystemSettings}
          onChange={(hrStaff) => set('hrStaff', hrStaff)}
        />
      ) : panel === 'timepad' ? (
        <TimepadSettingsForm
          value={(s.timepad && typeof s.timepad === 'object' ? s.timepad : {}) as SystemSettings}
          onChange={(timepad) => set('timepad', timepad)}
        />
      ) : panel === 'required' ? (
        <RequiredFieldsSettingsForm
          value={
            (s.requiredFields && typeof s.requiredFields === 'object'
              ? s.requiredFields
              : {}) as SystemSettings
          }
          onChange={(requiredFields) => set('requiredFields', requiredFields)}
        />
      ) : panel === 'recruitment' ? (
        <RecruitmentSettingsForm
          value={
            (s.recruitment && typeof s.recruitment === 'object' ? s.recruitment : {}) as SystemSettings
          }
          onChange={(recruitment) => set('recruitment', recruitment)}
        />
      ) : (
        <div className={styles.stub}>Нет данных</div>
      )}
    </div>
  );
}

function HrStaffSettingsForm({
  value,
  onChange,
}: {
  value: SystemSettings;
  onChange: (v: SystemSettings) => void;
}) {
  const h = value || {};
  const setH = (key: string, val: unknown) => onChange({ ...h, [key]: val });

  return (
    <div className={styles.grid2}>
      <div className={styles.col}>
        <p className={styles.sectionTitle}>Общие настройки отметок</p>
        <Check
          label="Автоматическое определение типа отметок"
          checked={asBool(h.autoDetectMarkType, true)}
          onChange={(v) => setH('autoDetectMarkType', v)}
        />

        <p className={styles.sectionTitle}>Типы отметок</p>
        <Check
          label="Приход"
          checked={asBool(h.markTypeIn)}
          onChange={(v) => setH('markTypeIn', v)}
        />
        <Check
          label="Уход"
          checked={asBool(h.markTypeOut)}
          onChange={(v) => setH('markTypeOut', v)}
        />
        <Check
          label="Отметка"
          checked={asBool(h.markTypeMark)}
          onChange={(v) => setH('markTypeMark', v)}
        />
        <Check
          label="Перерыв приход"
          checked={asBool(h.markTypeBreakIn)}
          onChange={(v) => setH('markTypeBreakIn', v)}
        />
        <Check
          label="Перерыв уход"
          checked={asBool(h.markTypeBreakOut)}
          onChange={(v) => setH('markTypeBreakOut', v)}
        />

        <Check
          label="Настройка ухода с последней отметкой на мобильных устройствах"
          checked={asBool(h.mobileLastMarkAsOut)}
          onChange={(v) => setH('mobileLastMarkAsOut', v)}
        />
        <Check
          label="Разрешить отметки через QR-код"
          checked={asBool(h.allowQrMarks)}
          onChange={(v) => setH('allowQrMarks', v)}
        />

        <p className={styles.sectionTitle}>Этапы отметки</p>
        <Check
          label="Определение GPS координат"
          checked={asBool(h.stageGps, true)}
          onChange={(v) => setH('stageGps', v)}
        />
        <Check
          label="Распознавание лица"
          checked={asBool(h.stageFace, true)}
          onChange={(v) => setH('stageFace', v)}
        />
        <Check
          label="Проверка эмоций — закрытие глаза"
          checked={asBool(h.stageEmotionEyes, true)}
          onChange={(v) => setH('stageEmotionEyes', v)}
        />
        <Check
          label="Проверка эмоций — улыбка"
          checked={asBool(h.stageEmotionSmile, true)}
          onChange={(v) => setH('stageEmotionSmile', v)}
        />

        <p className={styles.sectionTitle}>Настройки запросов</p>
        <Check
          label="Разрешить запросы на отсутствие"
          checked={asBool(h.allowAbsenceRequests, true)}
          onChange={(v) => setH('allowAbsenceRequests', v)}
        />
        <Check
          label="Состояние запроса на отсутствие"
          checked={asBool(h.absenceRequestState)}
          onChange={(v) => setH('absenceRequestState', v)}
        />
        <Check
          label="Разрешить запросы на изменение графика"
          checked={asBool(h.allowScheduleChangeRequests, true)}
          onChange={(v) => setH('allowScheduleChangeRequests', v)}
        />
        <Check
          label="Разрешить запросы на обмен днями"
          checked={asBool(h.allowDaySwapRequests, true)}
          onChange={(v) => setH('allowDaySwapRequests', v)}
        />
        <Check
          label="Состояние запроса на изменение рабочего графика"
          checked={asBool(h.scheduleChangeRequestState)}
          onChange={(v) => setH('scheduleChangeRequestState', v)}
        />
        <Check
          label="Разрешить запросы на отметки"
          checked={asBool(h.allowMarkRequests, true)}
          onChange={(v) => setH('allowMarkRequests', v)}
        />
        <Check
          label="Разрешить запросы на увольнение"
          checked={asBool(h.allowDismissalRequests, true)}
          onChange={(v) => setH('allowDismissalRequests', v)}
        />
        <Check
          label="Разрешить запросы на локацию"
          checked={asBool(h.allowLocationRequests, true)}
          onChange={(v) => setH('allowLocationRequests', v)}
        />
        <Check
          label="Разрешить запросы на сверхурочные"
          checked={asBool(h.allowOvertimeRequests, true)}
          onChange={(v) => setH('allowOvertimeRequests', v)}
        />
        <Check
          label="Включить запрос на отпуск"
          checked={asBool(h.enableVacationRequest, true)}
          onChange={(v) => setH('enableVacationRequest', v)}
        />

        <Check
          label="Включить XCamera (beta)"
          checked={asBool(h.enableXCamera)}
          onChange={(v) => setH('enableXCamera', v)}
        />
        <Check
          label="Разрешить загрузку фото для распознавания"
          checked={asBool(h.allowPhotoUploadForRecognition)}
          onChange={(v) => setH('allowPhotoUploadForRecognition', v)}
        />
        <Check
          label="Игнорировать недействительные отметки для прихода/ухода"
          checked={asBool(h.ignoreInvalidInOutMarks)}
          onChange={(v) => setH('ignoreInvalidInOutMarks', v)}
        />
      </div>

      <div className={styles.col}>
        <Toggle
          label="GPS отслеживание"
          checked={asBool(h.gpsTracking, true)}
          onChange={(v) => setH('gpsTracking', v)}
        />
        {asBool(h.gpsTracking, true) ? (
          <>
            <Check
              label="Отслеживать местоположение"
              checked={asBool(h.trackLocation, true)}
              onChange={(v) => setH('trackLocation', v)}
            />
            <Check
              label={'Отслеживание местоположения через "Google Service"'}
              checked={asBool(h.trackViaGoogleService)}
              onChange={(v) => setH('trackViaGoogleService', v)}
            />
            <Check
              label="Автоматический уход по GPS"
              checked={asBool(h.autoOutByGps)}
              onChange={(v) => setH('autoOutByGps', v)}
            />
            <Check
              label="Отслеживание местоположения по времени прихода и ухода"
              checked={asBool(h.trackByInOutTime)}
              onChange={(v) => setH('trackByInOutTime', v)}
            />
          </>
        ) : null}

        <label className={styles.field}>
          Максимальное время ожидания отметки ухода (часы)
          <input
            type="number"
            min={0}
            step={1}
            value={asNum(h.maxWaitOutMarkHours, 2)}
            onChange={(e) => setH('maxWaitOutMarkHours', Number(e.target.value))}
          />
        </label>

        <label className={styles.field}>
          Качество GPS отслеживания
          <select
            value={asStr(h.gpsQuality, 'high')}
            onChange={(e) => setH('gpsQuality', e.target.value)}
          >
            <option value="high">Высокое</option>
            <option value="medium">Среднее</option>
            <option value="low">Низкое</option>
          </select>
        </label>

        <label className={styles.field}>
          Срок действия авторизации (дни)
          <input
            type="number"
            min={1}
            step={1}
            value={asNum(h.authValidityDays, 7)}
            onChange={(e) => setH('authValidityDays', Number(e.target.value))}
          />
          <span className={styles.hint}>По умолчанию: 1 день (Verifix demo: 7)</span>
        </label>

        <Check
          label="Использовать план-график задач"
          checked={asBool(h.useTaskPlanSchedule)}
          onChange={(v) => setH('useTaskPlanSchedule', v)}
        />
        <Check
          label="Используется внутренняя командировка"
          checked={asBool(h.useInternalTrip)}
          onChange={(v) => setH('useInternalTrip', v)}
        />
        <Check
          label="Уведомление об итоге дня"
          checked={asBool(h.notifyDayResult)}
          onChange={(v) => setH('notifyDayResult', v)}
        />
        <Check
          label="Уведомление о конце рабочей недели"
          checked={asBool(h.notifyEndOfWorkWeek)}
          onChange={(v) => setH('notifyEndOfWorkWeek', v)}
        />
        <Check
          label="Показывать зарплату"
          checked={asBool(h.showSalary, true)}
          onChange={(v) => setH('showSalary', v)}
        />
      </div>
    </div>
  );
}

/* ─── Timepad (matches Verifix «Настройки для Timepad») ──────────────────── */

function TimepadSettingsForm({
  value,
  onChange,
}: {
  value: SystemSettings;
  onChange: (next: SystemSettings) => void;
}) {
  const t = value || {};
  const setT = (key: string, val: unknown) => onChange({ ...t, [key]: val });

  return (
    <div className={styles.grid2}>
      <div className={styles.col}>
        <label className={styles.field}>
          Время действия QR-Code *
          <input
            type="time"
            step={60}
            value={asStr(t.qrCodeTtl, '00:10')}
            onChange={(e) => setT('qrCodeTtl', e.target.value)}
            required
          />
        </label>

        <label className={styles.field}>
          Язык *
          <select
            value={asStr(t.language, 'ru')}
            onChange={(e) => setT('language', e.target.value)}
            required
          >
            <option value="ru">Русский</option>
            <option value="uz">Oʻzbekcha</option>
            <option value="en">English</option>
          </select>
        </label>

        <p className={styles.sectionTitle}>Типы отметок</p>
        <Check
          label="Приход"
          checked={asBool(t.markTypeIn, true)}
          onChange={(v) => setT('markTypeIn', v)}
        />
        <Check
          label="Уход"
          checked={asBool(t.markTypeOut, true)}
          onChange={(v) => setT('markTypeOut', v)}
        />
        <Check
          label="Отмена"
          checked={asBool(t.markTypeCancel)}
          onChange={(v) => setT('markTypeCancel', v)}
        />
        <Check
          label="Перерыв приход"
          checked={asBool(t.markTypeBreakIn, true)}
          onChange={(v) => setT('markTypeBreakIn', v)}
        />
        <Check
          label="Перерыв уход"
          checked={asBool(t.markTypeBreakOut, true)}
          onChange={(v) => setT('markTypeBreakOut', v)}
        />
      </div>

      <div className={styles.col}>
        <p className={styles.sectionTitle}>Тип идентификации</p>
        <Check label="QR-код" checked={asBool(t.idQr, true)} onChange={(v) => setT('idQr', v)} />
        <Check
          label="Пароль"
          checked={asBool(t.idPassword, true)}
          onChange={(v) => setT('idPassword', v)}
        />

        <p className={styles.sectionTitle}>Биометрия</p>
        <Check
          label="Распознавание лица"
          checked={asBool(t.faceRecognition, true)}
          onChange={(v) => setT('faceRecognition', v)}
        />
        <Check
          label="Проверка эмоций - закрытие глаза"
          checked={asBool(t.emotionEyes, true)}
          onChange={(v) => setT('emotionEyes', v)}
        />
        <Check
          label="Проверка эмоций - улыбка"
          checked={asBool(t.emotionSmile, true)}
          onChange={(v) => setT('emotionSmile', v)}
        />
      </div>
    </div>
  );
}

/* ─── Required fields (Verifix «Настройки обязательных полей») ───────────── */

type Section = Record<string, unknown>;

function RequiredFieldsSettingsForm({
  value,
  onChange,
}: {
  value: SystemSettings;
  onChange: (next: SystemSettings) => void;
}) {
  const r = value || {};

  function sectionOf(key: string): Section {
    const sec = r[key];
    return sec && typeof sec === 'object' && !Array.isArray(sec) ? (sec as Section) : {};
  }

  function setSection(key: string, field: string, val: unknown) {
    const prev = sectionOf(key);
    onChange({ ...r, [key]: { ...prev, [field]: val } });
  }

  function toggles(section: string, items: [string, string][], fallback = true) {
    return items.map(([field, label]) => (
      <Toggle
        key={`${section}.${field}`}
        label={label}
        checked={asBool(sectionOf(section)[field], fallback)}
        onChange={(v) => setSection(section, field, v)}
      />
    ));
  }

  function numField(section: string, field: string, label: string, fallback = 0) {
    return (
      <label className={styles.field} key={`${section}.${field}`}>
        {label}
        <input
          type="number"
          min={0}
          step={1}
          value={asNum(sectionOf(section)[field], fallback)}
          onChange={(e) => setSection(section, field, Number(e.target.value))}
        />
      </label>
    );
  }

  return (
    <div className={styles.grid2}>
      <div className={styles.col}>
        <p className={styles.sectionTitle}>Сотрудник</p>
        {toggles('employee', [
          ['lastName', 'Фамилия'],
          ['patronymic', 'Отчество'],
          ['birthDate', 'Дата рождения'],
          ['phone', 'Номер телефона'],
          ['email', 'E-mail'],
          ['region', 'Регион'],
          ['address', 'Адрес'],
          ['registrationAddress', 'Адрес по прописке'],
          ['passport', 'Серия и номер паспорта'],
          ['pinfl', 'ПИНФЛ'],
          ['inps', 'ИНПС'],
          ['login', 'Логин'],
        ])}
      </div>

      <div className={styles.col}>
        <p className={styles.sectionTitle}>Запрос на отсутствие</p>
        {toggles('absenceRequest', [['note', 'Примечание']])}
        {numField('absenceRequest', 'minNoteChars', 'Минимальное кол-во символов')}

        <p className={styles.sectionTitle}>Запрос на изменение рабочего графика</p>
        {toggles('scheduleChangeRequest', [['note', 'Примечание']])}
        {numField('scheduleChangeRequest', 'maxNoteChars', 'Максимальное кол-во символов')}

        <p className={styles.sectionTitle}>Запрос на отметку</p>
        {toggles('markRequest', [
          ['location', 'Локация'],
          ['photoVideo', 'Фото/Видео'],
          ['fileOnComplete', 'Прикрепление файла при завершении'],
          ['note', 'Примечание'],
        ])}
        {numField('markRequest', 'maxNoteChars', 'Максимальное кол-во символов')}

        <p className={styles.sectionTitle}>Индивидуальный график</p>
        {toggles('individualSchedule', [['productionCalendar', 'Производственный календарь']])}

        <p className={styles.sectionTitle}>Прием на работу</p>
        {toggles('hiring', [
          ['workSchedule', 'График работы'],
          ['onProbation', 'На испытание'],
        ])}

        <p className={styles.sectionTitle}>Больничный лист</p>
        {toggles('sickLeave', [['file', 'Файл']])}

        <p className={styles.sectionTitle}>Увольнение</p>
        {toggles('dismissal', [
          ['reason', 'Причина увольнения'],
          ['file', 'Файл'],
        ])}

        <p className={styles.sectionTitle}>Заявка на увольнение</p>
        {toggles('dismissalRequest', [['reason', 'Причина увольнения']])}

        <p className={styles.sectionTitle}>Запрос на сверхурочные</p>
        {toggles('overtimeRequest', [['note', 'Примечание']])}
        {numField('overtimeRequest', 'minNoteChars', 'Минимальное кол-во символов')}
      </div>
    </div>
  );
}

/* ─── Recruitment (Verifix «Настройки рекрутинга») ───────────────────────── */

type PayLine = { id: string; name: string; indicators: string };

function newPayLine(): PayLine {
  return {
    id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    indicators: '',
  };
}

function asPayLines(v: unknown): PayLine[] {
  if (!Array.isArray(v) || v.length === 0) return [newPayLine()];
  return v.map((item, i) => {
    const o =
      item && typeof item === 'object' && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : {};
    return {
      id: o.id != null && String(o.id) ? String(o.id) : `pay_${i}`,
      name: o.name != null ? String(o.name) : '',
      indicators: o.indicators != null ? String(o.indicators) : '',
    };
  });
}

function RecruitmentSettingsForm({
  value,
  onChange,
}: {
  value: SystemSettings;
  onChange: (next: SystemSettings) => void;
}) {
  const r = value || {};
  const setR = (key: string, val: unknown) => onChange({ ...r, [key]: val });

  function updateLines(key: 'internshipAccruals' | 'internshipDeductions', next: PayLine[]) {
    setR(key, next);
  }

  function setLine(
    key: 'internshipAccruals' | 'internshipDeductions',
    id: string,
    field: 'name' | 'indicators',
    val: string,
  ) {
    const lines = asPayLines(r[key]);
    updateLines(
      key,
      lines.map((l) => (l.id === id ? { ...l, [field]: val } : l)),
    );
  }

  function removeLine(key: 'internshipAccruals' | 'internshipDeductions', id: string) {
    const lines = asPayLines(r[key]).filter((l) => l.id !== id);
    updateLines(key, lines.length ? lines : [newPayLine()]);
  }

  function addLine(key: 'internshipAccruals' | 'internshipDeductions') {
    updateLines(key, [...asPayLines(r[key]), newPayLine()]);
  }

  function payTable(
    key: 'internshipAccruals' | 'internshipDeductions',
    title: string,
    nameCol = 'Начисление',
  ) {
    const lines = asPayLines(r[key]);
    return (
      <div className={styles.payBlock}>
        <p className={styles.payBlockTitle}>{title}</p>
        <div className={styles.payTableWrap}>
          <table className={styles.payTable}>
            <thead>
              <tr>
                <th className={styles.payNum}>№</th>
                <th>{nameCol}</th>
                <th>Показатели</th>
                <th className={styles.payActions}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={line.id}>
                  <td className={styles.payNum}>{i + 1}</td>
                  <td>
                    <input
                      type="text"
                      className={styles.payInput}
                      value={line.name}
                      onChange={(e) => setLine(key, line.id, 'name', e.target.value)}
                      placeholder="Поиск…"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className={styles.payInput}
                      value={line.indicators}
                      onChange={(e) => setLine(key, line.id, 'indicators', e.target.value)}
                      placeholder="Поиск…"
                    />
                  </td>
                  <td className={styles.payActions}>
                    <button
                      type="button"
                      className={styles.payDelete}
                      title="Удалить"
                      aria-label="Удалить"
                      onClick={() => removeLine(key, line.id)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M6 7h12M10 7V5h4v2m-6 0v12a1 1 0 001 1h6a1 1 0 001-1V7"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className={styles.payAdd} onClick={() => addLine(key)}>
            +
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.grid2}>
      <div className={styles.col}>
        <Check
          label="Автоматическое создание вакансии при одобрении заявки"
          checked={asBool(r.autoCreateVacancyOnApproval, true)}
          onChange={(v) => setR('autoCreateVacancyOnApproval', v)}
        />
        <Check
          label="Переводить резервных кандидатов на вакансию, автоматически созданную из заявки"
          checked={asBool(r.moveReserveToAutoVacancy, true)}
          onChange={(v) => setR('moveReserveToAutoVacancy', v)}
        />

        <label className={styles.field}>
          Период активации резервных кандидатов (дни)
          <input
            type="number"
            min={0}
            step={1}
            value={asStr(r.reserveActivationDays, '')}
            onChange={(e) => setR('reserveActivationDays', e.target.value)}
          />
          <span className={styles.hint}>
            Сколько дней после попадания в резерв кандидат остаётся активным для предложения
          </span>
        </label>

        <Check
          label="Предлагать ближайшие вакансии резервным кандидатам"
          checked={asBool(r.suggestNearestVacancies, true)}
          onChange={(v) => setR('suggestNearestVacancies', v)}
        />

        <label className={styles.field}>
          Радиус поиска ближайших вакансий (км) *
          <input
            type="number"
            min={0}
            step={0.1}
            required
            value={asStr(r.nearestVacancyRadiusKm, '10')}
            onChange={(e) => setR('nearestVacancyRadiusKm', e.target.value)}
          />
        </label>

        <Check
          label="Фильтровать предлагаемые вакансии по возрасту кандидата"
          checked={asBool(r.filterVacanciesByAge, true)}
          onChange={(v) => setR('filterVacanciesByAge', v)}
        />
        <Check
          label="Фильтровать предлагаемые вакансии по полу кандидата"
          checked={asBool(r.filterVacanciesByGender, true)}
          onChange={(v) => setR('filterVacanciesByGender', v)}
        />
      </div>

      <div className={styles.col}>
        <p className={styles.sectionTitle}>Настройки выплат стажировки по умолчанию</p>
        {payTable('internshipAccruals', 'Начисления (стажировка)', 'Начисление')}
        {payTable('internshipDeductions', 'Удержания (стажировка)', 'Удержание')}
      </div>
    </div>
  );
}
