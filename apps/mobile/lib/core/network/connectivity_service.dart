import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';

/// Thin wrapper around connectivity_plus exposing a single boolean stream +
/// snapshot getter — every offline-aware repository (Projects, Targets,
/// Findings, AI conversation history, Evidence) reads [isOnline] before
/// deciding "hit the network" vs. "read Hive/sqflite cache and queue the
/// write", and the sync engine (core/sync) listens to [onStatusChange] to
/// know when to flush the outbox.
class ConnectivityService {
  ConnectivityService({Connectivity? connectivity})
      : _connectivity = connectivity ?? Connectivity() {
    _sub = _connectivity.onConnectivityChanged.listen((results) {
      _isOnline = _resultsIndicateOnline(results);
      _controller.add(_isOnline);
    });
  }

  final Connectivity _connectivity;
  late final StreamSubscription<List<ConnectivityResult>> _sub;
  final _controller = StreamController<bool>.broadcast();

  bool _isOnline = true;
  bool get isOnline => _isOnline;

  Stream<bool> get onStatusChange => _controller.stream;

  Future<void> initialize() async {
    final results = await _connectivity.checkConnectivity();
    _isOnline = _resultsIndicateOnline(results);
  }

  bool _resultsIndicateOnline(List<ConnectivityResult> results) =>
      results.any((r) => r != ConnectivityResult.none);

  Future<void> dispose() async {
    await _sub.cancel();
    await _controller.close();
  }
}
