import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import type { ApiErrorResponse } from '@pentesthub/shared';
import { AppException } from '../exceptions/app.exception.js';
import { getRequestId } from '../../observability/request-context.js';
import { Prisma } from '../../prisma-types.js';

/// Every error response — validation failures, thrown AppExceptions, rate
/// limiting, unexpected crashes — comes out through here in one consistent
/// shape: { statusCode, code, message }. Pairs with ResponseInterceptor,
/// which wraps success bodies as { success: true, data }; an error body
/// simply has no `success` key, distinguished by non-2xx status.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppException) {
      const status = exception.getStatus();
      this.send(response, status, exception.code, exception.message);
      return;
    }

    if (exception instanceof ThrottlerException) {
      this.send(
        response,
        HttpStatus.TOO_MANY_REQUESTS,
        'RATE_LIMITED',
        'Too many requests. Try again later.',
      );
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      // Module 18 — task #504. `ValidationPipe`'s `exceptionFactory`
      // (bootstrap.ts) throws a BadRequestException whose body is exactly
      // {code: 'VALIDATION_FAILED', message, details}; recognize and pass
      // that structured shape straight through instead of falling into the
      // generic HTTP_ERROR / flattened-string branch below. Any other
      // HttpException (including a plain BadRequestException thrown by a
      // built-in pipe that didn't go through our exceptionFactory, or a
      // hand-thrown one elsewhere) keeps the pre-existing behavior.
      if (
        typeof body === 'object' &&
        body !== null &&
        (body as { code?: unknown }).code === 'VALIDATION_FAILED' &&
        Array.isArray((body as { details?: unknown }).details)
      ) {
        const typed = body as { code: string; message: string; details: Array<{ field: string; message: string }> };
        this.send(response, status, typed.code, typed.message, typed.details);
        return;
      }
      const message =
        typeof body === 'string'
          ? body
          : Array.isArray((body as { message?: unknown }).message)
            ? (body as { message: string[] }).message.join('; ')
            : ((body as { message?: string }).message ?? exception.message);
      this.send(response, status, 'HTTP_ERROR', message);
      return;
    }

    // Module 18 — task #504. A safety net for Prisma errors that reach the
    // filter unmapped — most write paths already map the specific
    // constraint they can violate to a precise AppException at the call
    // site (see common/utils/prisma-error.util.ts and the P2002 handling in
    // register.use-case.ts), which stays the preferred, more specific path.
    // This branch only catches whatever slips through uncaught, so an
    // unanticipated unique-constraint or missing-record error surfaces as
    // the right HTTP status with a stable code instead of a generic 500 —
    // never by echoing Prisma's own message (which can name tables/columns)
    // back to the client; the raw error is still logged server-side.
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      this.logger.error(
        `Unmapped Prisma error ${exception.code}`,
        exception.stack,
      );
      const mapped = mapPrismaErrorCode(exception.code);
      this.send(response, mapped.status, mapped.code, mapped.message);
      return;
    }

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : exception,
    );
    this.send(
      response,
      HttpStatus.INTERNAL_SERVER_ERROR,
      'INTERNAL_ERROR',
      'Internal server error',
    );
  }

  private send(
    response: Response,
    statusCode: number,
    code: string,
    message: string,
    details?: Array<{ field: string; message: string }>,
  ): void {
    // Module 15 — task #354. `getRequestId()` reads the same
    // AsyncLocalStorage `requestIdMiddleware` populated for this request
    // (see request-context.ts) — undefined only for the rare failure that
    // happens before that middleware runs.
    const requestId = getRequestId();
    const body: ApiErrorResponse = {
      statusCode,
      code,
      message,
      ...(requestId ? { requestId } : {}),
      ...(details && details.length > 0 ? { details } : {}),
    };
    response.status(statusCode).json(body);
  }
}

/// Module 18 — task #504. Only the handful of Prisma error codes that map
/// cleanly to an unambiguous HTTP status/meaning; anything else (P2024 pool
/// timeout, P2028 transaction errors, etc.) falls to 500/INTERNAL_ERROR via
/// the default case, since guessing a 4xx status for those would be wrong
/// more often than not. See https://www.prisma.io/docs/orm/reference/error-reference.
function mapPrismaErrorCode(prismaCode: string): { status: number; code: string; message: string } {
  switch (prismaCode) {
    case 'P2002':
      return {
        status: HttpStatus.CONFLICT,
        code: 'RESOURCE_ALREADY_EXISTS',
        message: 'A resource with these unique field values already exists.',
      };
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        code: 'RESOURCE_NOT_FOUND',
        message: 'The requested resource was not found.',
      };
    case 'P2003':
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'INVALID_REFERENCE',
        message: 'One of the referenced ids does not exist.',
      };
    default:
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      };
  }
}
