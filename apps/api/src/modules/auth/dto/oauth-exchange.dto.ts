import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class OAuthExchangeDto {
  @ApiProperty()
  @IsString()
  code!: string;
}
