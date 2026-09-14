import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme/app_theme.dart';
import 'features/link/link_screen.dart';

class OfficeLinkApp extends StatelessWidget {
  const OfficeLinkApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ProviderScope(
      child: MaterialApp(
        title: 'HR HUB Link',
        debugShowCheckedModeBanner: false,
        theme: buildLinkTheme(),
        home: const LinkScreen(),
      ),
    );
  }
}
