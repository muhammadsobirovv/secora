import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { extractRequestContext } from '../../../common/utils/request-context.js';
import type {
  BugBountyProgramDetailDto,
  BugBountyProgramDto,
  BugBountyProgramScopeItemDto,
  BugBountyProgramTargetDto,
  DetectProgramUpdateResultDto,
  ImportProgramResultDto,
  ReimportProgramResultDto,
  ScopeClassificationResultDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
  CreateBugBountyProgramDto,
  ListBugBountyProgramsQueryParamsDto,
  UpdateBugBountyProgramDto,
} from '../dto/program.dto.js';
import {
  ClassifyScopeDto,
  CreateScopeItemDto,
  LinkProgramTargetDto,
  UpdateScopeItemDto,
} from '../dto/scope.dto.js';
import {
  DetectProgramUpdateDto,
  ImportProgramDto,
} from '../dto/import-program.dto.js';
import { CreateBugBountyProgramCommand } from '../commands/create-bugbounty-program.command.js';
import { UpdateBugBountyProgramCommand } from '../commands/update-bugbounty-program.command.js';
import { DeleteBugBountyProgramCommand } from '../commands/delete-bugbounty-program.command.js';
import { ImportBugBountyProgramCommand } from '../commands/import-bugbounty-program.command.js';
import { ReimportBugBountyProgramCommand } from '../commands/reimport-bugbounty-program.command.js';
import {
  AddScopeItemCommand,
  RemoveScopeItemCommand,
  UpdateScopeItemCommand,
} from '../commands/manage-scope-item.commands.js';
import {
  LinkProgramTargetCommand,
  UnlinkProgramTargetCommand,
} from '../commands/manage-program-target.commands.js';
import { ListBugBountyProgramsQuery } from '../queries/list-bugbounty-programs.query.js';
import { GetBugBountyProgramQuery } from '../queries/get-bugbounty-program.query.js';
import { ClassifyScopeValueQuery } from '../queries/classify-scope-value.query.js';
import { DetectProgramImportUpdateQuery } from '../queries/detect-program-import-update.query.js';

/// Programs + Scope Manager + Program-Target links + Program Import —
/// one controller since they all live under `/bugbounty/programs`
/// (mirrors VulnScanTemplatesController's flat-resource shape, just with
/// more nested sub-resources). `import` is declared before `:id` so it
/// isn't swallowed by the parameterized route.
@ApiTags('bugbounty')
@ApiBearerAuth()
@Controller('bugbounty/programs')
export class BugBountyProgramsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List bug bounty programs' })
  list(
    @Query() query: ListBugBountyProgramsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BugBountyProgramDto[]> {
    return this.queryBus.execute(
      new ListBugBountyProgramsQuery(user.id, query),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a bug bounty program' })
  create(
    @Body() dto: CreateBugBountyProgramDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BugBountyProgramDto> {
    return this.commandBus.execute(
      new CreateBugBountyProgramCommand(user.id, dto),
    );
  }

  @Post('import')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Import a program from HackerOne/Bugcrowd/Intigriti/Markdown/JSON',
  })
  import(
    @Body() dto: ImportProgramDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<ImportProgramResultDto> {
    return this.commandBus.execute(
      new ImportBugBountyProgramCommand(
        user.id,
        dto,
        extractRequestContext(req),
      ),
    );
  }

  @Post(':id/import/detect-update')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Preview what a reimport of the same source would change, without applying it',
  })
  detectUpdate(
    @Param('id') id: string,
    @Body() dto: DetectProgramUpdateDto,
    @CurrentUser() user: RequestUser,
  ): Promise<DetectProgramUpdateResultDto> {
    return this.queryBus.execute(
      new DetectProgramImportUpdateQuery(user.id, id, dto),
    );
  }

  @Post(':id/import/reimport')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Re-import a program from its source, applying any upstream changes and adding new scope items',
  })
  reimport(
    @Param('id') id: string,
    @Body() dto: DetectProgramUpdateDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ReimportProgramResultDto> {
    return this.commandBus.execute(
      new ReimportBugBountyProgramCommand(user.id, id, dto),
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a program (with scope items and linked target ids)',
  })
  get(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<BugBountyProgramDetailDto> {
    return this.queryBus.execute(new GetBugBountyProgramQuery(user.id, id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a program' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBugBountyProgramDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BugBountyProgramDto> {
    return this.commandBus.execute(
      new UpdateBugBountyProgramCommand(user.id, id, dto),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a program' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(
      new DeleteBugBountyProgramCommand(user.id, id),
    );
  }

  @Post(':id/scope')
  @ApiOperation({ summary: 'Add a scope item to a program' })
  addScopeItem(
    @Param('id') id: string,
    @Body() dto: CreateScopeItemDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BugBountyProgramScopeItemDto> {
    return this.commandBus.execute(new AddScopeItemCommand(user.id, id, dto));
  }

  @Post(':id/scope/classify')
  @ApiOperation({
    summary: 'Classify a value (or target) against a program’s scope rules',
  })
  classifyScope(
    @Param('id') id: string,
    @Body() dto: ClassifyScopeDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ScopeClassificationResultDto> {
    return this.queryBus.execute(new ClassifyScopeValueQuery(user.id, id, dto));
  }

  @Patch(':id/scope/:scopeItemId')
  @ApiOperation({ summary: 'Update a scope item’s classification/notes' })
  updateScopeItem(
    @Param('id') id: string,
    @Param('scopeItemId') scopeItemId: string,
    @Body() dto: UpdateScopeItemDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BugBountyProgramScopeItemDto> {
    return this.commandBus.execute(
      new UpdateScopeItemCommand(user.id, id, scopeItemId, dto),
    );
  }

  @Delete(':id/scope/:scopeItemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a scope item' })
  async removeScopeItem(
    @Param('id') id: string,
    @Param('scopeItemId') scopeItemId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(
      new RemoveScopeItemCommand(user.id, id, scopeItemId),
    );
  }

  @Post(':id/targets')
  @ApiOperation({ summary: 'Link a Target to a program' })
  linkTarget(
    @Param('id') id: string,
    @Body() dto: LinkProgramTargetDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BugBountyProgramTargetDto> {
    return this.commandBus.execute(
      new LinkProgramTargetCommand(user.id, id, dto.targetId),
    );
  }

  @Delete(':id/targets/:targetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unlink a Target from a program' })
  async unlinkTarget(
    @Param('id') id: string,
    @Param('targetId') targetId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(
      new UnlinkProgramTargetCommand(user.id, id, targetId),
    );
  }
}
