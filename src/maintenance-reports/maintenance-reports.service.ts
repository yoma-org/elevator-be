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

@Injectable()
export class MaintenanceReportsService {
  constructor(private readonly supabase: SupabaseService) {}

  private buildReportCode(): string {
    const bytes = randomBytes(REPORT_CODE_LENGTH);
    const randomPart = Array.from(bytes, (byte) =>
      REPORT_CODE_ALPHABET[byte % REPORT_CODE_ALPHABET.length],
    ).join('');
    return `${REPORT_CODE_PREFIX}-${randomPart}`;
  }

  private async generateUniqueReportCode(): Promise<string> {
    for (let attempt = 0; attempt < REPORT_CODE_MAX_ATTEMPTS; attempt += 1) {
      const reportCode = this.buildReportCode();
      const { data } = await this.supabase.client
        .from('maintenance_reports')
        .select('id')
        .eq('reportCode', reportCode)
        .limit(1);

      if (!data || data.length === 0) {
        return reportCode;
      }
    }
    throw new InternalServerErrorException('Could not generate a unique report code');
  }

  private normalizeChecklistResults(
    input: CreateMaintenanceReportDto['checklistResults'],
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
      equipmentType: input.equipmentType?.trim() || fallbackEquipmentType || null,
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
      .eq('id', payload.buildingId)
      .single();
    if (!building) throw new NotFoundException('Building not found');

    const { data: equipment } = await this.supabase.client
      .from('equipment')
      .select('*')
      .eq('id', payload.equipmentId)
      .single();
    if (!equipment || equipment.buildingId !== building.id) {
      throw new NotFoundException('Equipment not found for selected building');
    }

    const normalizedPhotos =
      payload.photos
        ?.filter((photo) => photo.dataUrl.startsWith('data:image/'))
        .map((photo) => ({
          name: photo.name,
          mimeType: photo.mimeType,
          size: Number(photo.size),
          dataUrl: photo.dataUrl,
        })) ?? [];

    const normalizedChecklistResults = this.normalizeChecklistResults(
      payload.checklistResults,
      equipment.equipmentType,
    );

    const reportCode = await this.generateUniqueReportCode();

    const { data: report, error: insertErr } = await this.supabase.client
      .from('maintenance_reports')
      .insert({
        building_id: building.id,
        equipment_id: equipment.id,
        reportCode,
        maintenanceType: payload.maintenanceType,
        arrivalDateTime: new Date(payload.arrivalDateTime).toISOString(),
        technicianName: payload.technicianName,
        status: INITIAL_REPORT_STATUS,
        priority: DEFAULT_REPORT_PRIORITY,
        assignedTo: payload.technicianName?.trim() || null,
        findings:
          payload.findings ??
          (normalizedChecklistResults
            ? `${normalizedChecklistResults.checkedCount}/${normalizedChecklistResults.totalCount} checklist items checked`
            : null),
        checklistResults: normalizedChecklistResults,
        workPerformed: payload.workPerformed ?? null,
        partsUsed:
          payload.partsUsed?.map((part) => ({
            name: part.name,
            quantity: Number(part.quantity),
          })) ?? null,
        remarks: payload.remarks ?? null,
        photos: normalizedPhotos.length > 0 ? normalizedPhotos : null,
        technicianSignature: payload.technicianSignature ?? null,
        customerSignature: payload.customerSignature ?? null,
        internalNotes: [
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
      .select('*, buildings(name), equipment(equipmentCode, equipmentType)')
      .order('createdAt', { ascending: false });

    if (from) query = query.gte('arrivalDateTime', new Date(from).toISOString());
    if (to) query = query.lte('arrivalDateTime', new Date(to + 'T23:59:59').toISOString());
    if (status === 'myQueue') {
      query = query.not('status', 'in', '("invoice-ready","closed","cancelled")');
    } else if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  async findByCode(reportCode: string) {
    const { data, error } = await this.supabase.client
      .from('maintenance_reports')
      .select('*, buildings(name), equipment(equipmentCode, equipmentType)')
      .eq('reportCode', reportCode)
      .single();

    if (error || !data) throw new NotFoundException(`Report ${reportCode} not found`);
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
      if (from) query = query.gte('arrivalDateTime', new Date(from).toISOString());
      if (to) query = query.lte('arrivalDateTime', new Date(to + 'T23:59:59').toISOString());
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
      .gte('arrivalDateTime', startOfMonth)
      .lt('arrivalDateTime', startOfNextMonth);
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

  async createCbsCall(payload: {
    buildingId: string;
    equipmentId: string;
    calledPerson: string;
    calledTime: string;
    issue: string;
  }) {
    const { data: building } = await this.supabase.client
      .from('buildings')
      .select('*')
      .eq('id', payload.buildingId)
      .single();
    if (!building) throw new NotFoundException('Building not found');

    const { data: equipment } = await this.supabase.client
      .from('equipment')
      .select('*')
      .eq('id', payload.equipmentId)
      .single();
    if (!equipment || equipment.buildingId !== building.id) {
      throw new NotFoundException('Equipment not found for selected building');
    }

    const reportCode = await this.generateUniqueReportCode();

    const { data: report, error: insertErr } = await this.supabase.client
      .from('maintenance_reports')
      .insert({
        building_id: building.id,
        equipment_id: equipment.id,
        reportCode,
        maintenanceType: 'CBS Call',
        arrivalDateTime: new Date(payload.calledTime).toISOString(),
        technicianName: 'Unassigned',
        status: 'received',
        priority: 'Medium',
        assignedTo: null,
        findings: payload.issue,
        internalNotes: [
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
    reportCode: string,
    body: { equipmentId?: string },
  ) {
    const existing = await this.findByCode(reportCode);
    const editable = ['pc-review', 'comm-review', 'pending', 'completed', 'commercial-review'];
    if (!editable.includes(existing.status)) {
      throw new Error('Work order is not in an editable status');
    }

    const updates: Record<string, unknown> = {};
    if (body.equipmentId) updates.equipment_id = body.equipmentId;

    const updatedNotes = [
      ...(existing.internalNotes ?? []),
      { id: randomUUID(), at: new Date().toISOString(), author: 'ADMIN', kind: 'system', text: 'Equipment updated by admin' },
    ];
    updates.internalNotes = updatedNotes;

    const { data: report, error } = await this.supabase.client
      .from('maintenance_reports')
      .update(updates)
      .eq('reportCode', reportCode)
      .select()
      .single();

    if (error) throw error;
    return report;
  }

  async addNote(
    reportCode: string,
    body: { text: string; author?: string; kind?: string },
  ) {
    const existing = await this.findByCode(reportCode);

    const updatedNotes = [
      ...(existing.internalNotes ?? []),
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
      .update({ internalNotes: updatedNotes })
      .eq('reportCode', reportCode)
      .select()
      .single();

    if (error) throw error;
    return report;
  }

  async updateStatus(reportCode: string, status: string, author?: string) {
    const existing = await this.findByCode(reportCode);

    const updatedNotes = [
      ...(existing.internalNotes ?? []),
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
      .update({ status, internalNotes: updatedNotes })
      .eq('reportCode', reportCode)
      .select()
      .single();

    if (error) throw error;
    return report;
  }
}
