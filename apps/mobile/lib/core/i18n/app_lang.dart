import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'ru.dart';

enum AppLang { uz, ru }

extension AppLangX on AppLang {
  String get code => name;
  String get label => this == AppLang.ru ? 'Русский' : 'O‘zbekcha';
}

const _prefsKey = 'app.lang';

AppLang _current = AppLang.uz;

/// Uzbek text is the key; a missing Russian entry falls back to Uzbek. `{0}`, `{1}`… are
/// replaced by [args].
String _translate(AppLang lang, String uz, List<Object?> args) {
  var text = lang == AppLang.ru ? (ruText[uz] ?? uz) : uz;
  for (var i = 0; i < args.length; i++) {
    text = text.replaceAll('{$i}', '${args[i] ?? ''}');
  }
  return text;
}

/// For helpers that have no BuildContext. Callers must sit inside a widget that already
/// depends on [LangScope] (any `context.t` call), otherwise they won't rebuild on a switch.
String trText(String uz, [List<Object?> args = const []]) =>
    _translate(_current, uz, args);

final appLangProvider = StateNotifierProvider<AppLangNotifier, AppLang>(
  (ref) => AppLangNotifier(),
);

class AppLangNotifier extends StateNotifier<AppLang> {
  AppLangNotifier() : super(AppLang.uz) {
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getString(_prefsKey) == AppLang.ru.code) {
      _current = AppLang.ru;
      state = AppLang.ru;
    }
  }

  Future<void> set(AppLang lang) async {
    _current = lang;
    state = lang;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefsKey, lang.code);
  }
}

/// Puts the chosen language above the navigator so any widget can translate.
class LangScope extends InheritedWidget {
  const LangScope({super.key, required this.lang, required super.child});

  final AppLang lang;

  static AppLang of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<LangScope>()?.lang ??
      AppLang.uz;

  @override
  bool updateShouldNotify(LangScope oldWidget) => oldWidget.lang != lang;
}

extension Tr on BuildContext {
  /// Uzbek is the source text; [ru] is shown when the app is switched to Russian.
  String tr(String uz, String ru) => LangScope.of(this) == AppLang.ru ? ru : uz;

  /// Translates Uzbek source text through the Russian dictionary.
  String t(String uz, [List<Object?> args = const []]) =>
      _translate(LangScope.of(this), uz, args);

  /// Locale for `intl` date formatting.
  String get dateLocale => LangScope.of(this).code;

  /// Month + year title. Russian needs the nominative form («октябрь», not «октября»).
  String get monthYearPattern =>
      LangScope.of(this) == AppLang.ru ? 'LLLL yyyy' : 'MMMM yyyy';
}
