import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/api/team_repository.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';
import '../../shared/yandex_map_view.dart';
import 'team_common.dart';

enum _Filter { all, present, late, absent, off }

class TeamScreen extends ConsumerStatefulWidget {
  const TeamScreen({super.key});

  @override
  ConsumerState<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends ConsumerState<TeamScreen> {
  Map<String, dynamic>? _data;
  Object? _error;
  Timer? _poll;
  bool _mapMode = false;
  _Filter _filter = _Filter.all;

  TeamRepository get _repo => ref.read(teamRepositoryProvider);

  @override
  void initState() {
    super.initState();
    _load();
    _poll = Timer.periodic(const Duration(seconds: 30), (_) => _load());
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d = await _repo.list();
      if (!mounted) return;
      setState(() {
        _data = d;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  List<Map> get _items => ((_data?['items'] as List?) ?? const []).cast<Map>();

  bool _matches(Map m) {
    final s = (m['today'] as Map?)?['status']?.toString() ?? '';
    return switch (_filter) {
      _Filter.all => true,
      _Filter.present => s == 'on_time' || s == 'late',
      _Filter.late => s == 'late',
      _Filter.absent => s == 'absent' || s == 'not_started',
      _Filter.off => s == 'day_off' || s == 'holiday' || s == 'leave',
    };
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.chevron_left, size: 30),
          onPressed: () => context.pop(),
        ),
        titleSpacing: 0,
        title: Text(context.t('Mening jamoam')),
        actions: [
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      body: _data == null
          ? (_error != null
                ? EmptyState(message: '$_error')
                : const Center(child: CircularProgressIndicator()))
          : Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                  child: _SummaryHeader(
                    summary: (_data!['summary'] as Map?) ?? const {},
                    date: _data!['date']?.toString(),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: _ModeSwitch(
                    mapMode: _mapMode,
                    located: (_data!['summary'] as Map?)?['located'] ?? 0,
                    onChanged: (v) => setState(() => _mapMode = v),
                  ),
                ),
                const SizedBox(height: 12),
                Expanded(child: _mapMode ? _buildMap() : _buildList()),
              ],
            ),
    );
  }

