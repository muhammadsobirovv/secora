import 'package:flutter_test/flutter_test.dart';
import 'package:pentesthub_mobile/features/auth/domain/auth_state.dart';
import 'package:pentesthub_mobile/features/auth/domain/user.dart';

void main() {
  final user = AppUser(
    id: 'u1',
    email: 'a@b.com',
    displayName: 'Ada',
    emailVerified: true,
    mfaEnabled: false,
    createdAt: DateTime.utc(2026),
  );

  test('AuthState is a closed sealed hierarchy exhaustively switchable', () {
    String describe(AuthState state) => switch (state) {
          AuthLoading() => 'loading',
          AuthUnauthenticated() => 'unauthenticated',
          AuthMfaRequired(:final mfaChallengeToken) => 'mfa:$mfaChallengeToken',
          AuthLocked(:final user) => 'locked:${user.id}',
          AuthAuthenticated(:final user) => 'authenticated:${user.id}',
        };

    expect(describe(const AuthLoading()), 'loading');
    expect(describe(const AuthUnauthenticated()), 'unauthenticated');
    expect(describe(const AuthMfaRequired('token-1')), 'mfa:token-1');
    expect(describe(AuthLocked(user)), 'locked:u1');
    expect(describe(AuthAuthenticated(user)), 'authenticated:u1');
  });

  test('AppUser.copyWith only overrides the given fields', () {
    final updated = user.copyWith(displayName: 'Ada Lovelace');
    expect(updated.displayName, 'Ada Lovelace');
    expect(updated.email, user.email);
    expect(updated.id, user.id);
  });

  test('AppUser.fromJson/toJson round-trips', () {
    final json = user.toJson();
    final restored = AppUser.fromJson(json);
    expect(restored.id, user.id);
    expect(restored.email, user.email);
    expect(restored.mfaEnabled, user.mfaEnabled);
    expect(restored.createdAt, user.createdAt);
  });
}
