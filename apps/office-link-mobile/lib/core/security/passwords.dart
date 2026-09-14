import 'dart:convert';
import 'dart:math';

/// Hikvision terminal password rules + platform generator (Hr…9).
String? hikvisionPasswordError(String password, {String username = ''}) {
  final pwd = password;
  if (pwd.length < 8 || pwd.length > 16) {
    return 'Parol 8–16 belgidan iborat bo‘lishi kerak';
  }
  final user = username.trim();
  if (user.isNotEmpty && pwd.toLowerCase().contains(user.toLowerCase())) {
    return 'Parol foydalanuvchi nomini o‘z ichiga olmasligi kerak';
  }
  var classes = 0;
  if (pwd.contains(RegExp(r'[a-z]'))) classes++;
  if (pwd.contains(RegExp(r'[A-Z]'))) classes++;
  if (pwd.contains(RegExp(r'[0-9]'))) classes++;
  if (pwd.contains(RegExp(r'[^a-zA-Z0-9]'))) classes++;
  if (classes < 2) {
    return 'Kamida 2 xil belgi turi kerak (katta/kichik/raqam/maxsus)';
  }
  return null;
}

String generateTerminalPassword({String username = 'admin'}) {
  const alphabet =
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  final rnd = Random.secure();
  String body() =>
      List.generate(10, (_) => alphabet[rnd.nextInt(alphabet.length)]).join();

  var pwd = 'Hr${body()}9';
  final user = username.toLowerCase();
  if (user.isNotEmpty && pwd.toLowerCase().contains(user)) {
    pwd = 'Kx${body()}7';
  }
  pwd = pwd.length > 16 ? pwd.substring(0, 16) : pwd;

  for (var i = 0; i < 8; i++) {
    if (hikvisionPasswordError(pwd, username: username) == null) return pwd;
    pwd = 'Hr${body()}9';
    if (pwd.length > 16) pwd = pwd.substring(0, 16);
    if (user.isNotEmpty && pwd.toLowerCase().contains(user)) {
      pwd = 'Kx${body()}7';
      if (pwd.length > 16) pwd = pwd.substring(0, 16);
    }
  }
  return 'HrHub9xK2mP4q';
}

String xmlEscape(String value) {
  return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
}

/// Decode JSON map safely.
Map<String, dynamic>? tryJsonMap(String text) {
  try {
    final v = jsonDecode(text);
    if (v is Map<String, dynamic>) return v;
    if (v is Map) return Map<String, dynamic>.from(v);
  } catch (_) {}
  return null;
}
