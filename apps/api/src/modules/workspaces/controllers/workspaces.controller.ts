import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type {
  WorkspaceDto,
  WorkspaceMemberDto,
  WorkspaceSettingsDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { UpdateWorkspaceDto } from '../dto/update-workspace.dto.js';
import { UpdateWorkspaceSettingsDto } from '../dto/update-workspace-settings.dto.js';
import { UpdateWorkspaceCommand } from '../commands/update-workspace.command.js';
import { UpdateWorkspaceSettingsCommand } from '../commands/update-workspace-settings.command.js';
import { UploadWorkspaceAvatarCommand } from '../commands/upload-workspace-avatar.command.js';
import { GetWorkspaceQuery } from '../queries/get-workspace.query.js';
import { ListWorkspaceMembersQuery } from '../queries/list-workspace-members.query.js';

const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

@ApiTags('workspace')
@ApiBearerAuth()
@Controller('workspace')
export class WorkspacesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get the current user's workspace" })
  get(@CurrentUser() user: RequestUser): Promise<WorkspaceDto> {
    return this.queryBus.execute(new GetWorkspaceQuery(user.id));
  }

  @Patch()
  @ApiOperation({ summary: 'Update workspace name/description' })
  update(
    @Body() dto: UpdateWorkspaceDto,
    @CurrentUser() user: RequestUser,
  ): Promise<WorkspaceDto> {
    return this.commandBus.execute(new UpdateWorkspaceCommand(user.id, dto));
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update workspace settings' })
  updateSettings(
    @Body() dto: UpdateWorkspaceSettingsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<WorkspaceSettingsDto> {
    return this.commandBus.execute(
      new UpdateWorkspaceSettingsCommand(user.id, dto),
    );
  }

  @Post('avatar')
  // Module 18 — task #513 (file/storage security audit). Same fix as the
  // Attachments controllers: enforce the size cap at Multer/Busboy level
  // so an oversized upload is aborted mid-stream instead of fully
  // buffered before the existing `file.size` check below runs.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_AVATAR_SIZE_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a workspace avatar image' })
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<WorkspaceDto> {
    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }
    if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Avatar must be a PNG, JPEG, or WebP image.',
      );
    }
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      throw new BadRequestException('Avatar must be smaller than 2MB.');
    }
    return this.commandBus.execute(
      new UploadWorkspaceAvatarCommand(user.id, file.buffer, file.mimetype),
    );
  }

  @Get('members')
  @ApiOperation({ summary: 'List workspace members' })
  listMembers(@CurrentUser() user: RequestUser): Promise<WorkspaceMemberDto[]> {
    return this.queryBus.execute(new ListWorkspaceMembersQuery(user.id));
  }
}