  Widget _buildList() {
    final items = _items.where(_matches).toList();
    return RefreshIndicator(
      color: AppColors.accent,
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final f in _Filter.values)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(_filterLabel(f)),
                      selected: _filter == f,
                      showCheckmark: false,
                      selectedColor: AppColors.accent,
                      backgroundColor: AppColors.card,
                      side: BorderSide(
                        color: _filter == f ? AppColors.accent : AppColors.line,
                      ),
                      labelStyle: TextStyle(
                        color: _filter == f ? Colors.white : AppColors.ink,
                        fontWeight: FontWeight.w700,
                      ),
                      onSelected: (_) => setState(() => _filter = f),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (items.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 40),
              child: EmptyState(message: context.t('Bu bo‘limda xodim yo‘q')),
            )
          else
            for (final m in items) ...[
              _MemberCard(
                member: m,
                photoUrl: _repo.mediaUrl(m['photoUrl']?.toString()),
                onTap: () => context.push('/team/${m['employeeId']}'),
              ),
              const SizedBox(height: 10),
            ],
        ],
      ),
    );
  }

  Widget _buildMap() {
    final located = _items.where((m) => m['location'] is Map).toList();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(22),
        child: Stack(
          children: [
            YandexMapView(
              fitKey: located.map((m) => m['employeeId']).join(','),
              pins: [
                for (final m in located)
                  memberPin(
                    m,
                    photoUrl: photoDataUrl(
                      ref,
                      _repo.mediaUrl(m['photoUrl']?.toString()),
                    ),
                  ),
              ],
              onPinTap: (id) => context.push('/team/$id'),
            ),
            if (located.isEmpty)
              Positioned(
                left: 12,
                right: 12,
                bottom: 12,
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.95),
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: const [
                      BoxShadow(color: Color(0x22000000), blurRadius: 12),
                    ],
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.location_off_outlined,
                        color: AppColors.inkMuted,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          context.t(
                            'Hozir hech kimning joylashuvi yo‘q. Joylashuv faqat ish vaqti ichida ko‘rsatiladi.',
                          ),
                          style: const TextStyle(
                            color: AppColors.inkMuted,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  String _filterLabel(_Filter f) {
    int count(bool Function(Map) p) => _items.where(p).length;
    String s(Map m) => (m['today'] as Map?)?['status']?.toString() ?? '';
    return switch (f) {
      _Filter.all => context.t('Hammasi · {0}', [_items.length]),
      _Filter.present => context.t('Ishda · {0}', [
        count((m) => s(m) == 'on_time' || s(m) == 'late'),
      ]),
      _Filter.late => context.t('Kechikkan · {0}', [
        count((m) => s(m) == 'late'),
      ]),
      _Filter.absent => context.t('Kelmagan · {0}', [
        count((m) => s(m) == 'absent' || s(m) == 'not_started'),
      ]),
      _Filter.off => context.t('Dam olishda · {0}', [
        count((m) => ['day_off', 'holiday', 'leave'].contains(s(m))),
      ]),
    };
  }
}

class _SummaryHeader extends StatelessWidget {
  const _SummaryHeader({required this.summary, this.date});

  final Map summary;
  final String? date;

  @override
  Widget build(BuildContext context) {
    final d = DateTime.tryParse(date ?? '');
    final dateText = d == null
        ? ''
        : DateFormat('d MMMM, EEEE', context.dateLocale).format(d);
    int n(String k) => (summary[k] as num?)?.toInt() ?? 0;
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.headerTop, AppColors.headerBottom],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: AppColors.accent.withValues(alpha: 0.3),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.groups_rounded, color: Colors.white, size: 28),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.t('{0} ta xodim', [n('total')]),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (dateText.isNotEmpty)
                      Text(
                        dateText,
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.9),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              _stat(context.t('Ishda'), n('present'), Icons.check_circle_rounded),
              _stat(context.t('Kechikkan'), n('late'), Icons.schedule_rounded),
              _stat(
                context.t('Kelmagan'),
                n('absent') + n('notStarted'),
                Icons.cancel_rounded,
              ),
              _stat(
                context.t('Xaritada'),
                n('located'),
                Icons.location_on_rounded,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _stat(String label, int value, IconData icon) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 3),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.2),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          children: [
            Icon(icon, color: Colors.white, size: 20),
            const SizedBox(height: 4),
            Text(
              '$value',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.92),
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ModeSwitch extends StatelessWidget {
  const _ModeSwitch({
    required this.mapMode,
    required this.located,
    required this.onChanged,
  });

  final bool mapMode;
  final Object located;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    Widget tab(bool map, IconData icon, String label) {
      final active = mapMode == map;
      return Expanded(
        child: GestureDetector(
          onTap: () => onChanged(map),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            padding: const EdgeInsets.symmetric(vertical: 11),
            decoration: BoxDecoration(
              color: active ? AppColors.card : Colors.transparent,
              borderRadius: BorderRadius.circular(12),
              boxShadow: active
                  ? const [BoxShadow(color: Color(0x14000000), blurRadius: 8)]
                  : null,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  icon,
                  size: 20,
                  color: active ? AppColors.accent : AppColors.inkMuted,
                ),
                const SizedBox(width: 6),
                Text(
                  label,
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: active ? AppColors.ink : AppColors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.bgSoft,
        borderRadius: BorderRadius.circular(15),
      ),
      child: Row(
        children: [
          tab(false, Icons.view_list_rounded, context.t('Ro‘yxat')),
          tab(true, Icons.map_rounded, context.t('Xarita · {0}', [located])),
        ],
      ),
    );
  }
}

class _MemberCard extends StatelessWidget {
  const _MemberCard({required this.member, required this.onTap, this.photoUrl});

  final Map member;
  final String? photoUrl;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final today = (member['today'] as Map?) ?? const {};
    final status = today['status']?.toString() ?? 'not_started';
    final firstIn = formatApiTime(today['firstIn']);
    final lastOut = formatApiTime(today['lastOut']);
    final located = member['location'] is Map;
    final subtitle = [
      member['position'],
      member['division'],
    ].where((e) => e != null && e.toString().isNotEmpty).join(' · ');
    return Material(
      color: AppColors.card,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.line),
          ),
          child: Row(
            children: [
              MemberAvatar(
                name: member['fullName']?.toString(),
                photoUrl: photoUrl,
                status: status,
                online: member['online'] == true,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      member['fullName']?.toString() ?? '—',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                      ),
                    ),
                    if (subtitle.isNotEmpty)
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppColors.inkMuted,
                          fontSize: 13,
                        ),
                      ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        StatusPill(status: status),
                        if (firstIn.isNotEmpty)
                          _TimeTag(icon: Icons.login_rounded, text: firstIn),
                        if (lastOut.isNotEmpty)
                          _TimeTag(icon: Icons.logout_rounded, text: lastOut),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                children: [
                  Icon(
                    located
                        ? Icons.location_on_rounded
                        : Icons.location_off_outlined,
                    color: located ? AppColors.accent : AppColors.inkFaint,
                  ),
                  const SizedBox(height: 10),
                  const Icon(Icons.chevron_right, color: AppColors.inkMuted),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TimeTag extends StatelessWidget {
  const _TimeTag({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: AppColors.inkMuted),
        const SizedBox(width: 3),
        Text(
          text,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
        ),
      ],
    );
  }
}
