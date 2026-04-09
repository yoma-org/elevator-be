import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';

@Injectable()
export class MmprService {
  constructor(private readonly supabase: SupabaseService) {}

  async findOrCreate(equipmentId: string, year: number) {
    // Try to find existing record
    const { data: existing } = await this.supabase.client
      .from('mmpr_records')
      .select('*')
      .eq('equipment_id', equipmentId)
      .eq('year', year)
      .limit(1)
      .single();

    if (existing) return existing;

    // Create new record
    const { data: created, error } = await this.supabase.client
      .from('mmpr_records')
      .insert({ equipment_id: equipmentId, year })
      .select()
      .single();

    if (error) throw error;
    return created;
  }

  async findByEquipmentAndYear(equipmentId: string, year: number) {
    const { data, error } = await this.supabase.client
      .from('mmpr_records')
      .select('*')
      .eq('equipment_id', equipmentId)
      .eq('year', year)
      .limit(1)
      .single();

    if (error || !data) return null;
    return data;
  }

  async update(
    equipmentId: string,
    year: number,
    fields: {
      break_armature_gap?: unknown[];
      rope_investigation?: unknown[];
      work_instructions?: unknown[];
      work_details?: unknown[];
      major_repairs?: unknown[];
      call_back_records?: unknown[];
    },
  ) {
    // Ensure record exists
    await this.findOrCreate(equipmentId, year);

    const { data, error } = await this.supabase.client
      .from('mmpr_records')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('equipment_id', equipmentId)
      .eq('year', year)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get full MMPR data for PDF generation:
   * combines mmpr_records with aggregated maintenance_reports for the equipment+year.
   */
  async getFullMmprData(equipmentId: string, year: number) {
    const mmpr = await this.findByEquipmentAndYear(equipmentId, year);

    // Get all maintenance reports for this equipment in the given year
    const startOfYear = `${year}-01-01T00:00:00`;
    const endOfYear = `${year + 1}-01-01T00:00:00`;

    const { data: reports } = await this.supabase.client
      .from('maintenance_reports')
      .select('reportCode, arrivalDateTime, technicianName, findings, workPerformed, partsUsed, checklistResults, remarks, status')
      .eq('equipment_id', equipmentId)
      .gte('arrivalDateTime', startOfYear)
      .lt('arrivalDateTime', endOfYear)
      .order('arrivalDateTime', { ascending: true });

    return {
      mmpr: mmpr ?? {
        break_armature_gap: [],
        rope_investigation: [],
        work_instructions: [],
        work_details: [],
        major_repairs: [],
        call_back_records: [],
      },
      reports: reports ?? [],
    };
  }
}
