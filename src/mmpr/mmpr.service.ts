import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';

@Injectable()
export class MmprService {
  constructor(private readonly supabase: SupabaseService) {}

  async findOrCreate(equipmentId: string, year: number) {
    const { data: existing } = await this.supabase.client
      .from('mmpr')
      .select('*')
      .eq('equipment_id', equipmentId)
      .eq('year', year)
      .limit(1)
      .single();

    if (existing) return existing;

    const { data: created, error } = await this.supabase.client
      .from('mmpr')
      .insert({ equipment_id: equipmentId, year, data: {} })
      .select()
      .single();

    if (error) throw error;
    return created;
  }

  /** Load child rows for an mmpr record */
  private async loadChildren(mmprId: string) {
    const [wi, wd, mr, cb] = await Promise.all([
      this.supabase.client.from('mmpr_work_instructions').select('*').eq('mmpr_id', mmprId).order('seq'),
      this.supabase.client.from('mmpr_work_details').select('*').eq('mmpr_id', mmprId).order('seq'),
      this.supabase.client.from('mmpr_major_repairs').select('*').eq('mmpr_id', mmprId).order('seq'),
      this.supabase.client.from('mmpr_call_back_records').select('*').eq('mmpr_id', mmprId).order('seq'),
    ]);

    return {
      work_instructions: (wi.data ?? []).map((r: any) => ({ id: r.id, date: r.date, name: r.name, item: r.item, contents: r.contents })),
      work_details: (wd.data ?? []).map((r: any) => ({ id: r.id, date: r.date, name: r.name, item: r.item, contents: r.contents })),
      major_repairs: (mr.data ?? []).map((r: any) => ({ id: r.id, date: r.date, workDoneBy: r.work_done_by, checkedBy: r.checked_by, details: r.details, remarks: r.remarks })),
      call_back_records: (cb.data ?? []).map((r: any) => ({ id: r.id, date: r.date, pic: r.pic, checkedBy: r.checked_by, received: r.received, arrived: r.arrived, completion: r.completion, troubleFound: r.trouble_found, actionTaken: r.action_taken })),
    };
  }

  /** Replace all child rows for a given table */
  private async replaceChildren(
    table: string,
    mmprId: string,
    rows: any[],
    mapFn: (row: any, seq: number) => Record<string, unknown>,
  ) {
    // Delete existing
    await this.supabase.client.from(table).delete().eq('mmpr_id', mmprId);

    if (rows.length === 0) return;

    const toInsert = rows.map((r, i) => ({ mmpr_id: mmprId, ...mapFn(r, i) }));
    const { error } = await this.supabase.client.from(table).insert(toInsert);
    if (error) throw error;
  }

  async update(
    equipmentId: string,
    year: number,
    fields: {
      work_instructions?: any[];
      work_details?: any[];
      major_repairs?: any[];
      call_back_records?: any[];
    },
  ) {
    const mmpr = await this.findOrCreate(equipmentId, year);
    const mmprId = mmpr.id as string;

    // Update timestamp
    await this.supabase.client.from('mmpr').update({ updated_at: new Date().toISOString() }).eq('id', mmprId);

    // Replace children for each provided section
    if (fields.work_instructions !== undefined) {
      await this.replaceChildren('mmpr_work_instructions', mmprId, fields.work_instructions, (r, i) => ({
        seq: i, date: r.date || null, name: r.name || null, item: r.item || null, contents: r.contents || null,
      }));
    }

    if (fields.work_details !== undefined) {
      await this.replaceChildren('mmpr_work_details', mmprId, fields.work_details, (r, i) => ({
        seq: i, date: r.date || null, name: r.name || null, item: r.item || null, contents: r.contents || null,
      }));
    }

    if (fields.major_repairs !== undefined) {
      await this.replaceChildren('mmpr_major_repairs', mmprId, fields.major_repairs, (r, i) => ({
        seq: i, date: r.date || null, work_done_by: r.workDoneBy || null, checked_by: r.checkedBy || null, details: r.details || null, remarks: r.remarks || null,
      }));
    }

    if (fields.call_back_records !== undefined) {
      await this.replaceChildren('mmpr_call_back_records', mmprId, fields.call_back_records, (r, i) => ({
        seq: i, date: r.date || null, pic: r.pic || null, checked_by: r.checkedBy || null,
        received: r.received || null, arrived: r.arrived || null, completion: r.completion || null,
        trouble_found: r.troubleFound || null, action_taken: r.actionTaken || null,
      }));
    }

    // Return updated data
    const children = await this.loadChildren(mmprId);
    return { ...mmpr, ...children };
  }

  /**
   * Get full MMPR data for PDF generation:
   * combines mmpr record + child tables + aggregated maintenance_reports for the equipment+year.
   */
  async getFullMmprData(equipmentId: string, year: number) {
    const mmpr = await this.findOrCreate(equipmentId, year);
    const mmprId = mmpr.id as string;

    const [children, reportsResult] = await Promise.all([
      this.loadChildren(mmprId),
      this.supabase.client
        .from('maintenance_reports')
        .select('report_code, arrival_date_time, technician_name, findings, work_performed, parts_used, checklist_results, remarks, status')
        .eq('equipment_id', equipmentId)
        .gte('arrival_date_time', `${year}-01-01T00:00:00`)
        .lt('arrival_date_time', `${year + 1}-01-01T00:00:00`)
        .order('arrival_date_time', { ascending: true }),
    ]);

    return {
      mmpr: {
        id: mmpr.id,
        equipment_id: mmpr.equipment_id,
        year: mmpr.year,
        ...children,
      },
      reports: reportsResult.data ?? [],
    };
  }
}
