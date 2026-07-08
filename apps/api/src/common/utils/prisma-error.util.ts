import { HttpStatus } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception.js';
import { Prisma } from '../../prisma-types.js';

/// Wraps a write that references a caller-supplied optional foreign key
/// (e.g. Note.targetId) so an unknown id surfaces as a clean 400 instead
/// of a raw 500 — see docs/adr/0002-workspace-foundation-module.md,
/// Decision 6 ("no cross-module repository import just to validate a
/// reference; let the real FK be the validator").
export async function runOrMapInvalidReference<T>(
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      throw new AppException(
        'INVALID_REFERENCE',
        'One of the referenced ids does not exist.',
        HttpStatus.BAD_REQUEST,
      );
    }
    throw error;
  }
}
