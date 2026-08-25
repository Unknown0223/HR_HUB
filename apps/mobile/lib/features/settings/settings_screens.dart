import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/biometrics/biometric_service.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool touchId = false;
  bool _bioAvailable = false;
  String themeLabel = 'Tizimdagi kabi';
  String lang = 'O\'zbekcha';

  @override
  void initState() {
    super.initState();
    _loadBio();
  }

  Future<void> _loadBio() async {
    final bio = ref.read(biometricServiceProvider);
    final enabled = await bio.isEnabled;
    final available = await bio.deviceSupportsBiometrics();
    if (!mounted) return;
    setState(() {
      touchId = enabled;
      _bioAvailable = available;
    });
  }

  Future<void> _toggleBio(bool v) async {
    final bio = ref.read(biometricServiceProvider);
    if (v) {
      final ok = await bio.authenticate(
        reason: 'Barmoq izini yoqish uchun tasdiqlang',
        allowSkipIfUnavailable: true,
      );
      if (!ok) return;
    }
    await bio.setEnabled(v);
    setState(() => touchId = v);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: const AppBackBar(title: 'Sozlamalar'),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _group(
            children: [
              MenuTile(
                icon: Icons.brightness_6_outlined,
                label: themeLabel,
                subtitle: 'mavzu',
                onTap: () async {
                  final result = await context.push<String>('/settings/theme');
                  if (result != null) setState(() => themeLabel = result);
                },
              ),
              const Divider(height: 1, color: AppColors.line),
              MenuTile(
                icon: Icons.language,
                label: lang,
                subtitle: 'Ilova tili',
                showChevron: false,
                onTap: () => _langSheet(),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _group(
            children: [
              MenuTile(
                icon: Icons.lock_outline,
                label: 'Parolni o\'zgartirish',
                onTap: () => context.push('/security/password'),
              ),
              const Divider(height: 1, color: AppColors.line),
              MenuTile(
                icon: Icons.pin_outlined,
                label: 'PIN-kodni o\'zgartirish',
                onTap: () => context.push('/security/pin'),
              ),
              const Divider(height: 1, color: AppColors.line),
              MenuTile(
                icon: Icons.pin_outlined,
                label: 'PIN-kodni olib tashlash',
                onTap: () {},
              ),
              const Divider(height: 1, color: AppColors.line),
              MenuTile(
                icon: Icons.fingerprint,
                label: 'Barmoq izi / Touch-ID',
                subtitle: _bioAvailable
                    ? 'Kirish va belgi tasdiqi'
                    : 'Qurilmada biometrik yo\'q (emulator OK)',
                showChevron: false,
                trailing: Switch(
                  value: touchId,
                  activeTrackColor: AppColors.logout,
                  onChanged: _toggleBio,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _group(
            children: [
              MenuTile(
                icon: Icons.notifications_outlined,
                label: 'Ish kunining boshlanishi va oxiri haqida bil...',
                onTap: () => context.push('/settings/notify-records'),
              ),
              const Divider(height: 1, color: AppColors.line),
              MenuTile(
                icon: Icons.notifications_active_outlined,
                label: 'Boshqalar',
                onTap: () => context.push('/settings/notifications'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _group(
            children: const [
              Padding(
                padding: EdgeInsets.all(16),
                child: Text(
                  'HR HUB mobile · Face ID + fingerprint',
                  style: TextStyle(color: AppColors.inkMuted, fontSize: 12),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _group({required List<Widget> children}) {
    return SectionCard(
      padding: EdgeInsets.zero,
      child: Column(children: children),
    );
  }

  void _langSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.cardAlt,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        final langs = ['Русский', 'English', 'O\'zbekcha'];
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Align(
                  alignment: Alignment.centerLeft,
                  child: Text('Til', style: TextStyle(color: AppColors.inkMuted)),
                ),
                ...langs.map(
                  (l) => ListTile(
                    title: Text(l),
                    trailing: lang == l ? const Icon(Icons.check) : null,
                    onTap: () {
                      setState(() => lang = l);
                      Navigator.pop(ctx);
                    },
                  ),
                ),
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: Colors.black,
                    ),
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('Yopish'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class ThemeSettingsScreen extends StatelessWidget {
  const ThemeSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    const options = [
      'Tizimdagi kabi',
      'Yorug\'',
      'Qorong\'i',
    ];
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: const AppBackBar(title: 'Mavzu'),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: SectionCard(
          padding: EdgeInsets.zero,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < options.length; i++) ...[
                if (i > 0) const Divider(height: 1, color: AppColors.line),
                ListTile(
                  title: Text(options[i]),
                  trailing: Radio<String>(
                    value: options[i],
                    groupValue: 'Tizimdagi kabi',
                    activeColor: AppColors.accent,
                    onChanged: (_) => Navigator.pop(context, options[i]),
                  ),
                  onTap: () => Navigator.pop(context, options[i]),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class NotificationSettingsScreen extends StatefulWidget {
  const NotificationSettingsScreen({super.key});

  @override
  State<NotificationSettingsScreen> createState() =>
      _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState
    extends State<NotificationSettingsScreen> {
  final Map<String, bool> toggles = {
    for (final k in [
      'a1',
      'a2',
      'a3',
      'b1',
      'b2',
      'b3',
      'c1',
      'c2',
      'c3',
      'd1',
      'e1',
      'f1',
    ])
      k: true,
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: const AppBackBar(title: 'Bildirishnomalar'),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _section('Ish joyida yo\'qlik so\'rovlari', [
            _t('a1', 'Ish joyida yo\'qlik so\'rovlari'),
            _t('a2', 'Holat o\'zgarishi'),
            _t('a3', 'Rahbar tasdig\'i'),
          ]),
          _section('Ish jadvalini o\'zgartirish so\'rovlari', [
            _t('b1', 'Ish jadvalini o\'zgartirish so\'rovlari'),
            _t('b2', 'Holat o\'zgarishi'),
            _t('b3', 'Rahbar tasdig\'i'),
          ]),
          _section('Davomat', [
            _t('c1', 'Xodimning kech qolishi'),
            _t('c2', 'Xodimning erta ishdan ketishi'),
            _t('c3', 'Ishdan keyingi kunning qisqacha mazmuni'),
          ]),
          _section('Taqvim', [
            _t('d1', 'Ishchi taqvimdagi o\'zgarishlar'),
          ]),
          _section('KPI', [
            _t('e1', 'Rejani o\'zgarishi'),
          ]),
          _section('Vazifalar', [
            _t('f1', 'Vazifalarni o\'zgarishi'),
          ]),
        ],
      ),
    );
  }

  Widget _section(String title, List<Widget> children) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: SectionCard(
        padding: EdgeInsets.zero,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Text(
                title,
                style: const TextStyle(
                  color: AppColors.inkMuted,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _t(String key, String label) {
    return SwitchListTile(
      title: Text(label, style: const TextStyle(fontSize: 14)),
      value: toggles[key] ?? true,
      activeTrackColor: AppColors.toggleOn,
      onChanged: (v) => setState(() => toggles[key] = v),
    );
  }
}

class NotifyRecordsScreen extends StatefulWidget {
  const NotifyRecordsScreen({super.key});

  @override
  State<NotifyRecordsScreen> createState() => _NotifyRecordsScreenState();
}

class _NotifyRecordsScreenState extends State<NotifyRecordsScreen> {
  bool startOn = true;
  bool endOn = true;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBackBar(
        title: 'Qaydlar bo\'yicha',
        actions: [
          IconButton(onPressed: () {}, icon: const Icon(Icons.save_outlined)),
          IconButton(onPressed: () {}, icon: const Icon(Icons.history)),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Ish kunining boshlanish vaqti, ish kunining tugash vaqti haqida bildirishnomalar',
                  style: TextStyle(color: AppColors.inkMuted, fontSize: 13),
                ),
                const SizedBox(height: 16),
                _block(
                  title: 'Ish kunining boshlanish vaqti',
                  value: startOn,
                  onChanged: (v) => setState(() => startOn = v),
                  left: 'Avval',
                  right: '10 min',
                ),
                const SizedBox(height: 16),
                _block(
                  title: 'Ish kunining tugash vaqti',
                  value: endOn,
                  onChanged: (v) => setState(() => endOn = v),
                  left: 'Keyin',
                  right: '10 min',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _block({
    required String title,
    required bool value,
    required ValueChanged<bool> onChanged,
    required String left,
    required String right,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
            Switch(
              value: value,
              activeTrackColor: AppColors.toggleOn,
              onChanged: onChanged,
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(child: _dropdown(left)),
            const SizedBox(width: 8),
            Expanded(child: _dropdown(right)),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            const Text('Interval', style: TextStyle(color: AppColors.inkMuted)),
            const SizedBox(width: 12),
            Expanded(child: _dropdown('Not selected')),
          ],
        ),
      ],
    );
  }

  Widget _dropdown(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
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
    );
  }
}
