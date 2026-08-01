import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/error/app_exception.dart';
import '../../application/auth_notifier.dart';

/// Handles both steps: request-reset-email (no token in scope) and, when
/// launched via the deep link `pentesthub://reset-password?token=...`
/// (`AppRoutes.resetPassword`), set-new-password.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key, this.resetToken});
  final String? resetToken;

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _emailController = TextEditingController();
  final _newPasswordController = TextEditingController();
  bool _submitting = false;
  String? _error;
  String? _info;

  bool get _isResetStep => widget.resetToken != null;

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _error = null;
      _info = null;
    });
    try {
      final repo = ref.read(authRepositoryProvider);
      if (_isResetStep) {
        await repo.resetPassword(token: widget.resetToken!, newPassword: _newPasswordController.text);
        setState(() => _info = 'Password updated. You can now sign in.');
      } else {
        await repo.requestPasswordReset(_emailController.text.trim());
        setState(() => _info = 'If that email exists, a reset link has been sent.');
      }
    } on AppException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_isResetStep ? 'Set new password' : 'Reset password')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_isResetStep)
                TextField(
                  controller: _newPasswordController,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'New password'),
                )
              else
                TextField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(labelText: 'Email'),
                ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: Colors.redAccent)),
              ],
              if (_info != null) ...[
                const SizedBox(height: 12),
                Text(_info!, style: const TextStyle(color: Colors.greenAccent)),
              ],
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _submitting ? null : _submit,
                child: _submitting
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(_isResetStep ? 'Update password' : 'Send reset link'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
