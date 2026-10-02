import 'dart:math';

import 'package:flutter/material.dart';

/// Head turn directions from the employee's own point of view.
enum HeadDirection {
  left('left', 'Chapga', Icons.west_rounded),
  right('right', 'O\'ngga', Icons.east_rounded),
  up('up', 'Yuqoriga', Icons.north_rounded),
  down('down', 'Pastga', Icons.south_rounded),
  upLeft('up_left', 'Chap-yuqoriga', Icons.north_west_rounded),
  upRight('up_right', 'O\'ng-yuqoriga', Icons.north_east_rounded),
  downLeft('down_left', 'Chap-pastga', Icons.south_west_rounded),
  downRight('down_right', 'O\'ng-pastga', Icons.south_east_rounded);

  const HeadDirection(this.apiName, this.label, this.icon);
  final String apiName;
  final String label;
  final IconData icon;
}

/// ML Kit Euler angles: [yaw] > 0 when the person turns to their left,
/// [pitch] > 0 when they look up.
class HeadPose {
  const HeadPose(this.yaw, this.pitch);
  final double yaw;
  final double pitch;

  bool get centered => yaw.abs() < 12 && pitch.abs() < 12;

  /// Loose "looking at the phone" check used to learn the employee's neutral pose: a phone
  /// held below the face reads about -10° pitch even when looking straight at it.
  bool get roughlyCentered => yaw.abs() < 15 && pitch.abs() < 22;

  HeadPose relativeTo(HeadPose base) => HeadPose(yaw - base.yaw, pitch - base.pitch);

  bool matches(HeadDirection d) {
    switch (d) {
      case HeadDirection.left:
        return yaw > 22 && pitch.abs() < 15;
      case HeadDirection.right:
        return yaw < -22 && pitch.abs() < 15;
      case HeadDirection.up:
        return pitch > 15 && yaw.abs() < 15;
      case HeadDirection.down:
        return pitch < -12 && yaw.abs() < 15;
      case HeadDirection.upLeft:
        return yaw > 15 && pitch > 12;
      case HeadDirection.upRight:
        return yaw < -15 && pitch > 12;
      case HeadDirection.downLeft:
        return yaw > 15 && pitch < -10;
      case HeadDirection.downRight:
        return yaw < -15 && pitch < -10;
    }
  }
}

enum LivenessPhase { center, turn, back, finalCenter, done, failed }

/// Random head-movement challenge: 3–4 distinct directions out of 8 (the API needs at
/// least 3). Each turn must be held for a few frames and followed by a return to
/// center, so a still photo or a looping video cannot pass. Angles are measured from
/// the neutral pose learned in the first phase.
class LivenessChallenge {
  LivenessChallenge(this.steps, {DateTime? now}) : _startedAt = now ?? DateTime.now();

  factory LivenessChallenge.random({Random? rng, DateTime? now}) {
    final r = rng ?? Random.secure();
    final count = 3 + r.nextInt(2);
    final all = [...HeadDirection.values]..shuffle(r);
    return LivenessChallenge(all.take(count).toList(), now: now);
  }

  static const _turnHoldFrames = 3;
  static const _centerHoldFrames = 3;
  static const _finalHoldFrames = 4;
  static const stepTimeout = Duration(seconds: 10);

  final List<HeadDirection> steps;
  final DateTime _startedAt;
  LivenessPhase phase = LivenessPhase.center;
  int index = 0;
  int _hold = 0;
  int? _trackingId;
  DateTime? _phaseStartedAt;
  HeadPose _neutral = const HeadPose(0, 0);
  double _neutralYawSum = 0;
  double _neutralPitchSum = 0;
  String? failReason;

  HeadDirection? get current => index < steps.length ? steps[index] : null;
  DateTime? get phaseStartedAt => _phaseStartedAt;
  Duration elapsed(DateTime now) => now.difference(_startedAt);
  List<String> get apiSteps => steps.map((s) => s.apiName).toList();

  /// Feed one analysed frame. [faces] is the number of faces in the frame.
  void feed(HeadPose? pose, {required int faces, int? trackingId, DateTime? now}) {
    final t = now ?? DateTime.now();
    if (phase == LivenessPhase.done || phase == LivenessPhase.failed) return;
    _phaseStartedAt ??= t;

    if ((phase == LivenessPhase.turn || phase == LivenessPhase.back) &&
        t.difference(_phaseStartedAt!) > stepTimeout) {
      _fail('Vaqt tugadi — harakatni tezroq bajaring');
      return;
    }
    if (faces != 1 || pose == null) {
      _hold = 0;
      return;
    }
    if (trackingId != null) {
      if (_trackingId != null && _trackingId != trackingId && phase != LivenessPhase.center) {
        _fail('Kadrdagi yuz almashdi');
        return;
      }
      _trackingId = trackingId;
    }

    if (phase == LivenessPhase.center) {
      _learnNeutral(pose, t);
      return;
    }
    pose = pose.relativeTo(_neutral);

    switch (phase) {
      case LivenessPhase.center:
        break;
      case LivenessPhase.turn:
        _advanceWhen(pose.matches(current!), _turnHoldFrames, LivenessPhase.back, t);
      case LivenessPhase.back:
        if (pose.centered) {
          _hold++;
          if (_hold >= _centerHoldFrames) {
            index++;
            _enter(index >= steps.length ? LivenessPhase.finalCenter : LivenessPhase.turn, t);
          }
        } else {
          _hold = 0;
        }
      case LivenessPhase.finalCenter:
        _advanceWhen(pose.centered, _finalHoldFrames, LivenessPhase.done, t);
      case LivenessPhase.done:
      case LivenessPhase.failed:
        break;
    }
  }

  void _learnNeutral(HeadPose pose, DateTime t) {
    if (!pose.roughlyCentered) {
      _hold = 0;
      _neutralYawSum = 0;
      _neutralPitchSum = 0;
      return;
    }
    _hold++;
    _neutralYawSum += pose.yaw;
    _neutralPitchSum += pose.pitch;
    if (_hold >= _centerHoldFrames) {
      _neutral = HeadPose(_neutralYawSum / _hold, _neutralPitchSum / _hold);
      _enter(LivenessPhase.turn, t);
    }
  }

  void _advanceWhen(bool ok, int frames, LivenessPhase next, DateTime t) {
    if (!ok) {
      _hold = 0;
      return;
    }
    _hold++;
    if (_hold >= frames) _enter(next, t);
  }

  void _enter(LivenessPhase next, DateTime t) {
    phase = next;
    _hold = 0;
    _phaseStartedAt = t;
  }

  void _fail(String reason) {
    phase = LivenessPhase.failed;
    failReason = reason;
  }
}
