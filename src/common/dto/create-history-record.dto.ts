import { IsArray, IsDateString, IsNotEmpty, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class HistoryChecklistItem {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsArray()
  @IsString({ each: true })
  statuses: string[];   // ['good'], ['adjusted','repair'], ['na'], etc.
}

export class CreateHistoryRecordDto {
  @IsUUID()
  buildingId: string;

  @IsUUID()
  equipmentId: string;

  @IsDateString()
  completionDateTime: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HistoryChecklistItem)
  items: HistoryChecklistItem[];
}
