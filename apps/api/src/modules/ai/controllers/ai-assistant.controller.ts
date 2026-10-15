import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AiAssistantService } from '../assistant/ai-assistant.service.js';
import { AiAssistantStreamDto } from '../dto/ai-assistant-stream.dto.js';

/// The floating "Secora AI" helper (bottom-right button on every dashboard
/// page). A stateless streaming endpoint: the browser posts its recent turns
/// and reads `data: {"type":"delta"|"done"|"error", ...}` frames. Errors that
/// happen before the first token (e.g. the free-tier daily limit) are thrown
/// normally so the client gets the usual JSON error body.
@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/assistant')
export class AiAssistantController {
  constructor(private readonly assistantService: AiAssistantService) {}

  @Post('stream')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Stream a reply from the floating Secora AI helper' })
  async stream(
    @Body() dto: AiAssistantStreamDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const abort = new AbortController();
    res.on('close', () => abort.abort());
    req.on('aborted', () => abort.abort());

    const iterator = this.assistantService
      .stream(user.id, dto.messages, abort.signal)
      [Symbol.asyncIterator]();

    // Pull the first chunk before sending headers: gate/provider errors then
    // surface as a normal HTTP error instead of a half-open event stream.
    const first = await iterator.next();

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      if (!first.done) send({ type: 'delta', content: first.value });
      let done = Boolean(first.done);
      while (!done) {
        const next = await iterator.next();
        if (next.done) {
          done = true;
        } else {
          send({ type: 'delta', content: next.value });
        }
      }
      send({ type: 'done' });
    } catch (error) {
      if (!abort.signal.aborted) {
        send({
          type: 'error',
          message:
            error instanceof Error ? error.message : 'AI request failed.',
        });
      }
    } finally {
      res.end();
    }
  }
}
