import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import {
  PresignPortfolioPhotoDto,
  PresignPortfolioPhotoResponseDto,
} from './presign-portfolio-photo.dto';

export class PresignPortfolioPhotosBatchDto {
  @ApiProperty({
    type: [PresignPortfolioPhotoDto],
    description: 'Una entrada por foto a subir (extensión por archivo).',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PresignPortfolioPhotoDto)
  photos!: PresignPortfolioPhotoDto[];
}

export class PresignPortfolioPhotosBatchResponseDto {
  @ApiProperty({ type: [PresignPortfolioPhotoResponseDto] })
  photos!: PresignPortfolioPhotoResponseDto[];
}
