import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:hr_hub_mobile/features/attendance/liveness.dart';

const _poses = {
  HeadDirection.left: HeadPose(30, 0),
  HeadDirection.right: HeadPose(-30, 0),
  HeadDirection.up: HeadPose(0, 20),
  HeadDirection.down: HeadPose(0, -18),
  HeadDirection.upLeft: HeadPose(20, 16),
  HeadDirection.upRight: HeadPose(-20, 16),
  HeadDirection.downLeft: HeadPose(20, -14),
  HeadDirection.downRight: HeadPose(-20, -14),
};

void main() {
  test('random challenge has 3–8 distinct directions', () {
    final rng = Random(1);
    for (var i = 0; i < 200; i++) {
      final c = LivenessChallenge.random(rng: rng);
      expect(c.steps.length, inInclusiveRange(3, 8));
      expect(c.steps.toSet().length, c.steps.length);
    }
  });

  test('each pose matches only its own direction', () {
    _poses.forEach((dir, pose) {
      for (final other in HeadDirection.values) {
        expect(pose.matches(other), other == dir, reason: '$dir vs $other');
      }
      expect(pose.centered, isFalse);
    });
  });

  test('passes only after every turn and return to center', () {
    final t0 = DateTime(2026, 1, 1, 9);
    var t = t0;
    final c = LivenessChallenge(
      [HeadDirection.left, HeadDirection.upRight, HeadDirection.down],
      now: t0,
    );
    void frames(HeadPose p, int n) {
      for (var i = 0; i < n; i++) {
        t = t.add(const Duration(milliseconds: 150));
        c.feed(p, faces: 1, trackingId: 7, now: t);
      }
    }

    const center = HeadPose(0, 0);
    frames(center, 3);
    expect(c.phase, LivenessPhase.turn);
    for (final d in c.steps) {
      frames(_poses[d]!, 3);
      expect(c.phase, LivenessPhase.back);
      frames(center, 3);
    }
    expect(c.phase, LivenessPhase.finalCenter);
    frames(center, 4);
    expect(c.phase, LivenessPhase.done);
    expect(c.apiSteps, ['left', 'up_right', 'down']);
  });

  test('a still face never passes and times out', () {
    final t0 = DateTime(2026, 1, 1, 9);
    final c = LivenessChallenge([HeadDirection.left, HeadDirection.up, HeadDirection.right], now: t0);
    for (var i = 1; i <= 80; i++) {
      c.feed(const HeadPose(0, 0), faces: 1, trackingId: 1, now: t0.add(Duration(milliseconds: 150 * i)));
    }
    expect(c.phase, LivenessPhase.failed);
  });

  test('wrong direction does not advance; face swap fails', () {
    final t0 = DateTime(2026, 1, 1, 9);
    final c = LivenessChallenge([HeadDirection.left, HeadDirection.up, HeadDirection.right], now: t0);
    var t = t0;
    void f(HeadPose p, int id) {
      t = t.add(const Duration(milliseconds: 150));
      c.feed(p, faces: 1, trackingId: id, now: t);
    }

    for (var i = 0; i < 3; i++) {
      f(const HeadPose(0, 0), 1);
    }
    for (var i = 0; i < 5; i++) {
      f(_poses[HeadDirection.right]!, 1);
    }
    expect(c.phase, LivenessPhase.turn);
    f(_poses[HeadDirection.left]!, 2);
    expect(c.phase, LivenessPhase.failed);
  });
}
