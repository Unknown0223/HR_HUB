import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';

/// Everything the app needs before it can be used: punch (camera + GPS) and
/// background tracking during working hours.
enum AppPermission {
  location(
    'Aniq joylashuv',
    'Kirish/chiqish belgisini GPS orqali tasdiqlash uchun',
    Icons.my_location_rounded,
  ),
  backgroundLocation(
    'Joylashuv — «Doim ruxsat»',
    'Ilova yopiq bo‘lsa ham ish vaqtida joylashuvni uzatish uchun',
    Icons.share_location_rounded,
  ),
  gpsService(
    'GPS yoqilgan',
    'Telefon sozlamalarida joylashuv xizmati yoqilgan bo‘lishi kerak',
    Icons.satellite_alt_rounded,
  ),
  camera(
    'Kamera',
    'Yuzni tekshirish va foto-hisobot uchun',
    Icons.photo_camera_rounded,
  ),
  notifications(
    'Bildirishnomalar',
    'Kuzatuv holati va HR xabarlarini ko‘rsatish uchun',
    Icons.notifications_active_rounded,
  ),
  battery(
    'Batareya cheklovisiz',
    'Tizim ilovani fonda o‘chirib qo‘ymasligi uchun',
    Icons.battery_charging_full_rounded,
  );

  const AppPermission(this.title, this.reason, this.icon);
  final String title;
  final String reason;
  final IconData icon;
}

enum GrantStatus { granted, denied, permanentlyDenied }

class PermissionsState {
  const PermissionsState({this.statuses = const {}, this.checked = false});

  final Map<AppPermission, GrantStatus> statuses;
  final bool checked;

  bool isGranted(AppPermission p) => statuses[p] == GrantStatus.granted;
  bool get allGranted =>
      checked && AppPermission.values.every((p) => statuses[p] == GrantStatus.granted);
  int get grantedCount =>
      AppPermission.values.where((p) => statuses[p] == GrantStatus.granted).length;

  bool sameAs(PermissionsState other) {
    if (checked != other.checked) return false;
    for (final p in AppPermission.values) {
      if (statuses[p] != other.statuses[p]) return false;
    }
    return true;
  }
}

class PermissionsNotifier extends StateNotifier<PermissionsState> {
  PermissionsNotifier() : super(const PermissionsState()) {
    refresh();
  }

  static GrantStatus _map(PermissionStatus s) {
    if (s.isGranted || s.isLimited) return GrantStatus.granted;
    if (s.isPermanentlyDenied || s.isRestricted) return GrantStatus.permanentlyDenied;
    return GrantStatus.denied;
  }

  /// `null` for the GPS switch, which is a system setting rather than a runtime permission.
  Permission? _permissionFor(AppPermission p) => switch (p) {
        AppPermission.location => Permission.locationWhenInUse,
        AppPermission.backgroundLocation => Permission.locationAlways,
        AppPermission.camera => Permission.camera,
        AppPermission.notifications => Permission.notification,
        AppPermission.battery => Permission.ignoreBatteryOptimizations,
        AppPermission.gpsService => null,
      };

  Future<GrantStatus> _check(AppPermission p) async {
    final permission = _permissionFor(p);
    if (permission == null) {
      return await Geolocator.isLocationServiceEnabled()
          ? GrantStatus.granted
          : GrantStatus.denied;
    }
    return _map(await permission.status);
  }

  Future<void> refresh() async {
    final next = <AppPermission, GrantStatus>{};
    for (final p in AppPermission.values) {
      try {
        next[p] = await _check(p);
      } catch (_) {
        next[p] = GrantStatus.denied;
      }
    }
    final updated = PermissionsState(statuses: next, checked: true);
    if (!updated.sameAs(state)) state = updated;
  }

  /// Background location can only be asked after foreground location is granted.
  Future<void> request(AppPermission p) async {
    final permission = _permissionFor(p);
    if (permission == null) {
      await Geolocator.openLocationSettings();
    } else if (state.statuses[p] == GrantStatus.permanentlyDenied) {
      await openAppSettings();
    } else {
      if (p == AppPermission.backgroundLocation && !state.isGranted(AppPermission.location)) {
        await Permission.locationWhenInUse.request();
      }
      final result = await permission.request();
      if (result.isPermanentlyDenied) await openAppSettings();
    }
    await refresh();
  }

  Future<void> requestAllMissing() async {
    for (final p in AppPermission.values) {
      if (state.isGranted(p)) continue;
      await request(p);
      if (!state.isGranted(p)) return;
    }
  }
}

final permissionsProvider =
    StateNotifierProvider<PermissionsNotifier, PermissionsState>((_) => PermissionsNotifier());
