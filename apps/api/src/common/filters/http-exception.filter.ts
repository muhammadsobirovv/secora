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
      const message =
        typeof body === 'string'
          ? body
          : Array.isArray((body as { message?: unknown }).message)
            ? (body as { message: string[] }).message.join('; ')
            : ((body as { message?: string }).message ?? exception.message);
      this.send(response, status, 'HTTP_ERROR', message);
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
  ): void {
    // Module 15 — task #354. `getRequestId()` reads the same
    // AsyncLocalStorage `requestIdMiddleware` populated for this request
    // (see request-context.ts) — undefined only for the rare failure that
    // happens before that middleware runs.
    const requestId = getRequestId();
    const body: ApiErrorResponse = { statusCode, code, message, ...(requestId ? { requestId } : {}) };
    response.status(statusCode).json(body);
  }
}
