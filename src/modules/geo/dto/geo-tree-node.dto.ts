import { ApiProperty } from '@nestjs/swagger';

export class GeoNeighborhoodNodeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;
}

export class GeoCityNodeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ type: [GeoNeighborhoodNodeDto] })
  neighborhoods!: GeoNeighborhoodNodeDto[];
}

export class GeoStateNodeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ type: [GeoCityNodeDto] })
  cities!: GeoCityNodeDto[];
}

export class GeoTreeNodeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ type: [GeoStateNodeDto] })
  states!: GeoStateNodeDto[];
}
