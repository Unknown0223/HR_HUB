import 'package:flutter/material.dart';
import '../core/i18n/app_lang.dart';
import '../core/theme/app_theme.dart';

/// API date-only fields arrive as `YYYY-MM-DDT00:00:00.000Z`; keep the calendar
/// day as-is instead of shifting it into local time.
String formatApiDate(dynamic value) {
  final raw = value?.toString() ?? '';
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(raw);
  if (m == null) return raw;
  return '${m[3]}.${m[2]}.${m[1]}';
}

String formatApiTime(dynamic value) {
  final dt = DateTime.tryParse(value?.toString() ?? '')?.toLocal();
  if (dt == null) return '';
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(dt.hour)}:${two(dt.minute)}';
}

String punchDirectionLabel(dynamic direction) {
  switch (direction?.toString().toUpperCase()) {
    case 'IN':
      return trText('Kirish');
    case 'OUT':
      return trText('Chiqish');
    default:
      return trText('Belgi');
  }
}

dynamic markField(Map m, String key) {
  final payload = m['rawPayload'];
  return m[key] ?? (payload is Map ? payload[key] : null);
}

String markKindLabel(Map m) {
  switch (markField(m, 'markType')?.toString()) {
    case 'in':
      return trText('Kirish');
    case 'out':
      return trText('Chiqish');
    case 'estimated_out':
      return trText('Taxminiy chiqish');
    case 'break_out':
      return trText('Tanaffusga chiqish');
    case 'break_in':
      return trText('Tanaffusdan qaytish');
  }
  return punchDirectionLabel(m['direction']);
}

bool markIsEntry(Map m) {
  final type = markField(m, 'markType')?.toString();
  if (type != null && type.isNotEmpty) {
    return type == 'in' || type == 'break_in';
  }
  return m['direction']?.toString().toUpperCase() == 'IN';
}

bool markOutsideGeofence(Map m) => markField(m, 'outsideGeofence') == true;

String punchSourceLabel(dynamic source) {
  final s = source?.toString().toLowerCase() ?? '';
  if (s.isEmpty) return '';
  if (s == 'mobile_app') return trText('Telefon');
  if (s == 'gps') return 'GPS';
  if (s == 'qr') return 'QR';
  if (s.contains('face')) return 'Face ID';
  if (s == 'manual') return trText('Qo\'lda');
  if (s == 'import') return trText('Import');
  return trText('Terminal');
}

String punchAcceptedText(Map res) {
  final time = formatApiTime(res['occurredAt']);
  final label = trText('{0} qayd etildi', [punchDirectionLabel(res['direction'])]);
  return time.isEmpty ? label : '$label · $time';
}

String formatApiDateRange(dynamic from, dynamic to) {
  final a = formatApiDate(from);
  final b = formatApiDate(to);
  if (b.isEmpty || a == b) return a;
  return '$a – $b';
}

class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    LangScope.of(context);
    final (label, color) = statusStyle(status);
    return Text(
      label,
      style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 13),
    );
  }
}

(String, Color) statusStyle(String s) {
  switch (s) {
    case 'on_time':
      return (trText('Vaqtida'), AppColors.success);
    case 'late':
      return (trText('Kech'), AppColors.warn);
    case 'absent':
      return (trText('Kelmagan'), AppColors.danger);
    case 'leave':
      return (trText('Ta’til'), AppColors.accentSoft);
    case 'day_off':
      return (trText('Dam olish kuni'), AppColors.inkMuted);
    case 'holiday':
      return (trText('Bayram'), Color(0xFF8E6BD8));
    case 'planned':
      return (trText('Reja'), AppColors.inkFaint);
    case 'not_started':
      return (trText('Boshlanmagan'), AppColors.inkMuted);
    case 'draft':
      return (trText('Qoralama'), AppColors.inkMuted);
    case 'pending':
      return (trText('Kutilmoqda'), AppColors.warn);
    case 'approved':
      return (trText('Tasdiqlangan'), AppColors.success);
    case 'rejected':
      return (trText('Rad etilgan'), AppColors.danger);
    case 'cancelled':
      return (trText('Bekor'), AppColors.inkMuted);
    default:
      return (s, AppColors.inkMuted);
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.message, this.icon});

  final String message;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        margin: const EdgeInsets.all(16),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.88),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.line),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon ?? Icons.inbox_outlined,
              size: 30,
              color: AppColors.inkFaint,
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: AppColors.inkMuted,
                fontSize: 15,
                fontWeight: FontWeight.w600,
                height: 1.3,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class SceneHeading extends StatelessWidget {
  const SceneHeading(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6, bottom: 14),
      child: Align(
        alignment: Alignment.centerLeft,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.78),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withValues(alpha: 0.9)),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.w800,
                color: AppColors.ink,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class SectionCard extends StatelessWidget {
  const SectionCard({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.color,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      padding: padding ?? const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color ?? AppColors.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.line),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0F2FA350),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: child,
    );
  }
}

