import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';
import '../errors/api_exception.dart';
import '../security/app_lock.dart';
import '../tracking/tracking_controller.dart';

const _kMeCache = 'meCache';

class AuthUser {
  AuthUser({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
    required this.tenantId,
    this.tenant,
    this.employee,
    this.teamSize = 0,
    this.mustChangePassword = false,
  });

  final String id;
  final String email;
  final String fullName;
  final String role;
  final String? tenantId;
  final Map<String, dynamic>? tenant;
  final Map<String, dynamic>? employee;

  /// Active employees in the divisions this user manages (org chart).
  final int teamSize;

  /// Signed in with a one-time password from HR: the app is locked until a personal one is set.
  final bool mustChangePassword;

  bool get hasTeam => teamSize > 0;

  AuthUser withPasswordChanged() => AuthUser(
        id: id,
        email: email,
        fullName: fullName,
        role: role,
        tenantId: tenantId,
        tenant: tenant,
        employee: employee,
        teamSize: teamSize,
      );

  bool get isApprover =>
      role == 'manager' ||
      role == 'hr' ||
      role == 'tenant_admin' ||
      role == 'platform_admin';

  String get displayName {
    final emp = employee;
    if (emp != null) {
      final ln = emp['lastName']?.toString() ?? '';
      final fn = emp['firstName']?.toString() ?? '';
      final name = '$ln $fn'.trim();
      if (name.isNotEmpty) return name;
    }
    return fullName;
  }

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: json['id']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      fullName: json['fullName']?.toString() ?? '',
      role: json['role']?.toString() ?? 'employee',
      tenantId: json['tenantId']?.toString(),
      tenant: json['tenant'] is Map
          ? Map<String, dynamic>.from(json['tenant'] as Map)
          : null,
      employee: json['employee'] is Map
          ? Map<String, dynamic>.from(json['employee'] as Map)
          : null,
      teamSize: (json['teamSize'] as num?)?.toInt() ?? 0,
      mustChangePassword: json['mustChangePassword'] == true,
    );
  }
}

class AuthState {
  const AuthState({
    this.user,
    this.loading = true,
    this.error,
  });

  final AuthUser? user;
  final bool loading;
  final String? error;

  bool get isAuthenticated => user != null;

  AuthState copyWith({
    AuthUser? user,
    bool? loading,
    String? error,
    bool clearUser = false,
    bool clearError = false,
  }) {
    return AuthState(
      user: clearUser ? null : (user ?? this.user),
      loading: loading ?? this.loading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._ref) : super(const AuthState()) {
    restore();
  }

  final Ref _ref;

  ApiClient get _api => _ref.read(apiClientProvider);
  FlutterSecureStorageProxy get _storage =>
      FlutterSecureStorageProxy(_ref.read(secureStorageProvider));

  /// The session survives restarts and offline starts: only the server rejecting the token
  /// (401) or an explicit logout signs the user out.
  Future<void> restore() async {
    state = state.copyWith(loading: true, clearError: true);
    await _api.restoreBaseUrl();
    final token = await _storage.read('accessToken');
    if (token == null || token.isEmpty) {
      state = const AuthState(loading: false);
      return;
    }
    try {
      final me = await _api.get('/me').timeout(const Duration(seconds: 6));
      await _cacheMe(me);
      state = AuthState(user: AuthUser.fromJson(me), loading: false);
      unawaited(revalidate());
    } catch (e) {
      if (_isRejected(e)) {
        await logout(silent: true);
        state = const AuthState(loading: false);
        return;
      }
      final cached = await _cachedMe();
      state = AuthState(user: cached == null ? null : AuthUser.fromJson(cached), loading: false);
    }
  }

  /// Exchanges the current token for a fresh one (7-day window slides while the app is used).
  /// Signs out if the server says the account is gone or access was closed.
  Future<void> revalidate() async {
    try {
      final res = await _api.post('/auth/refresh').timeout(const Duration(seconds: 10));
      final token = res['accessToken']?.toString();
      if (token != null && token.isNotEmpty) {
        await _storage.write('accessToken', token);
      }
    } catch (e) {
      if (_isRejected(e) && state.isAuthenticated) await logout();
    }
  }

  bool _isRejected(Object e) => e is ApiException && e.statusCode == 401;

  Future<void> _cacheMe(Map<String, dynamic> me) =>
      _storage.write(_kMeCache, jsonEncode(me));

  Future<Map<String, dynamic>?> _cachedMe() async {
    try {
      final raw = await _storage.read(_kMeCache);
      if (raw == null || raw.isEmpty) return null;
      return Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (_) {
      return null;
    }
  }

  Future<void> login(String email, String password) async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      final res = await _api.post(
        '/auth/login',
        data: {'email': email.trim(), 'password': password},
      );
      final accessToken = res['accessToken']?.toString();
      final tenant = res['tenant'];
      final tenantId = tenant is Map
          ? tenant['id']?.toString()
          : res['user'] is Map
              ? (res['user'] as Map)['tenantId']?.toString()
              : null;
      if (accessToken == null || accessToken.isEmpty) {
        throw Exception('Token olinmadi');
      }
      await _storage.write('accessToken', accessToken);
      if (tenantId != null) {
        await _storage.write('tenantId', tenantId);
      }
      final me = await _api.get('/me');
      await _cacheMe(me);
      state = AuthState(user: AuthUser.fromJson(me), loading: false);
    } catch (e) {
      state = AuthState(loading: false, error: e.toString());
      rethrow;
    }
  }

  Future<void> logout({bool silent = false}) async {
    await _ref.read(trackingControllerProvider).stop();
    await _storage.delete('accessToken');
    await _storage.delete('tenantId');
    await _storage.delete(_kMeCache);
    await _ref.read(appLockProvider.notifier).reset();
    if (!silent) {
      state = const AuthState(loading: false);
    }
  }

  Future<void> refreshMe() async {
    final me = await _api.get('/me');
    await _cacheMe(me);
    state = AuthState(user: AuthUser.fromJson(me), loading: false);
  }

  /// The server already cleared the one-time flag; unlock even if re-reading /me fails.
  Future<void> passwordChanged() async {
    try {
      await refreshMe();
      if (state.user?.mustChangePassword != true) return;
    } catch (_) {}
    final user = state.user;
    if (user != null) {
      state = AuthState(user: user.withPasswordChanged(), loading: false);
    }
  }
}

/// Thin wrapper so tests can mock if needed.
class FlutterSecureStorageProxy {
  FlutterSecureStorageProxy(this._inner);
  final dynamic _inner;

  Future<String?> read(String key) => _inner.read(key: key) as Future<String?>;
  Future<void> write(String key, String value) =>
      _inner.write(key: key, value: value) as Future<void>;
  Future<void> delete(String key) => _inner.delete(key: key) as Future<void>;
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref);
});
