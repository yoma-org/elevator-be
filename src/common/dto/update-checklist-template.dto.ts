import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ChecklistItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  no?: string;

  @IsString()
  @MaxLength(300)
  label!: string;
}

export class ChecklistCategoryDto {
  @IsString()
  @MaxLength(160)
  category!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  items!: ChecklistItemDto[];
}

export class UpdateChecklistTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistCategoryDto)
  categories!: ChecklistCategoryDto[];
}
