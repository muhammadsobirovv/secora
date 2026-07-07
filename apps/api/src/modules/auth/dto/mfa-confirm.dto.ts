import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import type { MfaConfirmRequestDto } from '@pentesthub/shared';

export class MfaConfirmDto implements MfaConfirmRequestDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code!: string;
}
