import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { AddPortfolioPhotoDto } from './add-portfolio-photo.dto';
import { PortfolioPhotoResponseDto } from './portfolio-photo-response.dto';

export class AddPortfolioPhotosBatchDto {
  @ApiProperty({
    type: [AddPortfolioPhotoDto],
    description: 'Metadatos de cada foto ya subida vía presigned PUT.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AddPortfolioPhotoDto)
  photos!: AddPortfolioPhotoDto[];
}

export class AddPortfolioPhotosBatchResponseDto {
  @ApiProperty({ type: [PortfolioPhotoResponseDto] })
  photos!: PortfolioPhotoResponseDto[];
}
