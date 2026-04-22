import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SuggestionsService } from './suggestions.service';

@ApiTags('suggestions')
@Controller('suggestions')
export class SuggestionsController {
  constructor(private readonly suggestionsService: SuggestionsService) {}

  @Get()
  async getSuggestions(
    @Query('field') field?: string,
    @Query('q') query?: string,
    @Query('equipment_type') equipment_type?: string,
    @Query('limit') limit?: string,
  ) {
    if (!field) {
      return { success: true, data: [] };
    }
    // Allow empty query for 'parts' (list all), require 2+ chars for text fields
    if (field !== 'parts' && (!query || query.trim().length < 2)) {
      return { success: true, data: [] };
    }

    const maxResults = Math.min(Math.max(Number(limit) || 5, 1), 500);

    const data = await this.suggestionsService.suggest(
      field,
      query?.trim() ?? '',
      equipment_type?.trim() || undefined,
      maxResults,
    );

    return { success: true, data };
  }
}
