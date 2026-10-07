import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/error/app_exception.dart';
import '../../../../core/legal/legal_version.dart';
import '../../application/auth_notifier.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _submitting = false;
  bool _acceptedLegal = false;
  String? _error;
  String? _info;
  final List<TapGestureRecognizer> _linkRecognizers = [];

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    for (final recognizer in _linkRecognizers) {
      recognizer.dispose();
    }
    super.dispose();
  }

  TapGestureRecognizer _link(String url) {
    final recognizer = TapGestureRecognizer()
      ..onTap = () => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    _linkRecognizers.add(recognizer);
    return recognizer;
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (!_acceptedLegal) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).register(
            email: _emailController.text.trim(),
            password: _passwordController.text,
            displayName: _nameController.text.trim(),
            acceptedLegalVersion: legalVersion,
          );
      setState(() => _info = 'Account created. Check your email to verify, then sign in.');
    } on AppException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create account')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: ListView(
              children: [
                TextFormField(
                  controller: _nameController,
                  decoration: const InputDecoration(labelText: 'Display name'),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(labelText: 'Email'),
                  validator: (v) => (v == null || !v.contains('@')) ? 'Enter a valid email' : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _passwordController,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Password'),
                  validator: (v) =>
                      (v == null || v.length < 8) ? 'At least 8 characters' : null,
                ),
                const SizedBox(height: 16),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Checkbox(
                      value: _acceptedLegal,
                      onChanged: (v) => setState(() => _acceptedLegal = v ?? false),
                    ),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Text.rich(
                          TextSpan(
                            style: Theme.of(context).textTheme.bodySmall,
                            children: [
                              const TextSpan(text: 'I have read and agree to the '),
                              TextSpan(
                                text: 'Terms of Service',
                                style: const TextStyle(decoration: TextDecoration.underline),
                                recognizer: _link(legalTermsUrl),
                              ),
                              const TextSpan(text: ', '),
                              TextSpan(
                                text: 'Acceptable Use Policy',
                                style: const TextStyle(decoration: TextDecoration.underline),
                                recognizer: _link(legalAcceptableUseUrl),
                              ),
                              const TextSpan(text: ' and '),
                              TextSpan(
                                text: 'Privacy Policy',
                                style: const TextStyle(decoration: TextDecoration.underline),
                                recognizer: _link(legalPrivacyUrl),
                              ),
                              const TextSpan(
                                text:
                                    ', and I confirm I will only test systems I own or am explicitly authorized to test. If I act outside an agreed ROE/scope, I accept full responsibility.',
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: Colors.redAccent)),
                ],
                if (_info != null) ...[
                  const SizedBox(height: 12),
                  Text(_info!, style: const TextStyle(color: Colors.greenAccent)),
                ],
                const SizedBox(height: 24),
                ElevatedButton(
                  // Disabled until the legal checkbox is ticked.
                  onPressed: _submitting || !_acceptedLegal ? null : _submit,
                  child: _submitting
                      ? const SizedBox(
                          height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Create account'),
                ),
                const SizedBox(height: 12),
                Center(
                  child: TextButton(
                    onPressed: () => context.pop(),
                    child: const Text('Already have an account? Sign in'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
