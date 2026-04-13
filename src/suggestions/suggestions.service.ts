import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';

const FIELD_COLUMN_MAP: Record<string, string> = {
  findings: 'remarks',
  remarks: 'remarks',
  notes: 'remarks',
};

const MAX_RAW_ROWS = 100;

@Injectable()
export class SuggestionsService {
  constructor(private readonly supabase: SupabaseService) {}

  async suggest(
    field: string,
    query: string,
    equipment_type?: string,
    limit = 5,
  ): Promise<string[]> {
    if (field === 'parts') {
      return this.suggestParts(query, limit);
    }

    const column = FIELD_COLUMN_MAP[field];
    if (!column) return [];

    return this.suggestTextField(column, query, equipment_type, limit, field);
  }

  /**
   * Extract a specific section from the combined remarks string.
   * Remarks are stored as: "Issues: ... | Notes: ... | Customer message: ..."
   */
  private extractSection(remarks: string, field: string): string | null {
    const sectionMap: Record<string, string> = {
      remarks: 'Customer message',
      findings: 'Issues',
      notes: 'Notes',
    };
    const prefix = sectionMap[field];
    if (!prefix) return remarks;

    const segments = remarks.split('|').map((s) => s.trim());
    for (const segment of segments) {
      if (segment.toLowerCase().startsWith(prefix.toLowerCase() + ':')) {
        const value = segment.slice(prefix.length + 1).trim();
        return value || null;
      }
    }
    return null;
  }

  private async suggestTextField(
    column: string,
    query: string,
    equipment_type?: string,
    limit = 5,
    field?: string,
  ): Promise<string[]> {
    let dbQuery = this.supabase.client
      .from('maintenance_reports')
      .select(`${column}, equipment(equipment_type:name)`)
      .not(column, 'is', null)
      .ilike(column, `%${query}%`)
      .order('submitted_at', { ascending: false })
      .limit(MAX_RAW_ROWS);

    if (equipment_type) {
      dbQuery = dbQuery.eq('equipment.name', equipment_type);
    }

    const { data, error } = await dbQuery;
    if (error || !data) return [];

    const frequency = new Map<string, number>();
    for (const row of data) {
      const raw = (row[column] as string)?.trim();
      if (!raw) continue;

      // Extract just the relevant section from the combined remarks
      const value = field ? this.extractSection(raw, field) : raw;
      if (!value || !value.toLowerCase().includes(query.toLowerCase())) continue;

      frequency.set(value, (frequency.get(value) ?? 0) + 1);
    }

    return [...frequency.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([text]) => text);
  }

  private async suggestParts(query: string, limit = 5): Promise<string[]> {
    const { data, error } = await this.supabase.client
      .from('maintenance_reports')
      .select('parts_used')
      .not('parts_used', 'is', null)
      .order('submitted_at', { ascending: false })
      .limit(MAX_RAW_ROWS);

    if (error || !data) return [];

    const frequency = new Map<string, number>();
    const lowerQuery = query.toLowerCase();

    for (const row of data) {
      const parts = row.parts_used as Array<{ name: string }> | null;
      if (!parts) continue;
      for (const part of parts) {
        const name = part.name?.trim();
        if (!name || !name.toLowerCase().includes(lowerQuery)) continue;
        frequency.set(name, (frequency.get(name) ?? 0) + 1);
      }
    }

    return [...frequency.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([text]) => text);
  }
}
