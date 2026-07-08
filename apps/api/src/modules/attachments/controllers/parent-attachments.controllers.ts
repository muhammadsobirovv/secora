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
  @UseInterceptors(FileInterceptor('file'))
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
  @UseInterceptors(FileInterceptor('file'))
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
  @UseInterceptors(FileInterceptor('file'))
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
  @UseInterceptors(FileInterceptor('file'))
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
