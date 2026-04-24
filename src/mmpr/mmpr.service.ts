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
   * Yearly MMPR matrix — for each checklist item × month cell, compute the latest status symbol.
   * Symbols: v (good), o (adjusted), x (repair/replace), - (N/A), '' (no data)
   * Item list comes from the canonical checklist template of the equipment type.
   */
  async getYearlyMatrix(
    equipmentId: string,
    startYear: number,
    startMonth: number,
    endYear: number,
    endMonth: number,
  ) {
    const pad = (n: number) => String(n).padStart(2, '0');

    // 1. Equipment + building + type
    const { data: eq, error: eqErr } = await this.supabase.client
      .from('equipment')
      .select('id, code, name, equipment_type_id, buildings(name, team), equipment_types(id, category)')
      .eq('id', equipmentId)
      .single();
    if (eqErr || !eq) throw new NotFoundException('Equipment not found');

    const eqAny = eq as any;

    // 2. Checklist template for the equipment_type
    const { data: template } = await this.supabase.client
      .from('checklist_templates')
      .select('categories')
      .eq('equipment_type_id', eqAny.equipment_type_id)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    type TemplateItem = string | { label?: string; no?: string };
    type TemplateCategory = { category: string; items: TemplateItem[] };
    const templateCategories: TemplateCategory[] = (template?.categories ?? []) as TemplateCategory[];

    const getItemLabel = (item: TemplateItem): string =>
      typeof item === 'string' ? item : (item.label ?? '');

    // 3. Reports within the date range
    const rangeStart = `${startYear}-${pad(startMonth)}-01T00:00:00`;
    const exclusiveEndMonth = endMonth === 12 ? 1 : endMonth + 1;
    const exclusiveEndYear = endMonth === 12 ? endYear + 1 : endYear;
    const rangeEndExclusive = `${exclusiveEndYear}-${pad(exclusiveEndMonth)}-01T00:00:00`;

    const { data: reports } = await this.supabase.client
      .from('maintenance_reports')
      .select('arrival_date_time, checklist_results')
      .eq('equipment_id', equipmentId)
      .gte('arrival_date_time', rangeStart)
      .lt('arrival_date_time', rangeEndExclusive)
      .order('arrival_date_time', { ascending: true });

    // 4. Month axis from (startYear, startMonth) to (endYear, endMonth)
    const months: Array<{ year: number; month: number; key: string }> = [];
    let y = startYear, m = startMonth;
    while (y < endYear || (y === endYear && m <= endMonth)) {
      months.push({ year: y, month: m, key: `${y}-${pad(m)}` });
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }

    // 5. Status lookup — iterate reports ASC so latest writes overwrite earlier.
    //    Key: `${monthKey}|${itemLabelLower}` → symbol
    const statusSymbol = (raw: string | null | undefined, checked: boolean): string => {
      const s = (raw ?? '').toLowerCase();
      if (s.includes('good')) return 'v';
      if (s.includes('adjust')) return 'o';
      if (s.includes('repair') || s.includes('replace')) return 'x';
      if (s.includes('n/a') || s === 'na' || s.includes(' na')) return '-';
      return checked ? 'v' : '';
    };

    const lookup = new Map<string, string>();
    for (const r of (reports ?? []) as any[]) {
      const ad = r.arrival_date_time as string | null;
      if (!ad) continue;
      const [datePart] = ad.split('T');
      const [yr, mo] = datePart.split('-').map(Number);
      const monthKey = `${yr}-${pad(mo)}`;
      const cr = r.checklist_results as any;
      if (!cr || !Array.isArray(cr.categories)) continue;
      for (const cat of cr.categories) {
        for (const item of cat.items ?? []) {
          const label = (item.label ?? '').toString().trim().toLowerCase();
          if (!label) continue;
          const sym = statusSymbol(item.status, !!item.checked);
          if (!sym) continue;
          lookup.set(`${monthKey}|${label}`, sym);
        }
      }
    }

    // 6. Build result categories from template
    const categories = templateCategories.map((cat) => ({
      category: cat.category,
      items: (cat.items ?? []).map((rawItem) => {
        const label = getItemLabel(rawItem);
        const statuses: Record<string, string> = {};
        const key = label.trim().toLowerCase();
        for (const mm of months) {
          statuses[mm.key] = lookup.get(`${mm.key}|${key}`) ?? '';
        }
        return { label, statuses };
      }),
    }));

    // 7. Stats computed from reports (already sorted ASC)
    const reportArr = (reports ?? []) as Array<{ arrival_date_time: string | null }>;
    const arrivalDates = reportArr
      .map((r) => r.arrival_date_time)
      .filter((d): d is string => !!d);
    const stats = {
      totalVisits: reportArr.length,
      firstVisit: arrivalDates.length > 0 ? arrivalDates[0] : null,
      lastVisit: arrivalDates.length > 0 ? arrivalDates[arrivalDates.length - 1] : null,
    };

    return {
      equipment: {
        code: eqAny.code ?? '',
        type: eqAny.name ?? '',
        building_name: eqAny.buildings?.name ?? '',
        team: eqAny.buildings?.team ?? null,
        category: eqAny.equipment_types?.category ?? null,
      },
      range: { startYear, startMonth, endYear, endMonth },
      months: months.map(({ year, month }) => ({ year, month })),
      legend: { v: 'Good', o: 'Adjusted', x: 'Repair or Replace', '-': 'N/A' },
      categories,
      stats,
    };
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
