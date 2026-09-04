import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { AttachmentDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { UploadAttachmentCommand } from '../commands/upload-attachment.command.js';
import {
  ListEvidenceAttachmentsQuery,
  ListNoteAttachmentsQuery,
  ListProjectAttachmentsQuery,
  ListTargetAttachmentsQuery,
} from '../queries/list-parent-attachments.queries.js';

const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;

function requireFile(
  file: Express.Multer.File | undefined,
): Express.Multer.File {
  if (!file) throw new BadRequestException('No file uploaded.');
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new BadRequestException('File must be smaller than 25MB.');
  }
  return file;
}

/// Four thin, near-identical controllers — one per attachable parent —
/// each just resolving the parent id from its own route prefix and
/// delegating to the shared UploadAttachmentCommand/list queries. Kept in
/// one file since splitting them wouldn't add clarity, only file count.

@ApiTags('attachments')
@ApiBearerAuth()
@Controller('projects/:projectId/attachments')
export class ProjectAttachmentsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List a project’s attachments' })
  list(
    @Param('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<AttachmentDto[]> {
    return this.queryBus.execute(
      new ListProjectAttachmentsQuery(user.id, projectId),
    );
  }

  @Post()
  // Module 18 — task #512 (rate limiting audit). No dedicated limit on
  // any of these four upload routes before — relied on the global
  // 100/min/IP default despite each call reading up to 25MB into memory
  // and writing to storage. Same 15/min budget across all four
  // controllers in this file.
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  // Module 18 — task #513 (file/storage security audit). `requireFile()`
  // below rejected an oversized file only *after* Multer had already
  // buffered the entire upload into memory — the 25MB cap was a
  // correctness check, not a DoS guard. Passing `limits.fileSize` here
  // makes Busboy (Multer's underlying parser) abort the stream once it
  // exceeds the cap, before the rest of the body is ever read into
  // memory. The resulting `MulterError` isn't an `AppException`, so it
  // surfaces through the global exception filter's generic-error branch
  // (Phase 2) rather than a clean `400` with this file's specific
  // message — an acceptable trade-off for closing the memory-exhaustion
  // vector; `requireFile()`'s own check remains as a defensive backstop.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Attach a file to a project' })
  upload(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<AttachmentDto> {
    const f = requireFile(file);
    return this.commandBus.execute(
      new UploadAttachmentCommand(
        user.id,
        'PROJECT',
        projectId,
        f.originalname,
        f.mimetype,
        f.buffer,
      ),
    );
  }
}

@ApiTags('attachments')
@ApiBearerAuth()
@Controller('targets/:targetId/attachments')
export class TargetAttachmentsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List a target’s attachments' })
  list(
    @Param('targetId') targetId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<AttachmentDto[]> {
    return this.queryBus.execute(
      new ListTargetAttachmentsQuery(user.id, targetId),
    );
  }

  @Post()
  // Module 18 — task #512. See ProjectAttachmentsController.upload's
  // comment above.
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  // Module 18 — task #513 (file/storage security audit). `requireFile()`
  // below rejected an oversized file only *after* Multer had already
  // buffered the entire upload into memory — the 25MB cap was a
  // correctness check, not a DoS guard. Passing `limits.fileSize` here
  // makes Busboy (Multer's underlying parser) abort the stream once it
  // exceeds the cap, before the rest of the body is ever read into
  // memory. The resulting `MulterError` isn't an `AppException`, so it
  // surfaces through the global exception filter's generic-error branch
  // (Phase 2) rather than a clean `400` with this file's specific
  // message — an acceptable trade-off for closing the memory-exhaustion
  // vector; `requireFile()`'s own check remains as a defensive backstop.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Attach a file to a target' })
  upload(
    @Param('targetId') targetId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<AttachmentDto> {
    const f = requireFile(file);
    return this.commandBus.execute(
      new UploadAttachmentCommand(
        user.id,
        'TARGET',
        targetId,
        f.originalname,
        f.mimetype,
        f.buffer,
      ),
    );
  }
}

@ApiTags('attachments')
@ApiBearerAuth()
@Controller('notes/:noteId/attachments')
export class NoteAttachmentsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List a note’s attachments' })
  list(
    @Param('noteId') noteId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<AttachmentDto[]> {
    return this.queryBus.execute(new ListNoteAttachmentsQuery(user.id, noteId));
  }

  @Post()
  // Module 18 — task #512. See ProjectAttachmentsController.upload's
  // comment above.
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  // Module 18 — task #513 (file/storage security audit). `requireFile()`
  // below rejected an oversized file only *after* Multer had already
  // buffered the entire upload into memory — the 25MB cap was a
  // correctness check, not a DoS guard. Passing `limits.fileSize` here
  // makes Busboy (Multer's underlying parser) abort the stream once it
  // exceeds the cap, before the rest of the body is ever read into
  // memory. The resulting `MulterError` isn't an `AppException`, so it
  // surfaces through the global exception filter's generic-error branch
  // (Phase 2) rather than a clean `400` with this file's specific
  // message — an acceptable trade-off for closing the memory-exhaustion
  // vector; `requireFile()`'s own check remains as a defensive backstop.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Attach a file to a note' })
  upload(
    @Param('noteId') noteId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<AttachmentDto> {
    const f = requireFile(file);
    return this.commandBus.execute(
      new UploadAttachmentCommand(
        user.id,
        'NOTE',
        noteId,
        f.originalname,
        f.mimetype,
        f.buffer,
      ),
    );
  }
}

@ApiTags('attachments')
@ApiBearerAuth()
@Controller('evidence/:evidenceId/attachments')
export class EvidenceAttachmentsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List an evidence item’s attachments' })
  list(
    @Param('evidenceId') evidenceId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<AttachmentDto[]> {
    return this.queryBus.execute(
      new ListEvidenceAttachmentsQuery(user.id, evidenceId),
    );
  }

  @Post()
  // Module 18 — task #512. See ProjectAttachmentsController.upload's
  // comment above.
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  // Module 18 — task #513 (file/storage security audit). `requireFile()`
  // below rejected an oversized file only *after* Multer had already
  // buffered the entire upload into memory — the 25MB cap was a
  // correctness check, not a DoS guard. Passing `limits.fileSize` here
  // makes Busboy (Multer's underlying parser) abort the stream once it
  // exceeds the cap, before the rest of the body is ever read into
  // memory. The resulting `MulterError` isn't an `AppException`, so it
  // surfaces through the global exception filter's generic-error branch
  // (Phase 2) rather than a clean `400` with this file's specific
  // message — an acceptable trade-off for closing the memory-exhaustion
  // vector; `requireFile()`'s own check remains as a defensive backstop.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Attach a file to an evidence item' })
  upload(
    @Param('evidenceId') evidenceId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<AttachmentDto> {
    const f = requireFile(file);
    return this.commandBus.execute(
      new UploadAttachmentCommand(
        user.id,
        'EVIDENCE',
        evidenceId,
        f.originalname,
        f.mimetype,
        f.buffer,
      ),
    );
  }
}
