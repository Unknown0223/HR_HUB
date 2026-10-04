import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/me_repository.dart';
import '../../core/api/screen_cache.dart';
import '../../core/i18n/app_lang.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets.dart';

/// Company news (Настройки → Главное on the web) and colleagues' upcoming birthdays.
final newsFeedProvider = FutureProvider.autoDispose((ref) async {
  ref.cacheFor(screenCacheTtl);
  final repo = ref.read(meRepositoryProvider);
  final results = await Future.wait([repo.news(), repo.birthdays()]);
  return (news: results[0], birthdays: results[1]);
});

/// News bodies are sanitized HTML from the web editor; the app shows them as plain paragraphs.
String newsPlainText(String html) {
  final text = html
      .replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), '\n')
      .replaceAll(RegExp(r'</(p|div|li|h[1-6])>', caseSensitive: false), '\n')
      .replaceAll(RegExp(r'<li[^>]*>', caseSensitive: false), '• ')
      .replaceAll(RegExp(r'<[^>]+>'), '')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'");
  return text
      .replaceAll(RegExp(r'[ \t]+\n'), '\n')
      .replaceAll(RegExp(r'\n{3,}'), '\n\n')
      .trim();
}

class NewsScreen extends ConsumerWidget {
  const NewsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(newsFeedProvider);
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.accent,
          onRefresh: () async {
            ref.invalidate(newsFeedProvider);
            await ref.read(newsFeedProvider.future);
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              SceneHeading(context.t('Yangiliklar')),
              ...async.when(
                loading: () => const [
                  Padding(
                    padding: EdgeInsets.only(top: 80),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                ],
                error: (e, _) => [EmptyState(message: '$e')],
                data: (feed) => [
                  if (feed.birthdays.isNotEmpty) ...[
                    _Birthdays(items: feed.birthdays.cast<Map>()),
                    const SizedBox(height: 14),
                  ],
                  if (feed.news.isEmpty)
                    SectionCard(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 18),
                        child: Column(
                          children: [
                            const Icon(
                              Icons.campaign_outlined,
                              size: 36,
                              color: AppColors.inkFaint,
                            ),
                            const SizedBox(height: 8),
                            Text(
                              context.t('Hozircha yangiliklar yo‘q'),
                              style: const TextStyle(
                                color: AppColors.inkMuted,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              context.t('HR e’lon qilgan yangiliklar shu yerda chiqadi'),
                              style: const TextStyle(
                                color: AppColors.inkFaint,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                    )
                  else
                    for (final n in feed.news.cast<Map>()) ...[
                      _NewsCard(item: n),
                      const SizedBox(height: 12),
                    ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Birthdays extends StatelessWidget {
  const _Birthdays({required this.items});

  final List<Map> items;

  String _when(BuildContext context, int days) => switch (days) {
    0 => context.t('Bugun'),
    1 => context.t('Ertaga'),
    -1 => context.t('Kecha'),
    _ => context.t('{0} kundan keyin', [days]),
  };

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.cake_outlined, color: AppColors.accent, size: 20),
              const SizedBox(width: 8),
              Text(
                context.t('Tug‘ilgan kunlar'),
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
              ),
            ],
          ),
          const SizedBox(height: 8),
          for (final b in items.take(8))
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  AvatarCircle(name: b['fullName']?.toString(), radius: 18),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          b['fullName']?.toString() ?? '—',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        if ((b['position']?.toString() ?? '').isNotEmpty)
                          Text(
                            b['position'].toString(),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: AppColors.inkMuted,
                              fontSize: 12,
                            ),
                          ),
                      ],
                    ),
                  ),
                  Builder(
                    builder: (context) {
                      final days = (b['daysUntil'] as num?)?.toInt() ?? 99;
                      final today = days == 0;
                      return Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: today
                              ? AppColors.accent
                              : AppColors.accentTint,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          days.abs() <= 1
                              ? _when(context, days)
                              : '${b['day']}.${'${b['month']}'.padLeft(2, '0')}',
                          style: TextStyle(
                            color: today ? Colors.white : AppColors.accent,
                            fontWeight: FontWeight.w800,
                            fontSize: 12,
                          ),
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _NewsCard extends StatefulWidget {
  const _NewsCard({required this.item});

  final Map item;

  @override
  State<_NewsCard> createState() => _NewsCardState();
}

class _NewsCardState extends State<_NewsCard> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final n = widget.item;
    final body = newsPlainText(n['body']?.toString() ?? '');
    final published = DateTime.tryParse(n['publishedAt']?.toString() ?? '');
    final long = body.length > 220 || '\n'.allMatches(body).length > 4;
    return SectionCard(
      child: InkWell(
        onTap: long ? () => setState(() => _open = !_open) : null,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(
                  Icons.campaign_rounded,
                  color: AppColors.accent,
                  size: 18,
                ),
                const SizedBox(width: 6),
                if (published != null)
                  Text(
                    DateFormat('dd.MM.yyyy, HH:mm').format(published.toLocal()),
                    style: const TextStyle(
                      color: AppColors.inkMuted,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              n['title']?.toString() ?? '',
              style: const TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 16,
                height: 1.25,
              ),
            ),
            if (body.isNotEmpty && body != n['title']) ...[
              const SizedBox(height: 6),
              Text(
                body,
                maxLines: _open ? null : 5,
                overflow: _open ? TextOverflow.visible : TextOverflow.ellipsis,
                style: const TextStyle(
                  color: AppColors.ink,
                  fontSize: 14,
                  height: 1.4,
                ),
              ),
            ],
            if (long)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  _open ? context.t('Yopish') : context.t('Batafsil'),
                  style: const TextStyle(
                    color: AppColors.accent,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            if ((n['authorName']?.toString() ?? '').isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  n['authorName'].toString(),
                  style: const TextStyle(
                    color: AppColors.inkFaint,
                    fontSize: 12,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
