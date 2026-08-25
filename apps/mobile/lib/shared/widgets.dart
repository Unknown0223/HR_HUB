import 'package:flutter/material.dart';
import '../core/theme/app_theme.dart';

class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final (label, color) = _map(status);
    return Text(
      label,
      style: TextStyle(
        color: color,
        fontWeight: FontWeight.w700,
        fontSize: 13,
      ),
    );
  }

  (String, Color) _map(String s) {
    switch (s) {
      case 'on_time':
        return ('Vaqtida', AppColors.success);
      case 'late':
        return ('Kech', AppColors.warn);
      case 'absent':
        return ('Yo‘q', AppColors.danger);
      case 'leave':
        return ('Ta’til', AppColors.accentSoft);
      case 'day_off':
        return ('Dam olish kuni', AppColors.inkMuted);
      case 'not_started':
        return ('Boshlanmagan', AppColors.inkMuted);
      case 'pending':
        return ('Kutilmoqda', AppColors.warn);
      case 'approved':
        return ('Tasdiqlangan', AppColors.success);
      case 'rejected':
        return ('Rad etilgan', AppColors.danger);
      case 'cancelled':
        return ('Bekor', AppColors.inkMuted);
      default:
        return (s, AppColors.inkMuted);
    }
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.message, this.icon});

  final String message;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          message,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: AppColors.inkMuted,
            fontSize: 15,
            fontWeight: FontWeight.w500,
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
        borderRadius: BorderRadius.circular(16),
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
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
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
        prefixIcon:
            prefixIcon == null ? null : Icon(prefixIcon, color: AppColors.ink),
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
      backgroundImage:
          imageUrl != null && imageUrl!.isNotEmpty ? NetworkImage(imageUrl!) : null,
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
