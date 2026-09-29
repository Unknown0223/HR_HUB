import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/team_repository.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';
import '../../shared/yandex_map_view.dart';

String initialsOf(String? name) {
  final parts = (name ?? '').trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
  return (parts[0].substring(0, 1) + parts[1].substring(0, 1)).toUpperCase();
}

/// Short "Karimov A." form for map labels.
String shortName(String? name) {
  final parts = (name ?? '').trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '—';
  if (parts.length == 1) return parts.first;
  return '${parts[0]} ${parts[1].substring(0, 1)}.';
}

List<(double, double)> _latLngs(Object? list) => ((list as List?) ?? const [])
    .cast<Map>()
    .map((p) => ((p['lat'] as num).toDouble(), (p['lng'] as num).toDouble()))
    .toList();

/// Raw GPS fixes of today's shift.
List<(double, double)> liveFixes(Map? live) => _latLngs(live?['track']);

/// Line to draw: the road-snapped route from the server, or the raw fixes if it has none.
List<(double, double)> liveRoute(Map? live) {
  final route = _latLngs(live?['route']);
  return route.length >= 2 ? route : liveFixes(live);
}

String hoursLabel(num minutes) {
  final m = minutes.round();
  final h = m ~/ 60;
  final r = m % 60;
  if (h == 0) return '$r daq';
  return r == 0 ? '$h soat' : '$h s $r daq';
}

String windowReasonText(String? reason) {
  switch (reason) {
    case 'working':
      return 'Ish vaqtida';
    case 'day_off':
      return 'Dam olish kuni';
    case 'holiday':
      return 'Bayram kuni';
    case 'absence':
      return 'Ta’tilda';
    case 'before_start':
      return 'Ish hali boshlanmagan';
    case 'after_end':
      return 'Ish vaqti tugagan';
    default:
      return '—';
  }
}

MapPin memberPin(Map m, {String? photoUrl}) {
  final loc = m['location'] as Map;
  final status = (m['today'] as Map?)?['status']?.toString() ?? '';
  return MapPin(
    id: m['employeeId'].toString(),
    lat: (loc['lat'] as num).toDouble(),
    lng: (loc['lng'] as num).toDouble(),
    initials: initialsOf(m['fullName']?.toString()),
    label: shortName(m['fullName']?.toString()),
    photoUrl: photoUrl,
    color: status == 'late' ? AppColors.warn : AppColors.accent,
    pulse: m['online'] == true,
    accuracy: (loc['accuracy'] as num?)?.toDouble(),
  );
}

/// Photo as a `data:` URL for the map WebView, which cannot send auth headers.
String? photoDataUrl(WidgetRef ref, String? url) {
  if (url == null) return null;
  final bytes = ref.watch(teamPhotoProvider(url)).valueOrNull;
  return bytes == null ? null : 'data:image/jpeg;base64,${base64Encode(bytes)}';
}

class MemberAvatar extends ConsumerWidget {
  const MemberAvatar({
    super.key,
    required this.name,
    this.photoUrl,
    this.status,
    this.online = false,
    this.radius = 26,
  });

  final String? name;
  final String? photoUrl;
  final String? status;
  final bool online;
  final double radius;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ring = status == null ? AppColors.line : statusStyle(status!).$2;
    final bytes = photoUrl == null ? null : ref.watch(teamPhotoProvider(photoUrl!)).valueOrNull;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          padding: const EdgeInsets.all(2.5),
          decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: ring, width: 2.5)),
          child: bytes == null
              ? AvatarCircle(name: name, radius: radius)
              : CircleAvatar(radius: radius, backgroundImage: MemoryImage(bytes)),
        ),
        if (online)
          Positioned(
            right: 1,
            bottom: 1,
            child: Container(
              width: radius * 0.5,
              height: radius * 0.5,
              decoration: BoxDecoration(
                color: AppColors.success,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2.5),
              ),
            ),
          ),
      ],
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final (label, color) = statusStyle(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 13),
      ),
    );
  }
}
