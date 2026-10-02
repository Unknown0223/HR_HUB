import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/me_repository.dart';
import '../../core/errors/api_exception.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';
import '../home/home_screen.dart';
import 'requests_screen.dart';

enum _Mode { daily, hourly }

class CreateAbsenceScreen extends ConsumerStatefulWidget {
  const CreateAbsenceScreen({super.key});

  @override
  ConsumerState<CreateAbsenceScreen> createState() =>
      _CreateAbsenceScreenState();
}

class _CreateAbsenceScreenState extends ConsumerState<CreateAbsenceScreen> {
  List<Map> _types = [];
  String? _typeId;
  _Mode _mode = _Mode.daily;
  DateTimeRange? _range;
  DateTime? _date;
  TimeOfDay? _startTime;
  TimeOfDay? _endTime;
  final _note = TextEditingController();
  bool _loading = true;
  bool _busy = false;
  String? _error;

  static final _day = DateFormat('dd.MM.yyyy');
  static final _iso = DateFormat('yyyy-MM-dd');

  @override
  void initState() {
    super.initState();
    _loadTypes();
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _loadTypes() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final types = (await ref.read(meRepositoryProvider).absenceTypes())
          .cast<Map>();
      if (!mounted) return;
      setState(() {
        _types = types;
        _typeId = types.isEmpty ? null : types.first['id']?.toString();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _humanize(e);
        _loading = false;
      });
    }
  }

  String _hhmm(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  String _humanize(Object e) {
    final msg = e is ApiException ? e.message : '$e';
    if (msg.contains('overlaps existing')) {
      return context.t(
        'Bu kunlarga allaqachon yo‘qlik so‘rovi bor (kutilayotgan yoki tasdiqlangan)',
      );
    }
    if (msg.contains('endTime must be after')) {
      return context.t('Tugash vaqti boshlanish vaqtidan keyin bo‘lishi kerak');
    }
    return msg;
  }

  String? _validate() {
    if (_typeId == null) return context.t('Yo‘qlik turini tanlang');
    if (_mode == _Mode.daily) {
      if (_range == null) return context.t('Sanalarni belgilang');
      return null;
    }
    if (_date == null) return context.t('Sanani belgilang');
    if (_startTime == null || _endTime == null) {
      return context.t('Boshlanish va tugash vaqtini belgilang');
    }
    if (_hhmm(_endTime!).compareTo(_hhmm(_startTime!)) <= 0) {
      return context.t('Tugash vaqti boshlanish vaqtidan keyin bo‘lishi kerak');
    }
    return null;
  }

  Future<void> _submit() async {
    final invalid = _validate();
    if (invalid != null) {
      setState(() => _error = invalid);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final daily = _mode == _Mode.daily;
      await ref
          .read(meRepositoryProvider)
          .createAbsence(
            absenceTypeId: _typeId!,
            startDate: _iso.format(daily ? _range!.start : _date!),
            endDate: _iso.format(daily ? _range!.end : _date!),
            startTime: daily ? null : _hhmm(_startTime!),
            endTime: daily ? null : _hhmm(_endTime!),
            note: _note.text.trim(),
          );
      ref.invalidate(myRequestsProvider);
      ref.invalidate(homeRequestsProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.t('So‘rov rahbarga yuborildi'))),
      );
      Navigator.of(context).pop();
    } catch (e) {
      if (mounted) setState(() => _error = _humanize(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickRange() async {
    final now = DateTime.now();
    final r = await showDateRangePicker(
      context: context,
      initialDateRange: _range,
      firstDate: now.subtract(const Duration(days: 30)),
      lastDate: now.add(const Duration(days: 365)),
      helpText: context.t('Yo‘qlik sanalari'),
      saveText: context.t('Tanlash'),
    );
    if (r != null) setState(() => _range = r);
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: _date ?? now,
      firstDate: now.subtract(const Duration(days: 30)),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (d != null) setState(() => _date = d);
  }

  Future<TimeOfDay?> _pickTime(TimeOfDay? initial) => showTimePicker(
    context: context,
    initialTime: initial ?? const TimeOfDay(hour: 9, minute: 0),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(alwaysUse24HourFormat: true),
      child: child!,
    ),
  );

  @override
  Widget build(BuildContext context) {
    final type = _types
        .where((t) => t['id']?.toString() == _typeId)
        .cast<Map?>()
        .firstWhere((_) => true, orElse: () => null);
    final days = _range == null ? 0 : _range!.duration.inDays + 1;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBackBar(
        title: context.t('Ish joyida yo\'qlik so\'rovi'),
        centerTitle: true,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _types.isEmpty
          ? ListView(
              padding: const EdgeInsets.all(24),
              children: [
                const SizedBox(height: 80),
                EmptyState(
                  message:
                      _error ??
                      context.t(
                        'Yo‘qlik turlari sozlanmagan. HR bo‘limiga murojaat qiling.',
                      ),
                ),
                TextButton(
                  onPressed: _loadTypes,
                  child: Text(context.t('Qayta urinish')),
                ),
              ],
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                SectionCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SegmentedButton<_Mode>(
                        segments: [
                          ButtonSegment(
                            value: _Mode.daily,
                            label: Text(context.t('Kunlik')),
                            icon: const Icon(Icons.date_range),
                          ),
                          ButtonSegment(
                            value: _Mode.hourly,
                            label: Text(context.t('Soatlik')),
                            icon: const Icon(Icons.schedule),
                          ),
                        ],
                        selected: {_mode},
                        showSelectedIcon: false,
                        onSelectionChanged: (s) => setState(() {
                          _mode = s.first;
                          _error = null;
                        }),
                      ),
                      const SizedBox(height: 12),
                      _dropdownRow(
                        type?['name']?.toString() ?? context.t('Yo‘qlik turi'),
                        () async {
                          final picked = await _pickType();
                          if (picked != null) {
                            setState(() => _typeId = picked);
                          }
                        },
                      ),
                      const Divider(height: 28, color: AppColors.line),
                      if (_mode == _Mode.daily)
                        _valueRow(
                          value: _range == null
                              ? context.t('Ko\'rsatilmagan')
                              : days == 1
                              ? _day.format(_range!.start)
                              : '${_day.format(_range!.start)} – ${_day.format(_range!.end)}',
                          label: _range == null
                              ? context.t('sanalar')
                              : context.t('{0} kun', [days]),
                          action: TextButton(
                            onPressed: _pickRange,
                            child: Text(context.t('Belgilash')),
                          ),
                        )
                      else ...[
                        _valueRow(
                          value: _date == null
                              ? context.t('Ko\'rsatilmagan')
                              : _day.format(_date!),
                          label: context.t('sana'),
                          action: TextButton(
                            onPressed: _pickDate,
                            child: Text(context.t('Belgilash')),
                          ),
                        ),
                        const Divider(height: 28, color: AppColors.line),
                        _valueRow(
                          value: _startTime == null
                              ? context.t('Ko\'rsatilmagan')
                              : _hhmm(_startTime!),
                          label: context.t('Boshlanish vaqti'),
                          action: IconButton(
                            onPressed: () async {
                              final t = await _pickTime(_startTime);
                              if (t != null) {
                                setState(() => _startTime = t);
                              }
                            },
                            icon: const Icon(Icons.schedule),
                          ),
                        ),
                        const Divider(height: 28, color: AppColors.line),
                        _valueRow(
                          value: _endTime == null
                              ? context.t('Ko\'rsatilmagan')
                              : _hhmm(_endTime!),
                          label: context.t('Tugash vaqti'),
                          action: IconButton(
                            onPressed: () async {
                              final t = await _pickTime(_endTime ?? _startTime);
                              if (t != null) setState(() => _endTime = t);
                            },
                            icon: const Icon(Icons.schedule),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                SectionCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(
                            Icons.chat_bubble_outline,
                            color: AppColors.accent,
                            size: 18,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            context.t('Izoh'),
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _note,
                        maxLines: 3,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: InputDecoration(
                          hintText: context.t('Sabab yoki qo‘shimcha ma’lumot'),
                        ),
                      ),
                    ],
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _error!,
                    style: const TextStyle(color: AppColors.danger),
                  ),
                ],
                const SizedBox(height: 24),
                PrimaryButton(
                  label: context.t('Yuborish'),
                  busy: _busy,
                  onPressed: _submit,
                ),
              ],
            ),
    );
  }

  Widget _dropdownRow(String text, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.line),
        ),
        child: Row(
          children: [
            Expanded(child: Text(text)),
            const Icon(Icons.arrow_drop_down, color: AppColors.inkMuted),
          ],
        ),
      ),
    );
  }

  Widget _valueRow({
    required String value,
    required String label,
    required Widget action,
  }) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
              Text(label, style: const TextStyle(color: AppColors.inkMuted)),
            ],
          ),
        ),
        action,
      ],
    );
  }

  Future<String?> _pickType() {
    return showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.cardAlt,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(ctx).size.height * 0.7,
          ),
          child: ListView(
            shrinkWrap: true,
            children: [
              for (final t in _types)
                ListTile(
                  title: Text(t['name']?.toString() ?? ''),
                  trailing: t['id']?.toString() == _typeId
                      ? const Icon(Icons.check, color: AppColors.accent)
                      : null,
                  onTap: () => Navigator.pop(ctx, t['id']?.toString()),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
