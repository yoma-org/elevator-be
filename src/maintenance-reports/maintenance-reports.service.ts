import { randomBytes, randomUUID } from 'crypto';
import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { CreateMaintenanceReportDto } from '../common/dto/create-maintenance-report.dto';
import { SupabaseService } from '../common/supabase.service';

const REPORT_CODE_PREFIX = 'MSR';
const REPORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REPORT_CODE_LENGTH = 8;
const REPORT_CODE_MAX_ATTEMPTS = 10;
const INITIAL_REPORT_STATUS = 'pc-review';
const DEFAULT_REPORT_PRIORITY = 'Medium';

const PHOTO_BUCKET = 'report-photos';

@Injectable()
export class MaintenanceReportsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Upload a single photo to Supabase Storage and return its public URL.
   * Accepts a base64 data URL and converts it to binary before upload.
   */
  private async uploadPhoto(
    reportCode: string,
    photo: { name: string; mimeType: string; dataUrl: string },
  ): Promise<string> {
    const base64Data = photo.dataUrl.replace(/^data:image\/[\w+.-]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const safeName = photo.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${reportCode}/${Date.now()}-${safeName}`;

    const { error } = await this.supabase.client
      .storage
      .from(PHOTO_BUCKET)
      .upload(filePath, buffer, {
        contentType: photo.mimeType,
        upsert: false,
      });

    if (error) throw new InternalServerErrorException(`Photo upload failed: ${error.message}`);

    const { data: urlData } = this.supabase.client
      .storage
      .from(PHOTO_BUCKET)
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  }

  /**
   * Upload all photos for a report. Skips invalid entries.
   */
  private async uploadPhotos(
    reportCode: string,
    photos: Array<{ name: string; mimeType: string; size: number; dataUrl: string }>,
  ): Promise<Array<{ name: string; mimeType: string; size: number; url: string }>> {
    const uploaded = await Promise.all(
      photos
        .filter((p) => p.dataUrl?.startsWith('data:image/'))
        .map(async (p) => ({
          name: p.name,
          mimeType: p.mimeType,
          size: Number(p.size),
          url: await this.uploadPhoto(reportCode, p),
        })),
    );
    return uploaded;
  }

  /**
   * Upload a signature (base64 PNG) to Storage and return its public URL.
   * Returns null if input is empty or not a valid data URL.
   */
  private async uploadSignature(
    reportCode: string,
    kind: 'technician' | 'customer',
    dataUrl: string | null | undefined,
  ): Promise<string | null> {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return null;
    return this.uploadPhoto(reportCode, {
      name: `${kind}-signature.png`,
      mimeType: 'image/png',
      dataUrl,
    });
  }

  private buildReportCode(): string {
    const bytes = randomBytes(REPORT_CODE_LENGTH);
    const randomPart = Array.from(bytes, (byte) =>
      REPORT_CODE_ALPHABET[byte % REPORT_CODE_ALPHABET.length],
    ).join('');
    return `${REPORT_CODE_PREFIX}-${randomPart}`;
  }

  private async generateUniqueReportCode(): Promise<string> {
    for (let attempt = 0; attempt < REPORT_CODE_MAX_ATTEMPTS; attempt += 1) {
      const report_code = this.buildReportCode();
      const { data } = await this.supabase.client
        .from('maintenance_reports')
        .select('id')
        .eq('report_code', report_code)
        .limit(1);

      if (!data || data.length === 0) {
        return report_code;
      }
    }
    throw new InternalServerErrorException('Could not generate a unique report code');
  }

  private normalizeChecklistResults(
    input: CreateMaintenanceReportDto['checklist_results'],
    fallbackEquipmentType?: string | null,
  ) {
    if (!input) return null;

    const categories = input.categories
      .map((group) => ({
        category: group.category.trim(),
        items: group.items
          .map((item) => ({
            label: item.label.trim(),
            status: item.status?.trim() || '',
            checked: Boolean(item.checked),
          }))
          .filter((item) => item.label.length > 0),
      }))
      .filter((group) => group.category.length > 0 && group.items.length > 0);

    if (categories.length === 0) return null;

    const totalCount = categories.reduce((sum, g) => sum + g.items.length, 0);
    const checkedCount = categories.reduce((sum, g) => sum + g.items.filter((i) => i.checked).length, 0);

    return {
      equipment_type: input.equipment_type?.trim() || fallbackEquipmentType || null,
      templateName: input.templateName?.trim() || null,
      checkedCount,
      totalCount,
      categories,
    };
  }

  async create(payload: CreateMaintenanceReportDto) {
    const { data: building } = await this.supabase.client
      .from('buildings')
      .select('*')
      .eq('id', payload.building_id)
      .single();
    if (!building) throw new NotFoundException('Building not found');

    const { data: equipment } = await this.supabase.client
      .from('equipment')
      .select('*')
      .eq('id', payload.equipmentId)
      .single();
    if (!equipment || equipment.building_id !== building.id) {
      throw new NotFoundException('Equipment not found for selected building');
    }

    const normalizedChecklistResults = this.normalizeChecklistResults(
      payload.checklist_results,
      equipment.name,
    );

    const report_code = await this.generateUniqueReportCode();

    // Upload photos + signatures to Supabase Storage and store URLs (not base64)
    const normalizedPhotos = await this.uploadPhotos(report_code, payload.photos ?? []);
    const technicianSignatureUrl = await this.uploadSignature(report_code, 'technician', payload.technician_signature);
    const customerSignatureUrl = await this.uploadSignature(report_code, 'customer', payload.customer_signature);

    const { data: report, error: insertErr } = await this.supabase.client
      .from('maintenance_reports')
      .insert({
        building_id: building.id,
        equipment_id: equipment.id,
        report_code,
        maintenance_type: payload.maintenance_type,
        arrival_date_time: new Date(payload.arrival_date_time).toISOString(),
        technician_name: payload.technician_name,
        status: INITIAL_REPORT_STATUS,
        priority: DEFAULT_REPORT_PRIORITY,
        assigned_to: payload.technician_name?.trim() || null,
        findings:
          payload.findings ??
          (normalizedChecklistResults
            ? `${normalizedChecklistResults.checkedCount}/${normalizedChecklistResults.totalCount} checklist items checked`
            : null),
        checklist_results: normalizedChecklistResults,
        work_performed: payload.work_performed ?? null,
        parts_used:
          payload.parts_used?.map((part) => ({
            name: part.name,
            quantity: Number(part.quantity),
            status: part.status ?? 'replaced',
          })) ?? null,
        remarks: payload.remarks ?? null,
        photos: normalizedPhotos.length > 0 ? normalizedPhotos : null,
        technician_signature: technicianSignatureUrl,
        customer_signature: customerSignatureUrl,
        internal_notes: [
          {
            id: randomUUID(),
            at: new Date().toISOString(),
            author: 'SYSTEM',
            kind: 'system',
            text: 'Report submitted from the public maintenance form. Initial status set to pc-review.',
          },
        ],
      })
      .select()
      .single();

    if (insertErr) throw insertErr;
    return report;
  }

  async findAll(from?: string, to?: string, status?: string) {
    let query = this.supabase.client
      .from('maintenance_reports')
      .select('*, buildings(name), equipment(equipment_code:code, equipment_type:name)')
      .order('created_at', { ascending: false });

    if (from) query = query.gte('arrival_date_time', new Date(from).toISOString());
    if (to) query = query.lte('arrival_date_time', new Date(to + 'T23:59:59').toISOString());
    if (status === 'myQueue') {
      query = query.not('status', 'in', '("invoice-ready","closed","cancelled")');
    } else if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  async findByCode(report_code: string) {
    const { data, error } = await this.supabase.client
      .from('maintenance_reports')
      .select('*, buildings(name), equipment(equipment_code:code, equipment_type:name)')
      .eq('report_code', report_code)
      .single();

    if (error || !data) throw new NotFoundException(`Report ${report_code} not found`);
    return data;
  }

  async getStats(from?: string, to?: string, status?: string) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const startOfMonth = new Date(Date.UTC(year, month, 1)).toISOString();
    const startOfNextMonth = new Date(Date.UTC(year, month + 1, 1)).toISOString();

    // Helper to apply shared date/status filters
    const applyFilters = (query: any) => {
      if (from) query = query.gte('arrival_date_time', new Date(from).toISOString());
      if (to) query = query.lte('arrival_date_time', new Date(to + 'T23:59:59').toISOString());
      return query;
    };

    let queueQuery = this.supabase.client
      .from('maintenance_reports')
      .select('id', { count: 'exact', head: true })
      .not('status', 'in', '("invoice-ready","closed","cancelled")');
    queueQuery = applyFilters(queueQuery);

    let monthQuery = this.supabase.client
      .from('maintenance_reports')
      .select('id', { count: 'exact', head: true })
      .gte('arrival_date_time', startOfMonth)
      .lt('arrival_date_time', startOfNextMonth);
    monthQuery = applyFilters(monthQuery);

    let activeQuery = this.supabase.client
      .from('maintenance_reports')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pc-review']);
    activeQuery = applyFilters(activeQuery);

    const [queueRes, monthRes, activeRes] = await Promise.all([
      queueQuery, monthQuery, activeQuery,
    ]);

    return {
      myQueue: queueRes.count ?? 0,
      projectsThisMonth: monthRes.count ?? 0,
      activeJobs: activeRes.count ?? 0,
      avgResponseTimeMin: 45,
      avgWorkDurationHrs: 2.3,
    };
  }

  async getManagementSchedule(params: {
    page?: number;
    pageSize?: number;
    sortField?: string;
    sortDir?: 'asc' | 'desc';
    search?: string;
    equipmentType?: string;
    status?: string;
  } = {}) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10));
    const sortField = params.sortField || 'date';
    const sortDir = params.sortDir === 'desc' ? 'desc' : 'asc';

    const { data, error } = await this.supabase.client
      .from('maintenance_reports')
      .select('id, arrival_date_time, maintenance_type, technician_name, status, equipment_id, equipment:equipment_id(equipment_type:name, equipment_code:code)')
      .order('arrival_date_time', { ascending: true });

    if (error) throw new InternalServerErrorException(error.message);

    // Group visits by equipment to compute frequency (needs full data, before pagination)
    const equipmentVisits: Record<string, Date[]> = {};
    for (const r of data ?? []) {
      if (!equipmentVisits[r.equipment_id]) equipmentVisits[r.equipment_id] = [];
      equipmentVisits[r.equipment_id].push(new Date(r.arrival_date_time));
    }

    const allRows = (data ?? []).map((r) => {
      const eq = r.equipment as any;
      const visits = equipmentVisits[r.equipment_id] ?? [];
      let frequency = 'N/A';

      if (visits.length <= 1) {
        frequency = '—';
      } else {
        const sorted = visits.map(d => d.getTime()).sort((a, b) => a - b);
        const spanMs = sorted[sorted.length - 1] - sorted[0];
        const intervals = visits.length - 1;
        const avgWeeks = Math.round(spanMs / (7 * 86400 * 1000) / intervals);
        const pluralize = (n: number, unit: string) => `${n} ${unit}${n > 1 ? 's' : ''}`;

        if (avgWeeks === 0) {
          const avgDays = Math.max(1, Math.round(spanMs / (86400 * 1000) / intervals));
          frequency = pluralize(avgDays, 'Day');
        } else if (avgWeeks < 4) {
          frequency = pluralize(avgWeeks, 'Week');
        } else {
          const avgMonths = Math.round(spanMs / (30 * 86400 * 1000) / intervals);
          if (avgMonths >= 12) {
            const avgYears = Math.round(spanMs / (365 * 86400 * 1000) / intervals);
            frequency = pluralize(avgYears, 'Year');
          } else {
            frequency = pluralize(avgMonths, 'Month');
          }
        }
      }

      const d = new Date(r.arrival_date_time);
      const day = String(d.getDate()).padStart(2, '0');
      const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
      const year = d.getFullYear();
      const dateStr = `${day} ${mon} ${year}`;

      return {
        date: dateStr,
        dateSort: d.getTime(),
        equipment_type: eq?.equipment_type ?? '',
        equipment_code: eq?.equipment_code ?? '',
        maintenance_type: r.maintenance_type,
        frequency,
        technician_name: r.technician_name,
        status: (r.status ?? '').toUpperCase(),
      };
    });

    // Deduplicate
    const seen = new Set<string>();
    let rows = allRows.filter((r) => {
      const key = `${r.date}|${r.equipment_type}|${r.equipment_code}|${r.maintenance_type}|${r.frequency}|${r.technician_name}|${r.status}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Server-side filter
    if (params.equipmentType) {
      rows = rows.filter((r) => r.equipment_type === params.equipmentType);
    }
    if (params.status) {
      rows = rows.filter((r) => r.status === params.status);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      rows = rows.filter((r) =>
        r.equipment_type.toLowerCase().includes(q) ||
        r.equipment_code.toLowerCase().includes(q) ||
        r.technician_name.toLowerCase().includes(q) ||
        r.maintenance_type.toLowerCase().includes(q),
      );
    }

    // Unique values for filter dropdowns (from full filtered-equivalent set)
    const allEquipmentTypes = [...new Set(allRows.map((r) => r.equipment_type))].filter(Boolean).sort();
    const allStatuses = [...new Set(allRows.map((r) => r.status))].filter(Boolean).sort();

    // Server-side sort
    const parseFreq = (f: string): number => {
      if (!f || f === '—') return Number.MAX_SAFE_INTEGER;
      const m = f.match(/^(\d+)\s*(Day|Week|Month|Year)s?/i);
      if (!m) return 0;
      const n = parseInt(m[1]);
      const unit = m[2].toLowerCase();
      if (unit === 'year') return n * 365;
      if (unit === 'month') return n * 30;
      if (unit === 'week') return n * 7;
      return n;
    };

    rows.sort((a: any, b: any) => {
      let cmp = 0;
      if (sortField === 'date') cmp = a.dateSort - b.dateSort;
      else if (sortField === 'frequency') cmp = parseFreq(a.frequency) - parseFreq(b.frequency);
      else cmp = String(a[sortField] ?? '').localeCompare(String(b[sortField] ?? ''));
      return sortDir === 'asc' ? cmp : -cmp;
    });

    // Paginate
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const paginated = rows.slice(start, start + pageSize).map(({ dateSort, ...rest }: any) => rest);

    return {
      data: paginated,
      total,
      page: safePage,
      pageSize,
      totalPages,
      filters: {
        equipmentTypes: allEquipmentTypes,
        statuses: allStatuses,
      },
    };
  }

  async createCbsCall(payload: {
    building_id: string;
    equipmentId: string;
    calledPerson: string;
    calledTime: string;
    issue: string;
  }) {
    const { data: building } = await this.supabase.client
      .from('buildings')
      .select('*')
      .eq('id', payload.building_id)
      .single();
    if (!building) throw new NotFoundException('Building not found');

    const { data: equipment } = await this.supabase.client
      .from('equipment')
      .select('*')
      .eq('id', payload.equipmentId)
      .single();
    if (!equipment || equipment.building_id !== building.id) {
      throw new NotFoundException('Equipment not found for selected building');
    }

    const report_code = await this.generateUniqueReportCode();

    const { data: report, error: insertErr } = await this.supabase.client
      .from('maintenance_reports')
      .insert({
        building_id: building.id,
        equipment_id: equipment.id,
        report_code,
        maintenance_type: 'CBS Call',
        arrival_date_time: new Date(payload.calledTime).toISOString(),
        technician_name: 'Unassigned',
        status: 'received',
        priority: 'Medium',
        assigned_to: null,
        findings: payload.issue,
        internal_notes: [
          {
            id: randomUUID(),
            at: new Date().toISOString(),
            author: 'SYSTEM',
            kind: 'system',
            text: `CBS call received from ${payload.calledPerson}. Status set to pending.`,
          },
        ],
      })
      .select()
      .single();

    if (insertErr) throw insertErr;
    return report;
  }

  async updateDetail(
    report_code: string,
    body: { equipmentId?: string },
  ) {
    const existing = await this.findByCode(report_code);
    const editable = ['pc-review', 'comm-review', 'pending', 'completed', 'commercial-review'];
    if (!editable.includes(existing.status)) {
      throw new Error('Work order is not in an editable status');
    }

    const updates: Record<string, unknown> = {};
    if (body.equipmentId) updates.equipment_id = body.equipmentId;

    const updatedNotes = [
      ...(existing.internal_notes ?? []),
      { id: randomUUID(), at: new Date().toISOString(), author: 'ADMIN', kind: 'system', text: 'Equipment updated by admin' },
    ];
    updates.internal_notes = updatedNotes;

    const { data: report, error } = await this.supabase.client
      .from('maintenance_reports')
      .update(updates)
      .eq('report_code', report_code)
      .select()
      .single();

    if (error) throw error;
    return report;
  }

  async addNote(
    report_code: string,
    body: { text: string; author?: string; kind?: string },
  ) {
    const existing = await this.findByCode(report_code);

    const updatedNotes = [
      ...(existing.internal_notes ?? []),
      {
        id: randomUUID(),
        at: new Date().toISOString(),
        author: body.author?.trim() || 'ADMIN',
        kind: body.kind?.trim() || 'dispatch',
        text: body.text.trim(),
      },
    ];

    const { data: report, error } = await this.supabase.client
      .from('maintenance_reports')
      .update({ internal_notes: updatedNotes })
      .eq('report_code', report_code)
      .select()
      .single();

    if (error) throw error;
    return report;
  }

  async updateStatus(report_code: string, status: string, author?: string) {
    const existing = await this.findByCode(report_code);

    const updatedNotes = [
      ...(existing.internal_notes ?? []),
      {
        id: randomUUID(),
        at: new Date().toISOString(),
        author: author ?? 'ADMIN',
        kind: 'system',
        text: `Status updated to ${status}`,
      },
    ];

    const { data: report, error } = await this.supabase.client
      .from('maintenance_reports')
      .update({ status, internal_notes: updatedNotes })
      .eq('report_code', report_code)
      .select()
      .single();

    if (error) throw error;
    return report;
  }
}
