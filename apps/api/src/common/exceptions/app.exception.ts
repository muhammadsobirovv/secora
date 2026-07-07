import { HttpException, HttpStatus } from '@nestjs/common';
import type { AuthErrorCode } from '@pentesthub/shared';

/// Every use-case throws this (never a raw NestJS HttpException) so the
/// global exception filter can always surface a stable `code` the frontend
/// branches on, matching AuthErrorResponseDto in @pentesthub/shared.
export class AppException extends HttpException {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ code, message }, status);
  }
}
