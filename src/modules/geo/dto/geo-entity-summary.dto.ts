import { ApiProperty } from '@nestjs/swagger';

export class GeoEntitySummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;
}
