import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { VulnScanTemplateDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { CreateVulnScanTemplateDto } from '../dto/create-vuln-scan-template.dto.js';
import { CreateVulnScanTemplateCommand } from '../commands/create-vuln-scan-template.command.js';
import { DeleteVulnScanTemplateCommand } from '../commands/delete-vuln-scan-template.command.js';
import { ListVulnScanTemplatesQuery } from '../queries/list-vuln-scan-templates.query.js';
import { GetVulnScanTemplateQuery } from '../queries/get-vuln-scan-template.query.js';

/// "Scan Templates" (spec API section) — reusable {scanners, config}
/// presets referenced by CreateVulnScanJobCommand's templateId.
@ApiTags('vuln')
@ApiBearerAuth()
@Controller('vuln/templates')
export class VulnScanTemplatesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List scan templates' })
  list(@CurrentUser() user: RequestUser): Promise<VulnScanTemplateDto[]> {
    return this.queryBus.execute(new ListVulnScanTemplatesQuery(user.id));
  }

  @Post()
  @ApiOperation({ summary: 'Create a scan template' })
  create(
    @Body() dto: CreateVulnScanTemplateDto,
    @CurrentUser() user: RequestUser,
  ): Promise<VulnScanTemplateDto> {
    return this.commandBus.execute(
      new CreateVulnScanTemplateCommand(user.id, dto),
    );
  }

  @Get(':templateId')
  @ApiOperation({ summary: 'Get a scan template' })
  get(
    @Param('templateId') templateId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<VulnScanTemplateDto> {
    return this.queryBus.execute(
      new GetVulnScanTemplateQuery(user.id, templateId),
    );
  }

  @Delete(':templateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a scan template (built-in templates cannot be deleted)',
  })
  async remove(
    @Param('templateId') templateId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(
      new DeleteVulnScanTemplateCommand(user.id, templateId),
    );
  }
}
