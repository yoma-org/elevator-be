import { ArrayMinSize, IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  buildingName: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  team?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  address?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  equipmentTypeName: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  equipmentTypeCode?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  equipmentCodes: string[];
}
