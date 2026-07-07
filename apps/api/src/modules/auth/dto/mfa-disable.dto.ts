import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import type { MfaDisableRequestDto } from '@pentesthub/shared';

export class MfaDisableDto implements MfaDisableRequestDto {
  // Either a 6-digit TOTP code or a backup code — not length-restricted.
  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  code!: string;
}
