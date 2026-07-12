import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, ArrayUnique, IsIn } from 'class-validator';
import type { CreateReconJobRequestDto as CreateReconJobShape } from '@pentesthub/shared';
import type { ReconTool } from '../../../prisma-types.js';

const RECON_TOOLS: ReconTool[] = [
  'NMAP',
  'SUBFINDER',
  'HTTPX',
  'DNSX',
  'NAABU',
  'WHATWEB',
  'ASSETFINDER',
  'GOWITNESS',
  'AMASS',
  'KATANA',
  'GAU',
  'WAYBACKURLS',
  'WHOIS',
  'ASN',
];

export class CreateReconJobDto implements CreateReconJobShape {
  @ApiProperty({ enum: RECON_TOOLS, isArray: true })
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(RECON_TOOLS, { each: true })
  tools!: ReconTool[];
}
