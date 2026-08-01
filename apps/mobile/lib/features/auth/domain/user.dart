/// Mirrors packages/shared's `AuthenticatedUserDto` (auth.ts) field-for-field.
class AppUser {
  const AppUser({
    required this.id,
    required this.email,
    required this.displayName,
    required this.emailVerified,
    required this.mfaEnabled,
    required this.createdAt,
    this.avatarUrl,
  });

  final String id;
  final String email;
  final String displayName;
  final String? avatarUrl;
  final bool emailVerified;
  final bool mfaEnabled;
  final DateTime createdAt;

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
        id: json['id'] as String,
        email: json['email'] as String,
        displayName: json['displayName'] as String,
        avatarUrl: json['avatarUrl'] as String?,
        emailVerified: json['emailVerified'] as bool,
        mfaEnabled: json['mfaEnabled'] as bool,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'displayName': displayName,
        'avatarUrl': avatarUrl,
        'emailVerified': emailVerified,
        'mfaEnabled': mfaEnabled,
        'createdAt': createdAt.toIso8601String(),
      };

  AppUser copyWith({String? displayName, String? avatarUrl, bool? mfaEnabled}) => AppUser(
        id: id,
        email: email,
        displayName: displayName ?? this.displayName,
        avatarUrl: avatarUrl ?? this.avatarUrl,
        emailVerified: emailVerified,
        mfaEnabled: mfaEnabled ?? this.mfaEnabled,
        createdAt: createdAt,
      );
}

/// Mirrors `SessionSummaryDto` (auth.ts) — Session/device management.
class DeviceSession {
  const DeviceSession({
    required this.id,
    required this.deviceName,
    required this.ipAddress,
    required this.userAgent,
    required this.createdAt,
    required this.lastActiveAt,
    required this.current,
  });

  final String id;
  final String deviceName;
  final String ipAddress;
  final String userAgent;
  final DateTime createdAt;
  final DateTime lastActiveAt;
  final bool current;

  factory DeviceSession.fromJson(Map<String, dynamic> json) => DeviceSession(
        id: json['id'] as String,
        deviceName: json['deviceName'] as String,
        ipAddress: json['ipAddress'] as String,
        userAgent: json['userAgent'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
        lastActiveAt: DateTime.parse(json['lastActiveAt'] as String),
        current: json['current'] as bool,
      );
}
