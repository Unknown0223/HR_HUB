import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api/team_repository.dart';
import '../core/auth/auth_state.dart';
import 'widgets.dart';

/// The signed-in employee's photo from their HR card, or their initials while it loads or is missing.
class MyAvatar extends ConsumerWidget {
  const MyAvatar({super.key, this.radius = 28});

  final double radius;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final url = ref
        .read(teamRepositoryProvider)
        .mediaUrl(user?.employee?['photoUrl']?.toString());
    final bytes = url == null
        ? null
        : ref.watch(teamPhotoProvider(url)).valueOrNull;
    if (bytes == null) {
      return AvatarCircle(name: user?.displayName, radius: radius);
    }
    return CircleAvatar(
      radius: radius,
      backgroundColor: Colors.white,
      backgroundImage: MemoryImage(bytes),
    );
  }
}
