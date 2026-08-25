import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/me_repository.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';
import 'requests_screen.dart';

class CreateAbsenceScreen extends ConsumerStatefulWidget {
  const CreateAbsenceScreen({super.key});

  @override
  ConsumerState<CreateAbsenceScreen> createState() =>
      _CreateAbsenceScreenState();
}

class _CreateAbsenceScreenState extends ConsumerState<CreateAbsenceScreen> {
  List<dynamic> _types = [];
  String? _typeId;
  DateTime? _date;
  TimeOfDay? _startTime;
  TimeOfDay? _endTime;
  String _mode = 'Soatlik';
  final _note = TextEditingController();
  bool _loading = true;
  bool _busy = false;
  String? _error;

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
    try {
      final types = await ref.read(meRepositoryProvider).absenceTypes();
      setState(() {
        _types = types;
        if (types.isNotEmpty) {
          _typeId = (types.first as Map)['id']?.toString();
        }
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _submit() async {
    if (_typeId == null) {
      setState(() => _error = 'Yo‘qlik turini tanlang');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final day = _date ?? DateTime.now();
      final fmt = DateFormat('yyyy-MM-dd');
      await ref.read(meRepositoryProvider).createAbsence(
            absenceTypeId: _typeId!,
            startDate: fmt.format(day),
            endDate: fmt.format(day),
            note: _note.text.trim(),
          );
      ref.invalidate(myRequestsProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('So‘rov yuborildi')),
      );
      Navigator.of(context).pop();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final typeName = _types.cast<Map?>().firstWhere(
          (t) => t?['id']?.toString() == _typeId,
          orElse: () => null,
        )?['name']
            ?.toString() ??
        'Больничный';

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: const AppBackBar(
        title: 'Ish joyida yo\'qlik so\'rovi',
        centerTitle: true,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                SectionCard(
                  child: Column(
                    children: [
                      _dropdownRow(_mode, () async {
                        final v = await _pickOption(
                          ['Soatlik', 'Kunlik'],
                          _mode,
                        );
                        if (v != null) setState(() => _mode = v);
                      }),
                      const SizedBox(height: 10),
                      _dropdownRow(typeName, () async {
                        if (_types.isEmpty) return;
                        final names = _types
                            .map((t) => (t as Map)['name']?.toString() ?? '')
                            .toList();
                        final picked = await _pickOption(names, typeName);
                        if (picked == null) return;
                        final match = _types.cast<Map>().firstWhere(
                              (t) => t['name']?.toString() == picked,
                            );
                        setState(() => _typeId = match['id']?.toString());
                      }),
                      const Divider(height: 28, color: AppColors.line),
                      _valueRow(
                        value: _date == null
                            ? 'Ko\'rsatilmagan'
                            : DateFormat('dd.MM.yyyy').format(_date!),
                        label: 'sana',
                        action: TextButton(
                          onPressed: () async {
                            final d = await showDatePicker(
                              context: context,
                              initialDate: _date ?? DateTime.now(),
                              firstDate: DateTime.now()
                                  .subtract(const Duration(days: 30)),
                              lastDate: DateTime.now()
                                  .add(const Duration(days: 365)),
                            );
                            if (d != null) setState(() => _date = d);
                          },
                          child: const Text('Belgilash'),
                        ),
                      ),
                      const Divider(height: 28, color: AppColors.line),
                      _valueRow(
                        value: _startTime == null
                            ? 'Ko\'rsatilmagan'
                            : _startTime!.format(context),
                        label: 'Boshlanish vaqti',
                        action: IconButton(
                          onPressed: () async {
                            final t = await showTimePicker(
                              context: context,
                              initialTime: _startTime ?? TimeOfDay.now(),
                            );
                            if (t != null) setState(() => _startTime = t);
                          },
                          icon: const Icon(Icons.touch_app_outlined),
                        ),
                      ),
                      const Divider(height: 28, color: AppColors.line),
                      _valueRow(
                        value: _endTime == null
                            ? 'Ko\'rsatilmagan'
                            : _endTime!.format(context),
                        label: 'Tugash vaqti',
                        action: IconButton(
                          onPressed: () async {
                            final t = await showTimePicker(
                              context: context,
                              initialTime: _endTime ?? TimeOfDay.now(),
                            );
                            if (t != null) setState(() => _endTime = t);
                          },
                          icon: const Icon(Icons.touch_app_outlined),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                SectionCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.chat_bubble_outline,
                              color: AppColors.accent, size: 18),
                          SizedBox(width: 8),
                          Text(
                            'Izoh',
                            style: TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _note,
                        maxLines: 3,
                        decoration: const InputDecoration(
                          hintText: 'Izoh matni',
                        ),
                      ),
                    ],
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: AppColors.danger)),
                ],
                const SizedBox(height: 24),
                PrimaryButton(
                  label: 'Yuborish',
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

  Future<String?> _pickOption(List<String> options, String current) {
    return showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.cardAlt,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: options
              .map(
                (o) => ListTile(
                  title: Text(o),
                  trailing: o == current ? const Icon(Icons.check) : null,
                  onTap: () => Navigator.pop(ctx, o),
                ),
              )
              .toList(),
        ),
      ),
    );
  }
}
