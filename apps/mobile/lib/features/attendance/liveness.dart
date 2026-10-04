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

  static const cardinal = [left, right, up, down];

  bool get isDiagonal => !cardinal.contains(this);
  bool get isUp => this == up || this == upLeft || this == upRight;
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

  /// People tilt the head up/down much less than they turn it, and ML Kit reports a
  /// compressed pitch while the head is also turned, so pitch is scaled up before a
  /// diagonal is judged as a single 2-D movement.
  static const _pitchGain = 1.4;
  static const _diagonalMinMagnitude = 17.0;
  static const _diagonalMinComponent = 7.0;
  static const _diagonalToleranceDeg = 30.0;

  (double, double) _diagonalComponents(HeadDirection d) {
    final x = d == HeadDirection.upLeft || d == HeadDirection.downLeft ? yaw : -yaw;
    final y = d.isUp ? pitch * _pitchGain : -pitch * _pitchGain;
    return (x, y);
  }

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
      case HeadDirection.upRight:
      case HeadDirection.downLeft:
      case HeadDirection.downRight:
        final (x, y) = _diagonalComponents(d);
        if (x < _diagonalMinComponent || y < _diagonalMinComponent) return false;
        if (sqrt(x * x + y * y) < _diagonalMinMagnitude) return false;
        final angle = atan2(y, x) * 180 / pi;
        return (angle - 45).abs() <= _diagonalToleranceDeg;
    }
  }

  /// How far the head has moved toward [d] (0 = centered, 1 = enough to count).
  double progressToward(HeadDirection d) {
    final double p;
    switch (d) {
      case HeadDirection.left:
        p = yaw / 22;
      case HeadDirection.right:
        p = -yaw / 22;
      case HeadDirection.up:
        p = pitch / 15;
      case HeadDirection.down:
        p = -pitch / 12;
      case HeadDirection.upLeft:
      case HeadDirection.upRight:
      case HeadDirection.downLeft:
      case HeadDirection.downRight:
        final (x, y) = _diagonalComponents(d);
        p = min(
          (x + y) / sqrt2 / _diagonalMinMagnitude,
          min(x, y) / _diagonalMinComponent,
        );
    }
    return p.clamp(0.0, 1.0);
  }
}

enum LivenessPhase { center, turn, back, finalCenter, done, failed }

/// Random head-movement challenge: 3–4 distinct directions out of 8 (or only the 4
/// straight ones — company setting; the API needs at least 3). Each turn must be held
/// for a few frames and followed by a return to center, so a still photo or a looping
/// video cannot pass. Angles are measured from the neutral pose learned in the first phase.
class LivenessChallenge {
  LivenessChallenge(this.steps, {DateTime? now}) : _startedAt = now ?? DateTime.now();

  /// [directions] is 4 (left/right/up/down) or 8 (plus the diagonals).
  factory LivenessChallenge.random({int directions = 8, Random? rng, DateTime? now}) {
    final r = rng ?? Random.secure();
    final count = 3 + r.nextInt(2);
    final pool = [...(directions == 4 ? HeadDirection.cardinal : HeadDirection.values)]
      ..shuffle(r);
    return LivenessChallenge(pool.take(count).toList(), now: now);
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
  HeadPose? _lastPose;

  HeadDirection? get current => index < steps.length ? steps[index] : null;

  /// Progress of the current turn (0–1) for the on-screen hint.
  double get turnProgress {
    final d = current;
    final p = _lastPose;
    if (phase != LivenessPhase.turn || d == null || p == null) return 0;
    return p.progressToward(d);
  }
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
      _lastPose = null;
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
    _lastPose = pose;

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

  /// A single jittery frame only takes one frame of progress back instead of
  /// restarting the hold — ML Kit angles wobble by a few degrees frame to frame.
  void _advanceWhen(bool ok, int frames, LivenessPhase next, DateTime t) {
    if (!ok) {
      if (_hold > 0) _hold--;
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
