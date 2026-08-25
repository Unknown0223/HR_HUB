import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';

class SecurityScreen extends StatelessWidget {
  const SecurityScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: const AppBackBar(title: 'Xavfsizlik'),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: SectionCard(
          padding: EdgeInsets.zero,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                title: const Text(
                  'Parolni o\'zgartirish',
                  style: TextStyle(color: AppColors.inkMuted),
                ),
                onTap: () => context.push('/security/password'),
              ),
              const Divider(height: 1, color: AppColors.line),
              ListTile(
                title: const Text(
                  'PIN-kodni o\'rnatish',
                  style: TextStyle(color: AppColors.inkMuted),
                ),
                onTap: () => context.push('/security/pin'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _again = TextEditingController();
  bool _o1 = true, _o2 = true, _o3 = true;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _again.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: const AppBackBar(title: 'Parolni o\'zgartirish'),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            SoftField(
              controller: _current,
              hint: 'Joriy parol',
              prefixIcon: Icons.lock_outline,
              obscure: _o1,
              suffixIcon: IconButton(
                onPressed: () => setState(() => _o1 = !_o1),
                icon: Icon(_o1 ? Icons.visibility_outlined : Icons.visibility_off_outlined),
              ),
            ),
            const SizedBox(height: 12),
            SoftField(
              controller: _next,
              hint: 'Yangi parol',
              prefixIcon: Icons.lock_outline,
              obscure: _o2,
              suffixIcon: IconButton(
                onPressed: () => setState(() => _o2 = !_o2),
                icon: Icon(_o2 ? Icons.visibility_outlined : Icons.visibility_off_outlined),
              ),
            ),
            const SizedBox(height: 12),
            SoftField(
              controller: _again,
              hint: 'Parolni qayta kiriting',
              prefixIcon: Icons.lock_outline,
              obscure: _o3,
              suffixIcon: IconButton(
                onPressed: () => setState(() => _o3 = !_o3),
                icon: Icon(_o3 ? Icons.visibility_outlined : Icons.visibility_off_outlined),
              ),
            ),
            const Spacer(),
            PrimaryButton(
              label: 'O\'zgartirish',
              color: AppColors.bgSoft,
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Parol yangilandi (demo)')),
                );
                context.pop();
              },
            ),
          ],
        ),
      ),
    );
  }
}

class PinScreen extends StatefulWidget {
  const PinScreen({
    super.key,
    this.title = 'PIN kodingizni kiriting',
    this.subtitle,
    this.showAccounts = true,
  });

  final String title;
  final String? subtitle;
  final bool showAccounts;

  @override
  State<PinScreen> createState() => _PinScreenState();
}

class _PinScreenState extends State<PinScreen> {
  String _pin = '';
  final _status = <String>[];

  void _tap(String v) {
    if (v == 'C') {
      setState(() => _pin = '');
      return;
    }
    if (v == '<') {
      if (_pin.isNotEmpty) {
        setState(() => _pin = _pin.substring(0, _pin.length - 1));
      }
      return;
    }
    if (_pin.length >= 4) return;
    setState(() => _pin += v);
  }

