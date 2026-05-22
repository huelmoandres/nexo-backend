import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ArrayMinSize, ValidateNested } from 'class-validator';
import { CreateJobPriceLineInput } from './create-job.dto';

export class CreateChangeOrderDto {
  @ApiProperty({ type: [CreateJobPriceLineInput] })
  @Type(() => CreateJobPriceLineInput)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  lines!: CreateJobPriceLineInput[];
}
