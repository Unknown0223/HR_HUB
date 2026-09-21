/** Incident lifecycle helpers (HR HUB P1 / F4). */

export type IncidentLifecycleStatus =
  | 'open'
  | 'investigating'
  | 'resolved'
  | 'closed';

export type IncidentLifecycleAction = 'investigate' | 'resolve' | 'close';

export type IncidentTransitionOk = {
  ok: true;
  status: IncidentLifecycleStatus;
  setResolvedAt: boolean;
};

export type IncidentTransitionErr = {
  ok: false;
  message: string;
};

export function transitionIncidentStatus(
  current: string | null | undefined,
  action: IncidentLifecycleAction,
): IncidentTransitionOk | IncidentTransitionErr {
  const status = (current || 'open') as IncidentLifecycleStatus;
  const allowed: IncidentLifecycleStatus[] = [
    'open',
    'investigating',
    'resolved',
    'closed',
  ];
  if (!allowed.includes(status)) {
    return { ok: false, message: `Неизвестный статус инцидента: ${current}` };
  }

  if (action === 'investigate') {
    if (status === 'closed' || status === 'resolved') {
      return {
        ok: false,
        message: 'Нельзя открыть расследование для решённого/закрытого инцидента',
      };
    }
    if (status === 'investigating') {
      return { ok: false, message: 'Инцидент уже в расследовании' };
    }
    return { ok: true, status: 'investigating', setResolvedAt: false };
  }

  if (action === 'resolve') {
    if (status === 'closed') {
      return { ok: false, message: 'Закрытый инцидент нельзя решить' };
    }
    if (status === 'resolved') {
      return { ok: false, message: 'Инцидент уже решён' };
    }
    return { ok: true, status: 'resolved', setResolvedAt: true };
  }

  // close
  if (status === 'closed') {
    return { ok: false, message: 'Инцидент уже закрыт' };
  }
  return { ok: true, status: 'closed', setResolvedAt: false };
}