  void _submit() {
    setState(() {
      _status
        ..clear()
        ..addAll([
          'Boshlanyapti',
          'Akkaunt o\'qilyapti',
          'Parol tekshirilyapti...',
        ]);
    });
    Future.delayed(const Duration(milliseconds: 800), () {
      if (!mounted) return;
      context.pop(true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final keys = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['C', '0', '<'],
    ];

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.chevron_left, size: 30),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            const Spacer(),
            Text(
              widget.title,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
            if (widget.subtitle != null) ...[
              const SizedBox(height: 6),
              Text(
                widget.subtitle!,
                style: const TextStyle(color: AppColors.inkMuted),
              ),
            ],
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(4, (i) {
                final filled = i < _pin.length;
                return Container(
                  width: 12,
                  height: 12,
                  margin: const EdgeInsets.symmetric(horizontal: 8),
                  decoration: BoxDecoration(
                    color: filled ? AppColors.ink : AppColors.inkFaint,
                    shape: BoxShape.circle,
                  ),
                );
              }),
            ),
            const Spacer(),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                children: [
                  for (final row in keys)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Row(
                        children: row.map((k) {
                          return Expanded(
                            child: Padding(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 4),
                              child: SizedBox(
                                height: 52,
                                child: FilledButton(
                                  style: FilledButton.styleFrom(
                                    backgroundColor: AppColors.bgSoft,
                                    foregroundColor: AppColors.ink,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                  ),
                                  onPressed: () => _tap(k),
                                  child: k == '<'
                                      ? const Icon(Icons.backspace_outlined)
                                      : Text(
                                          k,
                                          style: const TextStyle(
                                            fontSize: 20,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                ),
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.bgSoft,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      onPressed: _pin.length == 4 ? _submit : null,
                      child: const Icon(Icons.check, color: AppColors.ink),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            ..._status.map(
              (s) => Text(
                s,
                style: const TextStyle(color: AppColors.inkMuted, fontSize: 12),
              ),
            ),
            const SizedBox(height: 8),
            if (widget.showAccounts)
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: () => context.push('/login'),
                  icon: const Icon(Icons.groups_outlined),
                  label: const Text('Akkauntlar'),
                ),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: const AppBackBar(title: 'Yordam'),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            SectionCard(
              padding: EdgeInsets.zero,
              child: ListTile(
                leading: const Icon(Icons.chat_bubble_outline),
                title: const Text('Qo\'llab-quvvatlash bilan suhbat'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {},
              ),
            ),
            const SizedBox(height: 10),
            SectionCard(
              padding: EdgeInsets.zero,
              child: ListTile(
                leading: const Icon(Icons.telegram, color: Color(0xFF2AABEE)),
                title: const Text('Telegram orqali chat'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {},
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ModulesScreen extends StatelessWidget {
  const ModulesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final items = [
      (Icons.face_outlined, 'Face ID', '/face-punch'),
      (Icons.directions_run, 'GPS belgi', '/gps-punch'),
      (Icons.qr_code_scanner, 'QR belgi', '/qr-punch'),
      (Icons.table_chart_outlined, 'Tabel', '/tabel'),
      (Icons.assignment_outlined, 'So\'rovlar', '/requests'),
      (Icons.groups_outlined, 'Jamoa', '/team-today'),
      (Icons.payments_outlined, 'To\'lov', '/payroll'),
      (Icons.note_alt_outlined, 'Qaydlar', '/marks'),
    ];
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: const AppBackBar(title: 'Modullar'),
      body: GridView.builder(
        padding: const EdgeInsets.all(16),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.35,
        ),
        itemCount: items.length,
        itemBuilder: (context, i) {
          final e = items[i];
          return Material(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(16),
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () => context.push(e.$3),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(e.$1, size: 28),
                  const SizedBox(height: 10),
                  Text(e.$2, style: const TextStyle(fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class GpsTrackScreen extends StatefulWidget {
  const GpsTrackScreen({super.key});

  @override
  State<GpsTrackScreen> createState() => _GpsTrackScreenState();
}

class _GpsTrackScreenState extends State<GpsTrackScreen> {
  DateTime _date = DateTime.now();

  Future<void> _pickDate() async {
    await showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: const Color(0xFF2C344E),
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'SANANI TANLANG',
                style: TextStyle(fontSize: 12, color: AppColors.inkMuted),
              ),
              Text(
                'Yak, ${_date.day}-iyl',
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 22),
              ),
            ],
          ),
          content: SizedBox(
            width: 320,
            height: 280,
            child: CalendarDatePicker(
              initialDate: _date,
              firstDate: DateTime(2020),
              lastDate: DateTime(2035),
              onDateChanged: (d) => _date = d,
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('BEKOR QILISH'),
            ),
            TextButton(
              onPressed: () {
                setState(() {});
                Navigator.pop(ctx);
              },
              child: const Text('OK'),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBackBar(
        title: 'GPS kuzatuv',
        centerTitle: true,
        actions: [
          IconButton(
            onPressed: _pickDate,
            icon: const Icon(Icons.calendar_month_outlined),
          ),
        ],
      ),
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFAED6F1), Color(0xFFF4F4F4)],
          ),
        ),
        child: CustomPaint(painter: _SimpleMapPainter()),
      ),
    );
  }
}

class _SimpleMapPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final land = Paint()..color = const Color(0xFFE8E4DC);
    final water = Paint()..color = const Color(0xFFAED6F1);
    canvas.drawRect(Offset.zero & size, water);
    // stylized continents blobs
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(size.width * 0.12, size.height * 0.18, size.width * 0.35, size.height * 0.45),
        const Radius.circular(40),
      ),
      land,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(size.width * 0.48, size.height * 0.22, size.width * 0.4, size.height * 0.4),
        const Radius.circular(50),
      ),
      land,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(size.width * 0.55, size.height * 0.62, size.width * 0.25, size.height * 0.18),
        const Radius.circular(30),
      ),
      land,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
