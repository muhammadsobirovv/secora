import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter.js';
import { AppException } from '../exceptions/app.exception.js';
import { Prisma } from '../../prisma-types.js';
import * as requestContext from '../../observability/request-context.js';

/// Module 18 — task #504 (Global error handling, Phase 2). `HttpExceptionFilter`
/// is the single place every error response in the API is shaped — it had
/// zero direct test coverage before this task despite being the mechanism
/// Phase 2's entire "stable machine-readable code, no leaked internals,
/// every response carries a requestId" contract rests on. These tests build
/// a fake Express `Response` + `ArgumentsHost` (no live HTTP server needed —
/// `catch()` only touches `host.switchToHttp().getResponse()`) and assert on
/// exactly what gets sent to `response.status().json()`.

function buildHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status } as unknown as { status: typeof status };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({}),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('HttpExceptionFilter', () => {
  it('maps AppException to its own code/status and never renames the message', () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = buildHost();

    filter.catch(
      new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND),
      host,
    );

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found.' }),
    );
  });

  it('maps ThrottlerException to 429/RATE_LIMITED regardless of its own internal message', () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = buildHost();

    filter.catch(new ThrottlerException(), host);

    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429, code: 'RATE_LIMITED' }));
  });

  it('maps a plain (non-AppException) HttpException to HTTP_ERROR, joining array messages', () => {
    const filter = new HttpExceptionFilter();
    const { host, json } = buildHost();

    filter.catch(new BadRequestException(['field a is bad', 'field b is bad']), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, code: 'HTTP_ERROR', message: 'field a is bad; field b is bad' }),
    );
  });

  it(
    'recognizes the structured VALIDATION_FAILED shape thrown by the ValidationPipe exceptionFactory ' +
      '(bootstrap.ts) and passes its field-level `details` through untouched',
    () => {
      const filter = new HttpExceptionFilter();
      const { host, json } = buildHost();

      filter.catch(
        new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed.',
          details: [{ field: 'email', message: 'email must be an email' }],
        }),
        host,
      );

      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed.',
          details: [{ field: 'email', message: 'email must be an email' }],
        }),
      );
    },
  );

  it('maps an unmapped generic Error to 500/INTERNAL_ERROR and never leaks the stack/message into the body', () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = buildHost();

    filter.catch(new Error('/etc/passwd ENOENT at PrismaClient.findUnique (index.js:1234)'), host);

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toEqual(expect.objectContaining({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' }));
    expect(body).not.toHaveProperty('stack');
    expect(JSON.stringify(body)).not.toContain('/etc/passwd');
    expect(JSON.stringify(body)).not.toContain('PrismaClient');
  });

  describe('Prisma error safety net (task #504)', () => {
    it('maps an unmapped P2002 unique-constraint violation to 409/RESOURCE_ALREADY_EXISTS without echoing Prisma internals', () => {
      const filter = new HttpExceptionFilter();
      const { host, status, json } = buildHost();

      filter.catch(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`email`)', {
          code: 'P2002',
          clientVersion: '7.8.0',
          meta: { target: ['email'] },
        }),
        host,
      );

      expect(status).toHaveBeenCalledWith(409);
      const body = json.mock.calls[0][0] as Record<string, unknown>;
      expect(body).toEqual(expect.objectContaining({ statusCode: 409, code: 'RESOURCE_ALREADY_EXISTS' }));
      expect(JSON.stringify(body)).not.toContain('Unique constraint failed');
      expect(JSON.stringify(body)).not.toContain('email');
    });

    it('maps an unmapped P2025 record-not-found error to 404/RESOURCE_NOT_FOUND', () => {
      const filter = new HttpExceptionFilter();
      const { host, status, json } = buildHost();

      filter.catch(
        new Prisma.PrismaClientKnownRequestError('An operation failed because it depends on one or more records that were required but not found.', {
          code: 'P2025',
          clientVersion: '7.8.0',
        }),
        host,
      );

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404, code: 'RESOURCE_NOT_FOUND' }));
    });

    it('maps an unmapped P2003 foreign-key violation to 400/INVALID_REFERENCE', () => {
      const filter = new HttpExceptionFilter();
      const { host, status, json } = buildHost();

      filter.catch(
        new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
          code: 'P2003',
          clientVersion: '7.8.0',
        }),
        host,
      );

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: 'INVALID_REFERENCE' }));
    });

    it('falls back to 500/INTERNAL_ERROR for a Prisma error code with no safe generic mapping (e.g. P2024 pool timeout)', () => {
      const filter = new HttpExceptionFilter();
      const { host, status, json } = buildHost();

      filter.catch(
        new Prisma.PrismaClientKnownRequestError('Timed out fetching a new connection from the pool', {
          code: 'P2024',
          clientVersion: '7.8.0',
        }),
        host,
      );

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500, code: 'INTERNAL_ERROR' }));
    });
  });

  describe('requestId propagation (Module 15 task #354, re-verified under task #504)', () => {
    it('includes requestId in the body when request-context has one set', () => {
      jest.spyOn(requestContext, 'getRequestId').mockReturnValue('req-abc-123');
      const filter = new HttpExceptionFilter();
      const { host, json } = buildHost();

      filter.catch(new AppException('WORKSPACE_NOT_FOUND', 'Not found.', HttpStatus.NOT_FOUND), host);

      expect(json).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'req-abc-123' }));
      jest.restoreAllMocks();
    });

    it('omits requestId entirely (not requestId: undefined) when request-context has none set', () => {
      jest.spyOn(requestContext, 'getRequestId').mockReturnValue(undefined);
      const filter = new HttpExceptionFilter();
      const { host, json } = buildHost();

      filter.catch(new AppException('WORKSPACE_NOT_FOUND', 'Not found.', HttpStatus.NOT_FOUND), host);

      const body = json.mock.calls[0][0] as Record<string, unknown>;
      expect('requestId' in body).toBe(false);
      jest.restoreAllMocks();
    });
  });
});
