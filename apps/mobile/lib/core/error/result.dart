import 'app_exception.dart';

/// A minimal Either-shaped result type used at repository boundaries instead
/// of letting [AppException] propagate as a thrown error through Riverpod
/// providers — repositories return `Result<T>`, providers/notifiers decide
/// whether to rethrow (for AsyncValue.guard call sites) or branch explicitly
/// (offline-tolerant reads, optimistic-write rollback). Deliberately
/// hand-rolled rather than pulling in `fpdart`/`dartz`: this project has one
/// use for Either (repository success/failure), not a general FP toolkit.
sealed class Result<T> {
  const Result();

  const factory Result.ok(T value) = Ok<T>;
  const factory Result.err(AppException error) = Err<T>;

  bool get isOk => this is Ok<T>;
  bool get isErr => this is Err<T>;

  T? get valueOrNull => switch (this) {
        Ok<T>(:final value) => value,
        Err<T>() => null,
      };

  AppException? get errorOrNull => switch (this) {
        Ok<T>() => null,
        Err<T>(:final error) => error,
      };

  R fold<R>(R Function(T value) onOk, R Function(AppException error) onErr) {
    return switch (this) {
      Ok<T>(:final value) => onOk(value),
      Err<T>(:final error) => onErr(error),
    };
  }

  Result<R> map<R>(R Function(T value) transform) {
    return switch (this) {
      Ok<T>(:final value) => Result.ok(transform(value)),
      Err<T>(:final error) => Result.err(error),
    };
  }
}

final class Ok<T> extends Result<T> {
  const Ok(this.value);
  final T value;
}

final class Err<T> extends Result<T> {
  const Err(this.error);
  final AppException error;
}

/// Runs [action], wrapping any thrown [AppException] into [Result.err] and
/// letting anything else (a genuine bug — a null-check failure, a type
/// error) rethrow rather than get silently swallowed as "unknown error".
Future<Result<T>> guardResult<T>(Future<T> Function() action) async {
  try {
    return Result.ok(await action());
  } on AppException catch (e) {
    return Result.err(e);
  }
}
