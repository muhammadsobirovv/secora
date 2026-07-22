import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type {
  CalculateCvssRequestDto,
  CalculateCvssResultDto,
} from '@pentesthub/shared';
import { calculateCvss } from '../cvss/cvss-calculator.util.js';

/// Stateless — no workspace/program resolution needed, since scoring a
/// CVSS vector doesn't touch any stored entity. Kept as a CQRS query
/// (not a plain service method) purely for consistency with every other
/// bugbounty read path in this module; a controller could call
/// `calculateCvss()` directly with identical behavior.
export class CalculateCvssQuery implements IQuery {
  constructor(public readonly data: CalculateCvssRequestDto) {}
}

@QueryHandler(CalculateCvssQuery)
export class CalculateCvssHandler
  implements IQueryHandler<CalculateCvssQuery, CalculateCvssResultDto>
{
  execute(query: CalculateCvssQuery): Promise<CalculateCvssResultDto> {
    return Promise.resolve(calculateCvss(query.data.components));
  }
}
