import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';

class AuthUser {
  AuthUser({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
    required this.tenantId,
    this.tenant,
    this.employee,
  });

  final String id;
  final String email;
  final String fullName;
  final String role;
  final String? tenantId;
  final Map<String, dynamic>? tenant;
  final Map<String, dynamic>? employee;

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

  Future<void> restore() async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      await _restoreInner().timeout(const Duration(seconds: 6));
    } catch (_) {
      try {
        await logout(silent: true);
      } catch (_) {}
      state = const AuthState(loading: false);
    }
  }

  Future<void> _restoreInner() async {
    await _api.restoreBaseUrl();
    final token = await _storage.read('accessToken');
    if (token == null || token.isEmpty) {
      state = const AuthState(loading: false);
      return;
    }
    final me = await _api.get('/me');
    state = AuthState(user: AuthUser.fromJson(me), loading: false);
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
      state = AuthState(user: AuthUser.fromJson(me), loading: false);
    } catch (e) {
      state = AuthState(loading: false, error: e.toString());
      rethrow;
    }
  }

  Future<void> logout({bool silent = false}) async {
    await _storage.delete('accessToken');
    await _storage.delete('tenantId');
    if (!silent) {
      state = const AuthState(loading: false);
    }
  }

  Future<void> refreshMe() async {
    final me = await _api.get('/me');
    state = AuthState(user: AuthUser.fromJson(me), loading: false);
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
