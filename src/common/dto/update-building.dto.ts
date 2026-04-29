import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateBuildingDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(50)
  team?: string | null;
}
