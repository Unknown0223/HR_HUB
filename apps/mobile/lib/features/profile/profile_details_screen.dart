import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/me_repository.dart';
import '../../core/auth/auth_state.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/my_avatar.dart';
import '../../shared/widgets.dart';

final myDetailsProvider = FutureProvider.autoDispose((ref) {
  return ref.read(meRepositoryProvider).details();
});

const _notSet = 'Ko‘rsatilmagan';

class ProfileDetailsScreen extends ConsumerWidget {
  const ProfileDetailsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final async = ref.watch(myDetailsProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.chevron_left, size: 30),
          onPressed: () => context.pop(),
        ),
        title: Text(context.t('Profil')),
        centerTitle: true,
        actions: [
          if (user?.hasTeam == true)
            IconButton(
              tooltip: context.t('Jamoa'),
              onPressed: () => context.push('/team'),
              icon: const Icon(Icons.groups_outlined),
            ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.accent,
        onRefresh: () async {
          ref.invalidate(myDetailsProvider);
          await ref.read(myDetailsProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Center(child: MyAvatar(radius: 48)),
            const SizedBox(height: 12),
            Text(
              (user?.displayName ?? '—').toUpperCase(),
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
            ),
            const SizedBox(height: 16),
            async.when(
              loading: () => const Padding(
                padding: EdgeInsets.only(top: 40),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => EmptyState(message: '$e'),
              data: (d) => _Details(data: d),
            ),
          ],
        ),
      ),
    );
  }
}

class _Details extends StatelessWidget {
  const _Details({required this.data});

  final Map<String, dynamic> data;

  String? _s(String key) {
    final v = data[key]?.toString().trim();
    return v == null || v.isEmpty ? null : v;
  }

  static String? _date(String? iso) {
    final d = iso == null ? null : DateTime.tryParse(iso);
    return d == null ? null : DateFormat('dd.MM.yyyy').format(d);
  }

  static String? _gender(BuildContext context, String? g) =>
      switch (g?.toLowerCase()) {
        'male' || 'm' || 'erkak' || 'мужской' => context.t('Erkak'),
        'female' || 'f' || 'ayol' || 'женский' => context.t('Ayol'),
        null || '' => null,
        _ => g,
      };

  static String _employment(BuildContext context, String? t) => switch (t) {
    'staff' => context.t('Shtatdagi xodim'),
    'gph' => context.t('Fuqarolik-huquqiy shartnoma'),
    _ => t ?? context.t(_notSet),
  };

