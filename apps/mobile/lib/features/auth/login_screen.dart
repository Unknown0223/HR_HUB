import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_config.dart';
import '../../core/auth/auth_state.dart';
import '../../core/biometrics/biometric_service.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _baseUrl = TextEditingController(text: ApiConfig.defaultBaseUrl);
  bool _obscure = true;
  bool _busy = false;
  bool _bioEnabled = false;
  bool _showServer = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadBaseUrl();
    _loadBio();
  }

  Future<void> _loadBaseUrl() async {
    final prefs = await SharedPreferences.getInstance();
    final url = prefs.getString('apiBaseUrl');
    if (url != null && url.isNotEmpty) {
      _baseUrl.text = url;
      if (url != ApiConfig.defaultBaseUrl && mounted) {
        setState(() => _showServer = true);
      }
    }
  }

  String? _credentialsError() {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      return 'Login va parolni kiriting';
    }
    return null;
  }

  Future<void> _loadBio() async {
    final enabled = await ref.read(biometricServiceProvider).isEnabled;
    if (mounted) setState(() => _bioEnabled = enabled);
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _baseUrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final invalid = _credentialsError();
    if (invalid != null) {
      setState(() => _error = invalid);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(apiClientProvider).setBaseUrl(_baseUrl.text.trim());
      await ref.read(authProvider.notifier).login(_email.text.trim(), _password.text);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _bioUnlock() async {
    final invalid = _credentialsError();
    if (invalid != null) {
      setState(() => _error = invalid);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(apiClientProvider).setBaseUrl(_baseUrl.text.trim());
      final ok = await ref.read(biometricServiceProvider).authenticate(
            reason: 'HR HUB — barmoq izi bilan kirish',
            allowSkipIfUnavailable: false,
          );
      if (!ok) {
        throw Exception('Biometrik rad etildi');
      }
      await ref.read(authProvider.notifier).login(_email.text.trim(), _password.text);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Kirish',
                  style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    color: AppColors.ink,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Login va parolni HR bo\'limidan oling',
                  style: TextStyle(color: AppColors.inkFaint, fontSize: 13),
                ),
                const SizedBox(height: 24),
                SoftField(
                  controller: _email,
                  hint: 'login@kompaniya',
                  label: 'Login',
                  prefixIcon: Icons.person_outline,
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 14),
                SoftField(
                  controller: _password,
                  hint: 'Parol',
                  prefixIcon: Icons.lock_outline,
                  obscure: _obscure,
                  suffixIcon: IconButton(
                    onPressed: () => setState(() => _obscure = !_obscure),
                    icon: Icon(
                      _obscure
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                      color: AppColors.ink,
                    ),
                  ),
                ),
                if (_showServer) ...[
                  const SizedBox(height: 14),
                  SoftField(
                    controller: _baseUrl,
                    hint: 'Server manzil',
                    label: 'Server manzil',
                    prefixIcon: Icons.cloud_outlined,
                    suffixIcon: IconButton(
                      tooltip: 'Standart server',
                      onPressed: () => setState(
                        () => _baseUrl.text = ApiConfig.defaultBaseUrl,
                      ),
                      icon: const Icon(Icons.restart_alt, color: AppColors.ink),
                    ),
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _error!,
                    style: const TextStyle(color: AppColors.danger),
                  ),
                ],
                const SizedBox(height: 24),
                PrimaryButton(
                  label: 'Kirish',
                  busy: _busy,
                  onPressed: _submit,
                ),
                const SizedBox(height: 18),
                if (_bioEnabled) ...[
                  OutlinedButton.icon(
                    onPressed: _busy ? null : _bioUnlock,
                    icon: const Icon(Icons.fingerprint),
                    label: const Text('Barmoq izi bilan kirish'),
                  ),
                  const SizedBox(height: 18),
                ],
                Center(
                  child: TextButton.icon(
                    onPressed: () => setState(() => _showServer = !_showServer),
                    icon: Icon(
                      _showServer ? Icons.expand_less : Icons.settings_outlined,
                      size: 18,
                      color: AppColors.inkFaint,
                    ),
                    label: const Text(
                      'Server sozlamalari',
                      style: TextStyle(color: AppColors.inkFaint, fontSize: 12),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
