import { HttpException, HttpStatus } from '@nestjs/common';
import type { AppErrorCode } from '@pentesthub/shared';

/// Every use-case/command/query handler throws this (never a raw NestJS
/// HttpException) so the global exception filter can always surface a
/// stable `code` the frontend branches on, matching AppErrorResponseDto
/// in @pentesthub/shared.
export class AppException extends HttpException {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ code, message }, status);
  }
}