  @override
  Widget build(BuildContext context) {
    final manager = data['manager'] as Map?;
    final schedule = data['schedule'] as Map?;
    final docs = (data['documents'] as List?) ?? [];
    final phone = _s('phone');
    final email = _s('email');
    final telegram = _s('telegram');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionCard(
          child: Column(
            children: [
              _Field(
                value: _date(_s('birthDate')),
                label: context.t('Tug‘ilgan kun'),
              ),
              _Field(
                value: _gender(context, _s('gender')),
                label: context.t('Jins'),
              ),
              if (_s('nationality') != null)
                _Field(value: _s('nationality'), label: context.t('Millati')),
              _Field(
                value: manager?['fullName']?.toString(),
                label: context.t('Rahbar'),
                actions: [
                  if ((manager?['phone']?.toString() ?? '').isNotEmpty)
                    _ActionButton.call(manager!['phone'].toString()),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Title(
                icon: Icons.contacts_outlined,
                text: context.t('Kontaktlar'),
              ),
              _Field(
                value: phone,
                label: context.t('Telefon'),
                actions: [
                  if (phone != null) ...[
                    _CopyButton(phone),
                    _ActionButton.call(phone),
                  ],
                ],
              ),
              _Field(
                value: email,
                label: 'E-mail',
                actions: [
                  if (email != null) ...[
                    _CopyButton(email),
                    _ActionButton.mail(email),
                  ],
                ],
              ),
              if (telegram != null)
                _Field(
                  value: '@$telegram',
                  label: 'Telegram',
                  actions: [_ActionButton.telegram(telegram)],
                ),
              _Field(value: _s('region'), label: context.t('Mintaqa')),
              _Field(
                value: _s('addressResidence'),
                label: context.t('Yashash manzili'),
              ),
              _Field(
                value: _s('addressRegistration'),
                label: context.t('Doimiy ro‘yxatdan o‘tgan manzili'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Title(
                icon: Icons.work_outline_rounded,
                text: context.t('Ish haqida ma’lumotlar'),
              ),
              _Field(value: _s('division'), label: context.t('Bo‘lim')),
              _Field(value: _s('position'), label: context.t('Lavozim')),
              _Field(
                value: _employment(context, _s('employmentType')),
                label: context.t('Bandlik turi'),
              ),
              _Field(
                value: _date(_s('hiredAt')),
                label: context.t('Qabul qilingan sana'),
              ),
              _Field(
                value: schedule == null
                    ? null
                    : '${schedule['name'] ?? ''} · ${schedule['startTime'] ?? ''}–${schedule['endTime'] ?? ''}'
                          .trim(),
                label: context.t('Ish grafigi'),
              ),
              _Field(
                value: _s('tabNumber'),
                label: context.t('Tabel raqami'),
                actions: [
                  if (_s('tabNumber') != null) _CopyButton(_s('tabNumber')!),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Title(
                icon: Icons.account_balance_outlined,
                text: context.t('Identifikatorlar'),
              ),
              _SecretField(
                value: _s('pinfl'),
                label: context.t('JShShIR (PINFL)'),
              ),
              _SecretField(value: _s('inn'), label: context.t('STIR (INN)')),
              _SecretField(
                value: _s('inps'),
                label: context.t('ShJBPH (INPS)'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Title(
                icon: Icons.description_outlined,
                text: context.t('Hujjatlar'),
              ),
              if (docs.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(
                    context.t('Hujjatlar kiritilmagan'),
                    style: const TextStyle(color: AppColors.inkMuted),
                  ),
                )
              else
                for (final d in docs.cast<Map>())
                  _SecretField(
                    value: d['number']?.toString(),
                    label: [
                      d['typeName']?.toString() ?? context.t('Hujjat'),
                      if (_date(d['issuedAt']?.toString()) != null)
                        context.t('berilgan {0}', [
                          _date(d['issuedAt']?.toString()),
                        ]),
                      if (_date(d['expiresAt']?.toString()) != null)
                        context.t('amal qiladi {0} gacha', [
                          _date(d['expiresAt']?.toString()),
                        ]),
                    ].join(' · '),
                  ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Text(
          context.t(
            'Ma’lumotlarda xato bo‘lsa, HR bo‘limiga murojaat qiling (Profil → Yordam).',
          ),
          textAlign: TextAlign.center,
          style: const TextStyle(color: AppColors.inkFaint, fontSize: 12),
        ),
      ],
    );
  }
}

class _Title extends StatelessWidget {
  const _Title({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Icon(icon, color: AppColors.accent, size: 18),
          const SizedBox(width: 8),
          Text(text, style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.value,
    required this.label,
    this.actions = const [],
  });

  final String? value;
  final String label;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final empty = value == null || value!.trim().isEmpty;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  empty ? context.t(_notSet) : value!,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                    color: empty ? AppColors.inkFaint : AppColors.ink,
                  ),
                ),
                Text(
                  label,
                  style: const TextStyle(
                    color: AppColors.inkMuted,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          ...actions,
        ],
      ),
    );
  }
}

/// Sensitive ids stay masked until tapped; copying works either way.
class _SecretField extends StatefulWidget {
  const _SecretField({required this.value, required this.label});

  final String? value;
  final String label;

  @override
  State<_SecretField> createState() => _SecretFieldState();
}

class _SecretFieldState extends State<_SecretField> {
  bool _shown = false;

  @override
  Widget build(BuildContext context) {
    final v = widget.value;
    if (v == null || v.isEmpty) return _Field(value: null, label: widget.label);
    final masked = v.length <= 4
        ? '••••'
        : '${'•' * (v.length - 4)}${v.substring(v.length - 4)}';
    return _Field(
      value: _shown ? v : masked,
      label: widget.label,
      actions: [
        IconButton(
          tooltip: _shown ? context.t('Yashirish') : context.t('Ko‘rsatish'),
          onPressed: () => setState(() => _shown = !_shown),
          icon: Icon(
            _shown ? Icons.visibility_off_outlined : Icons.visibility_outlined,
            size: 20,
            color: AppColors.inkMuted,
          ),
        ),
        _CopyButton(v),
      ],
    );
  }
}

class _CopyButton extends StatelessWidget {
  const _CopyButton(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: context.t('Nusxa olish'),
      onPressed: () async {
        await Clipboard.setData(ClipboardData(text: text));
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(context.t('Nusxa olindi')),
              duration: const Duration(seconds: 1),
            ),
          );
        }
      },
      icon: const Icon(Icons.copy, size: 18, color: AppColors.inkMuted),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.uri,
    required this.icon,
    required this.tooltip,
  });

  _ActionButton.call(String phone)
    : this(
        uri: Uri(scheme: 'tel', path: phone.replaceAll(RegExp(r'[^\d+]'), '')),
        icon: Icons.phone,
        tooltip: 'Qo‘ng‘iroq qilish',
      );

  _ActionButton.mail(String email)
    : this(
        uri: Uri(scheme: 'mailto', path: email),
        icon: Icons.mail_outline,
        tooltip: 'Xat yozish',
      );

  _ActionButton.telegram(String username)
    : this(
        uri: Uri.parse('https://t.me/$username'),
        icon: Icons.send_rounded,
        tooltip: 'Telegram',
      );

  final Uri uri;
  final IconData icon;
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: Material(
        color: AppColors.callGreen,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: () async {
            final ok = await launchUrl(
              uri,
              mode: LaunchMode.externalApplication,
            );
            if (!ok && context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(
                    context.t('Bu amal uchun telefonda ilova topilmadi'),
                  ),
                ),
              );
            }
          },
          child: Tooltip(
            message: context.t(tooltip),
            child: SizedBox(
              width: 36,
              height: 36,
              child: Icon(icon, color: Colors.white, size: 18),
            ),
          ),
        ),
      ),
    );
  }
}
