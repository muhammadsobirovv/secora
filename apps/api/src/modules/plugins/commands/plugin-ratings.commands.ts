import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type { PluginRatingDto, RatePluginRequestDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { toPluginRatingDto } from '../mappers/to-plugin-dto.mapper.js';

export class RatePluginCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly pluginId: string,
    public readonly data: RatePluginRequestDto,
  ) {}
}

@CommandHandler(RatePluginCommand)
export class RatePluginHandler implements ICommandHandler<RatePluginCommand, PluginRatingDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: RatePluginCommand): Promise<PluginRatingDto> {
    if (command.data.rating < 1 || command.data.rating > 5 || !Number.isInteger(command.data.rating)) {
      throw new AppException('PLUGIN_RATING_INVALID', 'Rating must be an integer from 1 to 5.', HttpStatus.BAD_REQUEST);
    }
    const plugin = await this.prisma.plugin.findUnique({ where: { id: command.pluginId } });
    if (!plugin) {
      throw new AppException('PLUGIN_NOT_FOUND', 'Plugin not found.', HttpStatus.NOT_FOUND);
    }

    const rating = await this.prisma.pluginRating.upsert({
      where: { pluginId_userId: { pluginId: command.pluginId, userId: command.userId } },
      create: { pluginId: command.pluginId, userId: command.userId, rating: command.data.rating, review: command.data.review },
      update: { rating: command.data.rating, review: command.data.review },
    });

    // Recompute the aggregate from the full rating set rather than an
    // incremental running-average update — ratings can change (a user
    // re-rates via the same upsert), so an incremental formula would drift;
    // recomputing is O(ratingCount) but ratingCount is realistically small
    // (marketplace plugin adoption, not a high-volume product review site).
    const all = await this.prisma.pluginRating.findMany({ where: { pluginId: command.pluginId }, select: { rating: true } });
    const average = all.reduce((sum, r) => sum + r.rating, 0) / all.length;
    await this.prisma.plugin.update({
      where: { id: command.pluginId },
      data: { ratingAverage: average, ratingCount: all.length },
    });

    return toPluginRatingDto(rating);
  }
}