class AppBackBar extends StatelessWidget implements PreferredSizeWidget {
  const AppBackBar({
    super.key,
    required this.title,
    this.actions,
    this.centerTitle = false,
  });

  final String title;
  final List<Widget>? actions;
  final bool centerTitle;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      leading: IconButton(
        icon: const Icon(Icons.chevron_left, size: 30),
        onPressed: () => Navigator.of(context).maybePop(),
      ),
      title: Text(title),
      centerTitle: centerTitle,
      titleSpacing: 0,
      actions: actions,
    );
  }
}

class LinkText extends StatelessWidget {
  const LinkText(this.label, {super.key, this.onTap});

  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Text(
        label,
        style: const TextStyle(
          color: AppColors.accent,
          fontWeight: FontWeight.w600,
          fontSize: 13,
        ),
      ),
    );
  }
}

class MenuTile extends StatelessWidget {
  const MenuTile({
    super.key,
    required this.icon,
    required this.label,
    this.trailing,
    this.onTap,
    this.showChevron = true,
    this.subtitle,
  });

  final IconData icon;
  final String label;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool showChevron;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Icon(icon, color: AppColors.ink, size: 22),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      color: AppColors.ink,
                      fontWeight: FontWeight.w600,
                      fontSize: 15,
                    ),
                  ),
                  if (subtitle != null)
                    Text(
                      subtitle!,
                      style: const TextStyle(
                        color: AppColors.inkMuted,
                        fontSize: 12,
                      ),
                    ),
                ],
              ),
            ),
            if (trailing != null) trailing!,
            if (trailing == null && showChevron)
              const Icon(Icons.chevron_right, color: AppColors.inkMuted),
          ],
        ),
      ),
    );
  }
}

class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    this.onPressed,
    this.busy = false,
    this.color,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 50,
      child: FilledButton(
        style: FilledButton.styleFrom(
          backgroundColor: color ?? AppColors.accent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        onPressed: busy ? null : onPressed,
        child: busy
            ? const SizedBox(
                height: 22,
                width: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : Text(label),
      ),
    );
  }
}

class SoftField extends StatelessWidget {
  const SoftField({
    super.key,
    required this.controller,
    required this.hint,
    this.prefixIcon,
    this.suffixIcon,
    this.obscure = false,
    this.keyboardType,
    this.label,
  });

  final TextEditingController controller;
  final String hint;
  final IconData? prefixIcon;
  final Widget? suffixIcon;
  final bool obscure;
  final TextInputType? keyboardType;
  final String? label;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      obscureText: obscure,
      keyboardType: keyboardType,
      style: const TextStyle(color: AppColors.ink, fontWeight: FontWeight.w600),
      decoration: InputDecoration(
        hintText: label == null ? hint : null,
        labelText: label,
        prefixIcon: prefixIcon == null
            ? null
            : Icon(prefixIcon, color: AppColors.ink),
        suffixIcon: suffixIcon,
      ),
    );
  }
}

class AvatarCircle extends StatelessWidget {
  const AvatarCircle({super.key, this.name, this.radius = 28, this.imageUrl});

  final String? name;
  final double radius;
  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    final initials = _initials(name);
    return CircleAvatar(
      radius: radius,
      backgroundColor: AppColors.bgSoft,
      backgroundImage: imageUrl != null && imageUrl!.isNotEmpty
          ? NetworkImage(imageUrl!)
          : null,
      child: imageUrl == null || imageUrl!.isEmpty
          ? Text(
              initials,
              style: TextStyle(
                color: AppColors.ink,
                fontWeight: FontWeight.w700,
                fontSize: radius * 0.55,
              ),
            )
          : null,
    );
  }

  String _initials(String? n) {
    if (n == null || n.trim().isEmpty) return '?';
    final parts = n.trim().split(RegExp(r'\s+'));
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts[0].substring(0, 1) + parts[1].substring(0, 1)).toUpperCase();
  }
}
