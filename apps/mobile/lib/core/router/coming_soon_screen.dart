import 'package:flutter/material.dart';

/// Placeholder for a branch route whose feature hasn't landed in the
/// current build pass yet — swapped out screen-by-screen as each
/// `features/*` module ships (see docs/mobile/mobile-architecture-guide.md
/// "Build sequencing"). Never used for a feature this module's task list
/// claims as done.
class ComingSoonScreen extends StatelessWidget {
  const ComingSoonScreen({super.key, required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: const Center(child: Text('Coming soon')),
    );
  }
}
