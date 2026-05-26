import { ApiProperty } from '@nestjs/swagger';

export class GeoEntitySummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ required: false, nullable: true })
  latitude?: number | null;

  @ApiProperty({ required: false, nullable: true })
  longitude?: number | null;
}
