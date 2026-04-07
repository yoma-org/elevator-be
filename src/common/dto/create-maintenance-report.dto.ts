import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class PartsUsedDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity: number;
}

class ReportPhotoDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^image\//, { message: 'Only image files are allowed' })
  mimeType: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5 * 1024 * 1024)
  size: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, {
    message: 'Photo must be a valid image data URL',
  })
  dataUrl: string;
}

class ChecklistResultItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @Type(() => Boolean)
  @IsBoolean()
  checked: boolean;
}

class ChecklistResultCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  category: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChecklistResultItemDto)
  items: ChecklistResultItemDto[];
}

class ChecklistResultsDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  equipmentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  templateName?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  checkedCount: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalCount: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChecklistResultCategoryDto)
  categories: ChecklistResultCategoryDto[];
}

export class CreateMaintenanceReportDto {
  @IsUUID()
  buildingId: string;

  @IsUUID()
  equipmentId: string;

  @IsString()
  @IsNotEmpty()
  maintenanceType: string;

  @IsDateString()
  arrivalDateTime: string;

  @IsString()
  @IsNotEmpty()
  technicianName: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChecklistResultsDto)
  checklistResults?: ChecklistResultsDto;

  @IsOptional()
  @IsString()
  findings?: string;

  @IsOptional()
  @IsString()
  workPerformed?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartsUsedDto)
  partsUsed?: PartsUsedDto[];

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ReportPhotoDto)
  photos?: ReportPhotoDto[];

  @IsOptional()
  @IsString()
  @Matches(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, {
    message: 'Technician signature must be a valid image data URL',
  })
  technicianSignature?: string;

  @IsOptional()
  @IsString()
  @Matches(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, {
    message: 'Customer signature must be a valid image data URL',
  })
  customerSignature?: string;
}
