              {tab === 'absences' ? (
                <div className={styles.absLayout}>
                  <div className={styles.absMain}>
                  <div className={styles.section}>
                    <div className={styles.locHead}>
                      <h3 className={styles.locTitle}>Не подтвержденные запросы</h3>
                      <button
                        type="button"
                        className={styles.btnAdd}
                        disabled={busy}
                        onClick={() => {
                          void loadAbsenceTypes();
                          setAbsAddOpen(true);
                        }}
                      >
                        Добавить
                      </button>
                    </div>
                    <div className={styles.absToolbar}>
                      <div className={styles.absSearchWrap}>
                        <span className={styles.absSearchIcon} aria-hidden>
                          ⌕
                        </span>
                        <input
                          className={styles.absSearch}
                          placeholder="Поиск"
                          value={absQueryPending}
                          onChange={(e) => {
                            setAbsQueryPending(e.target.value);
                            setAbsPagePending(1);
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className={`${styles.absToolBtn} ${
                          absFilterOpen ? styles.absToolBtnActive : ''
                        }`}
                        title="Фильтр"
                        onClick={() => {
                          void loadAbsenceTypes();
                          setAbsFilterDraft({ ...absFilterApplied });
                          setAbsFilterOpen((v) => !v);
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M4 6h16M7 12h10M10 18h4"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                        {absFilterActiveCount > 0 ? (
                          <span className={styles.absFilterBadge}>{absFilterActiveCount}</span>
                        ) : null}
                      </button>
                      <div className={styles.absMenuWrap}>
                        <button
                          type="button"
                          className={styles.absToolBtn}
                          title="Excel"
                          onClick={() => setAbsPageSizeOpen((v) => !v)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path
                              d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
                              stroke="currentColor"
                              strokeWidth="1.6"
                            />
                            <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.6" />
                          </svg>
                        </button>
                        {absPageSizeOpen ? (
                          <div className={styles.absMenu}>
                            {[50, 100, 500, 1000].map((n) => (
                              <button
                                key={n}
                                type="button"
                                className={styles.absMenuItem}
                                onClick={() => {
                                  setAbsPageSize(n);
                                  setAbsPagePending(1);
                                  setAbsPageDecided(1);
                                  setAbsPageSizeOpen(false);
                                }}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <span className={styles.absPager}>
                        {pendingAbsences.length === 0
                          ? '0 / 0'
                          : `${(absPagePending - 1) * absPageSize + 1}–${Math.min(
                              absPagePending * absPageSize,
                              pendingAbsences.length,
                            )} / ${pendingAbsences.length}`}
                      </span>
                      <button
                        type="button"
                        className={styles.absToolBtn}
                        disabled={absPagePending <= 1}
                        onClick={() => setAbsPagePending((p) => Math.max(1, p - 1))}
                      >
                        ‹
                      </button>
                      <span className={styles.absPageNum}>{absPagePending}</span>
                      <button
                        type="button"
                        className={styles.absToolBtn}
                        disabled={absPagePending >= pendingPageCount}
                        onClick={() =>
                          setAbsPagePending((p) => Math.min(pendingPageCount, p + 1))
                        }
                      >
                        ›
                      </button>
                      <button
                        type="button"
                        className={styles.absToolBtn}
                        title="Обновить"
                        onClick={() => void load()}
                      >
                        ↻
                      </button>
                      <div className={styles.absMenuWrap}>
                        <button
                          type="button"
                          className={styles.absToolBtn}
                          title="Меню"
                          onClick={() =>
                            setAbsMenuOpen((m) => (m === 'pending' ? null : 'pending'))
                          }
                        >
                          ≡
                        </button>
                        {absMenuOpen === 'pending' ? (
                          <div className={styles.absMenu}>
                            <div className={styles.absMenuGroup}>СОРТИРОВКА</div>
                            <button
                              type="button"
                              className={styles.absMenuItem}
                              onClick={() => {
                                setAbsSortAsc((v) => !v);
                                setAbsMenuOpen(null);
                              }}
                            >
                              По дате запроса {absSortAsc ? '↑' : '↓'}
                            </button>
                            <div className={styles.absMenuGroup}>НАСТРОЙКА ТАБЛИЦЫ</div>
                            <button
                              type="button"
                              className={styles.absMenuItem}
                              onClick={() => {
                                exportAbsExcel(pendingAbsences, 'unconfirmed-requests.csv');
                              }}
                            >
                              СКАЧАТЬ В EXCEL
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th style={{ width: 36 }}>
                              <input
                                type="checkbox"
                                checked={
                                  pendingPageRows.length > 0 &&
                                  pendingPageRows.every((a) => absSelected.includes(a.id))
                                }
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setAbsSelected((s) => [
                                      ...new Set([...s, ...pendingPageRows.map((a) => a.id)]),
                                    ]);
                                  } else {
                                    const drop = new Set(pendingPageRows.map((a) => a.id));
                                    setAbsSelected((s) => s.filter((x) => !drop.has(x)));
                                  }
                                }}
                              />
                            </th>
                            <th>
                              <button
                                type="button"
                                className={styles.thSort}
                                onClick={() => setAbsSortAsc((v) => !v)}
                              >
                                Дата запроса {absSortAsc ? '↑' : '↓'}
                              </button>
                            </th>
                            <th>Вид отсутствия</th>
                            <th>Время</th>
                            <th>Примечание</th>
                            <th>Примечание руководителем</th>
                            <th>Состояние</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {pendingPageRows.length === 0 ? (
                            <EmptyRow cols={8} />
                          ) : (
                            pendingPageRows.map((a) => {
                              const reqDate =
                                (a.meta?.requestDate as string) ||
                                a.createdAt ||
                                a.startDate;
                              const review = (a.meta?.reviewNote as string) || '';
                              return (
                                <tr key={a.id}>
                                  <td>
                                    <input
                                      type="checkbox"
                                      checked={absSelected.includes(a.id)}
                                      onChange={(e) => {
                                        setAbsSelected((s) =>
                                          e.target.checked
                                            ? [...s, a.id]
                                            : s.filter((x) => x !== a.id),
                                        );
                                      }}
                                    />
                                  </td>
                                  <td>{fmtDate(String(reqDate))}</td>
                                  <td>{a.absenceType.name}</td>
                                  <td>
                                    {fmtDate(a.startDate)} – {fmtDate(a.endDate)}
                                    {absDaySpan(a.startDate, a.endDate) === 1 &&
                                    absenceRequestKind(a) === 'part_day'
                                      ? ' (часть дня)'
                                      : ''}
                                  </td>
                                  <td>{a.note || '—'}</td>
                                  <td>{review || '—'}</td>
                                  <td>
                                    <span className={`${styles.badge} ${styles.badgeWarn}`}>
                                      {absenceStatusRu(a.status, a.endDate)}
                                    </span>
                                  </td>
                                  <td className={styles.absActions}>
                                    <button
                                      type="button"
                                      className={styles.viewBtn}
                                      disabled={absBusyId === a.id || busy}
                                      onClick={() => void patchAbsenceStatus(a.id, 'approved')}
                                    >
                                      Подтвердить
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.btnGhost}
                                      disabled={absBusyId === a.id || busy}
                                      onClick={() => void patchAbsenceStatus(a.id, 'rejected')}
                                    >
                                      Отклонить
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className={styles.section}>
                    <h3 className={styles.blockTitle}>
                      Подтвержденные и отклоненные запросы
                    </h3>
                    <div className={styles.absToolbar}>
                      <div className={styles.absSearchWrap}>
                        <span className={styles.absSearchIcon} aria-hidden>
                          ⌕
                        </span>
                        <input
                          className={styles.absSearch}
                          placeholder="Поиск"
                          value={absQueryDecided}
                          onChange={(e) => {
                            setAbsQueryDecided(e.target.value);
                            setAbsPageDecided(1);
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className={`${styles.absToolBtn} ${
                          absFilterOpen ? styles.absToolBtnActive : ''
                        }`}
                        title="Фильтр"
                        onClick={() => {
                          void loadAbsenceTypes();
                          setAbsFilterDraft({ ...absFilterApplied });
                          setAbsFilterOpen((v) => !v);
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M4 6h16M7 12h10M10 18h4"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                        {absFilterActiveCount > 0 ? (
                          <span className={styles.absFilterBadge}>{absFilterActiveCount}</span>
                        ) : null}
                      </button>
                      <span className={styles.absPager}>
                        {decidedAbsences.length === 0
                          ? '0 / 0'
                          : `${(absPageDecided - 1) * absPageSize + 1}–${Math.min(
                              absPageDecided * absPageSize,
                              decidedAbsences.length,
                            )} / ${decidedAbsences.length}`}
                      </span>
                      <button
                        type="button"
                        className={styles.absToolBtn}
                        disabled={absPageDecided <= 1}
                        onClick={() => setAbsPageDecided((p) => Math.max(1, p - 1))}
                      >
                        ‹
                      </button>
                      <span className={styles.absPageNum}>{absPageDecided}</span>
                      <button
                        type="button"
                        className={styles.absToolBtn}
                        disabled={absPageDecided >= decidedPageCount}
                        onClick={() =>
                          setAbsPageDecided((p) => Math.min(decidedPageCount, p + 1))
                        }
                      >
                        ›
                      </button>
                      <button
                        type="button"
                        className={styles.absToolBtn}
                        title="Обновить"
                        onClick={() => void load()}
                      >
                        ↻
                      </button>
                      <div className={styles.absMenuWrap}>
                        <button
                          type="button"
                          className={styles.absToolBtn}
                          onClick={() =>
                            setAbsMenuOpen((m) => (m === 'decided' ? null : 'decided'))
                          }
                        >
                          ≡
                        </button>
                        {absMenuOpen === 'decided' ? (
                          <div className={styles.absMenu}>
                            <div className={styles.absMenuGroup}>СОРТИРОВКА</div>
                            <div className={styles.absMenuGroup}>НАСТРОЙКА ТАБЛИЦЫ</div>
                            <button
                              type="button"
                              className={styles.absMenuItem}
                              onClick={() =>
                                exportAbsExcel(decidedAbsences, 'confirmed-requests.csv')
                              }
                            >
                              СКАЧАТЬ В EXCEL
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th style={{ width: 36 }} />
                            <th>Дата запроса</th>
                            <th>Вид отсутствия</th>
                            <th>Время</th>
                            <th>Примечание</th>
                            <th>Примечание руководителем</th>
                            <th>Состояние</th>
                          </tr>
                        </thead>
                        <tbody>
                          {decidedPageRows.length === 0 ? (
                            <EmptyRow cols={7} />
                          ) : (
                            decidedPageRows.map((a) => {
                              const reqDate =
                                (a.meta?.requestDate as string) ||
                                a.createdAt ||
                                a.startDate;
                              const review = (a.meta?.reviewNote as string) || '';
                              const label = absenceStatusRu(a.status, a.endDate);
                              const badgeClass =
                                a.status === 'rejected'
                                  ? styles.badgeDanger
                                  : label === 'Завершен'
                                    ? styles.badgeMuted
                                    : styles.badgeOk;
                              return (
                                <tr key={a.id}>
                                  <td>
                                    <input type="checkbox" readOnly tabIndex={-1} />
                                  </td>
                                  <td>{fmtDate(String(reqDate))}</td>
                                  <td>{a.absenceType.name}</td>
                                  <td>
                                    {fmtDate(a.startDate)} – {fmtDate(a.endDate)}
                                  </td>
                                  <td>{a.note || '—'}</td>
                                  <td>{review || '—'}</td>
                                  <td>
                                    <span className={`${styles.badge} ${badgeClass}`}>
                                      {label}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className={styles.section}>
                    <h3 className={styles.blockTitle}>Плановые начисления</h3>
                    <div className={styles.absToolbar}>
                      <div className={styles.absSearchWrap}>
                        <span className={styles.absSearchIcon} aria-hidden>
                          ⌕
                        </span>
                        <input
                          className={styles.absSearch}
                          placeholder="Поиск"
                          value={absQueryAccrual}
                          onChange={(e) => setAbsQueryAccrual(e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        className={styles.absToolBtn}
                        title="Обновить"
                        onClick={() => void load()}
                      >
                        ↻
                      </button>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Вид отсутствия</th>
                            <th>Вид начисления</th>
                            <th>Начало</th>
                            <th>Конец</th>
                            <th>Начислено</th>
                            <th>Использовано</th>
                            <th>Осталось</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plannedAccruals.length === 0 ? (
                            <EmptyRow cols={7} />
                          ) : (
                            plannedAccruals.map((r) => (
                              <tr key={r.id}>
                                <td>{r.absenceType}</td>
                                <td>{r.accrualType}</td>
                                <td>{fmtDate(r.startDate)}</td>
                                <td>{fmtDate(r.endDate)}</td>
                                <td>{r.accrued}</td>
                                <td>{r.used}</td>
                                <td>{r.remaining}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  </div>

                  {absFilterOpen ? (
                    <aside className={styles.absFilterPanel} aria-label="Фильтр">
                      <div className={styles.absFilterHead}>
                        <h3 className={styles.absFilterTitle}>Фильтр</h3>
                        <div className={styles.absFilterHeadActions}>
                          <button
                            type="button"
                            className={styles.absToolBtn}
                            title="Свернуть"
                            onClick={() => setAbsFilterOpen(false)}
                          >
                            ›
                          </button>
                          <button
                            type="button"
                            className={styles.absToolBtn}
                            aria-label="Закрыть"
                            onClick={() => setAbsFilterOpen(false)}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <div className={styles.absFilterTools}>
                        <button type="button" className={styles.absTplBtn}>
                          Шаблон ▾
                        </button>
                        <button
                          type="button"
                          className={styles.absToolBtn}
                          title="По умолчанию"
                          onClick={() => {
                            setAbsFilterDraft(EMPTY_ABS_FILTER);
                            setAbsFilterRows([...DEFAULT_ABS_FILTER_ROWS]);
                          }}
                        >
                          ↻
                        </button>
                        <div className={styles.absMenuWrap}>
                          <button
                            type="button"
                            className={styles.absParamBtn}
                            onClick={() => setAbsAddParamOpen((v) => !v)}
                          >
                            Добавить параметры ▾
                          </button>
                          {absAddParamOpen ? (
                            <div className={`${styles.absMenu} ${styles.absMenuRight}`}>
                              {(
                                [
                                  ['requestDate', 'Дата запроса'],
                                  ['absenceType', 'Вид отсутствия'],
                                  ['requestKind', 'Тип запроса'],
                                  ['status', 'Состояние'],
                                  ['start', 'Начало'],
                                  ['end', 'Конец'],
                                  ['accrualType', 'Вид начисления'],
                                  ['createdAt', 'Дата создания'],
                                ] as const
                              ).map(([key, label]) => (
                                <button
                                  key={key}
                                  type="button"
                                  className={styles.absMenuItem}
                                  disabled={absFilterRows.includes(key)}
                                  onClick={() => {
                                    setAbsFilterRows((r) => [...r, key]);
                                    setAbsAddParamOpen(false);
                                  }}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className={styles.absFilterBody}>
                        {absFilterRows.map((rowKey) => (
                          <div key={rowKey} className={styles.absFilterCard}>
                            <div className={styles.absFilterCardTop}>
                              <span className={styles.filterDrag} aria-hidden>
                                =
                              </span>
                              <span className={styles.absFilterCardLabel}>
                                {rowKey === 'requestDate'
                                  ? 'Дата запроса'
                                  : rowKey === 'absenceType'
                                    ? 'Вид отсутствия'
                                    : rowKey === 'requestKind'
                                      ? 'Тип запроса'
                                      : rowKey === 'status'
                                        ? 'Состояние'
                                        : rowKey === 'start'
                                          ? 'Начало'
                                          : rowKey === 'end'
                                            ? 'Конец'
                                            : rowKey === 'accrualType'
                                              ? 'Вид начисления'
                                              : 'Дата создания'}
                              </span>
                              {rowKey === 'absenceType' ? (
                                <button
                                  type="button"
                                  className={styles.linkBtn}
                                  onClick={() =>
                                    setAbsFilterDraft((d) => ({
                                      ...d,
                                      absenceTypeIds: absTypes.map((t) => t.id),
                                    }))
                                  }
                                >
                                  выбрать все
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className={styles.filterRemove}
                                aria-label="Удалить"
                                onClick={() =>
                                  setAbsFilterRows((rows) =>
                                    rows.filter((r) => r !== rowKey),
                                  )
                                }
                              >
                                ×
                              </button>
                            </div>
                            {rowKey === 'requestDate' ||
                            rowKey === 'start' ||
                            rowKey === 'end' ||
                            rowKey === 'createdAt' ? (
                              <div className={styles.dateRange}>
                                <input
                                  type="date"
                                  value={
                                    rowKey === 'requestDate'
                                      ? absFilterDraft.requestDateFrom
                                      : rowKey === 'start'
                                        ? absFilterDraft.startFrom
                                        : rowKey === 'end'
                                          ? absFilterDraft.endFrom
                                          : ''
                                  }
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setAbsFilterDraft((d) => ({
                                      ...d,
                                      ...(rowKey === 'requestDate'
                                        ? { requestDateFrom: v }
                                        : rowKey === 'start'
                                          ? { startFrom: v }
                                          : rowKey === 'end'
                                            ? { endFrom: v }
                                            : {}),
                                    }));
                                  }}
                                />
                                <input
                                  type="date"
                                  value={
                                    rowKey === 'requestDate'
                                      ? absFilterDraft.requestDateTo
                                      : rowKey === 'start'
                                        ? absFilterDraft.startTo
                                        : rowKey === 'end'
                                          ? absFilterDraft.endTo
                                          : ''
                                  }
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setAbsFilterDraft((d) => ({
                                      ...d,
                                      ...(rowKey === 'requestDate'
                                        ? { requestDateTo: v }
                                        : rowKey === 'start'
                                          ? { startTo: v }
                                          : rowKey === 'end'
                                            ? { endTo: v }
                                            : {}),
                                    }));
                                  }}
                                />
                              </div>
                            ) : null}
                            {rowKey === 'absenceType' ? (
                              <div className={styles.absTypePicker}>
                                <input
                                  className={styles.absTypeSearch}
                                  placeholder="Поиск..."
                                  value={absTypeSearch}
                                  onChange={(e) => setAbsTypeSearch(e.target.value)}
                                />
                                <div className={styles.absTypeList}>
                                  {filteredAbsTypes.map((t) => {
                                    const checked = absFilterDraft.absenceTypeIds.includes(
                                      t.id,
                                    );
                                    return (
                                      <label key={t.id} className={styles.checkLabel}>
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={(e) => {
                                            setAbsFilterDraft((d) => ({
                                              ...d,
                                              absenceTypeIds: e.target.checked
                                                ? [...d.absenceTypeIds, t.id]
                                                : d.absenceTypeIds.filter((x) => x !== t.id),
                                            }));
                                          }}
                                        />
                                        {t.name}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}
                            {rowKey === 'requestKind' ? (
                              <div className={styles.checkCol}>
                                {(
                                  [
                                    ['part_day', 'Часть дня'],
                                    ['full_day', 'Весь день'],
                                    ['multi_day', 'Несколько дней'],
                                  ] as const
                                ).map(([k, label]) => (
                                  <label key={k} className={styles.checkLabel}>
                                    <input
                                      type="checkbox"
                                      checked={absFilterDraft.requestKinds.includes(k)}
                                      onChange={(e) => {
                                        setAbsFilterDraft((d) => ({
                                          ...d,
                                          requestKinds: e.target.checked
                                            ? [...d.requestKinds, k]
                                            : d.requestKinds.filter((x) => x !== k),
                                        }));
                                      }}
                                    />
                                    {label}
                                  </label>
                                ))}
                              </div>
                            ) : null}
                            {rowKey === 'status' ? (
                              <div className={styles.checkGrid2}>
                                {(
                                  [
                                    ['pending', 'В ожидании'],
                                    ['approved', 'Подтвержден'],
                                    ['incoming', 'Входящий'],
                                    ['rejected', 'Отклонен'],
                                  ] as const
                                ).map(([k, label]) => (
                                  <label key={k} className={styles.checkLabel}>
                                    <input
                                      type="checkbox"
                                      checked={absFilterDraft.statuses.includes(k)}
                                      onChange={(e) => {
                                        setAbsFilterDraft((d) => ({
                                          ...d,
                                          statuses: e.target.checked
                                            ? [...d.statuses, k]
                                            : d.statuses.filter((x) => x !== k),
                                        }));
                                      }}
                                    />
                                    {label}
                                  </label>
                                ))}
                              </div>
                            ) : null}
                            {rowKey === 'accrualType' ? (
                              <input readOnly value="Плановый" className={styles.absTypeSearch} />
                            ) : null}
                          </div>
                        ))}
                      </div>
                      <div className={styles.absFilterFoot}>
                        <button
                          type="button"
                          className={styles.btn}
                          onClick={() => {
                            setAbsFilterApplied({ ...absFilterDraft });
                            setAbsPagePending(1);
                            setAbsPageDecided(1);
                          }}
                        >
                          Применить
                        </button>
                        <button
                          type="button"
                          className={styles.btnGhost}
                          onClick={() => {
                            setAbsFilterDraft(EMPTY_ABS_FILTER);
                            setAbsFilterApplied(EMPTY_ABS_FILTER);
                            setAbsFilterRows([...DEFAULT_ABS_FILTER_ROWS]);
                            setAbsPagePending(1);
                            setAbsPageDecided(1);
                          }}
                        >
                          Показать все
                        </button>
                      </div>
                    </aside>
                  ) : null}
                </div>
              ) : null}

