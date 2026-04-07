import { Controller, Get, Query } from '@nestjs/common';
import { SuggestionsService } from './suggestions.service';

@Controller('suggestions')
export class SuggestionsController {
  constructor(private readonly suggestionsService: SuggestionsService) {}

  @Get()
  async getSuggestions(
    @Query('field') field?: string,
    @Query('q') query?: string,
    @Query('equipmentType') equipmentType?: string,
    @Query('limit') limit?: string,
  ) {
    if (!field || !query || query.trim().length < 2) {
      return { success: true, data: [] };
    }

    const maxResults = Math.min(Math.max(Number(limit) || 5, 1), 10);

    const data = await this.suggestionsService.suggest(
      field,
      query.trim(),
      equipmentType?.trim() || undefined,
      maxResults,
    );

    return { success: true, data };
  }
}
