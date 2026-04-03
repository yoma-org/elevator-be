import { randomBytes, randomUUID } from 'crypto';
import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { CreateMaintenanceReportDto } from '../common/dto/create-maintenance-report.dto';
import { Building } from '../common/entities/building.entity';
import { Equipment } from '../common/entities/equipment.entity';
import { MaintenanceReport } from '../common/entities/maintenance-report.entity';

const REPORT_CODE_PREFIX = 'MSR';
const REPORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REPORT_CODE_LENGTH = 8;
const REPORT_CODE_MAX_ATTEMPTS = 10;
const INITIAL_REPORT_STATUS = 'submitted';
const DEFAULT_REPORT_PRIORITY = 'Medium';

@Injectable()
export class MaintenanceReportsService {
  constructor(
    @InjectRepository(MaintenanceReport)
    private readonly reportRepository: Repository<MaintenanceReport>,
    @InjectRepository(Building)
    private readonly buildingRepository: Repository<Building>,
    @InjectRepository(Equipment)
    private readonly equipmentRepository: Repository<Equipment>,
  ) {}

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
      const exists = await this.reportRepository.exists({ where: { reportCode } });

      if (!exists) {
        return reportCode;
      }
    }

    throw new InternalServerErrorException('Could not generate a unique report code');
  }

  private normalizeChecklistResults(
    input: CreateMaintenanceReportDto['checklistResults'],
    fallbackEquipmentType?: string | null,
  ) {
    if (!input) {
      return null;
    }

    const categories = input.categories
      .map((group) => ({
        category: group.category.trim(),
        items: group.items
          .map((item) => ({
            label: item.label.trim(),
            checked: Boolean(item.checked),
          }))
          .filter((item) => item.label.length > 0),
      }))
      .filter((group) => group.category.length > 0 && group.items.length > 0);

    if (categories.length === 0) {
      return null;
    }

    const totalCount = categories.reduce((sum, group) => sum + group.items.length, 0);
    const checkedCount = categories.reduce(
      (sum, group) => sum + group.items.filter((item) => item.checked).length,
      0,
    );

    return {
      equipmentType: input.equipmentType?.trim() || fallbackEquipmentType || null,
      templateName: input.templateName?.trim() || null,
      checkedCount,
      totalCount,
      categories,
    };
  }

  async create(payload: CreateMaintenanceReportDto): Promise<MaintenanceReport> {
    const building = await this.buildingRepository.findOne({
      where: { id: payload.buildingId },
    });
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    const equipment = await this.equipmentRepository.findOne({
      where: { id: payload.equipmentId },
      relations: ['building'],
    });

    if (!equipment || equipment.building.id !== building.id) {
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

    const report = this.reportRepository.create({
      building,
      equipment,
      reportCode: await this.generateUniqueReportCode(),
      maintenanceType: payload.maintenanceType,
      arrivalDateTime: new Date(payload.arrivalDateTime),
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
          text: 'Report submitted from the public maintenance form. Initial status set to pending.',
        },
      ],
    });

    return this.reportRepository.save(report);
  }

  async findAll(from?: string, to?: string, status?: string): Promise<MaintenanceReport[]> {
    const where: Record<string, unknown> = {};

    if (from || to) {
      const start = from ? new Date(from) : new Date('2000-01-01');
      const end = to ? new Date(to + 'T23:59:59') : new Date();
      where.arrivalDateTime = Between(start, end);
    }

    if (status && status !== 'all') {
      where.status = status;
    }

    return this.reportRepository.find({
      where,
      relations: ['building', 'equipment'],
      order: { arrivalDateTime: 'DESC' },
    });
  }

  async findByCode(reportCode: string): Promise<MaintenanceReport> {
    const report = await this.reportRepository.findOne({
      where: { reportCode },
      relations: ['building', 'equipment'],
    });

    if (!report) {
      throw new NotFoundException(`Report ${reportCode} not found`);
    }

    return report;
  }

  async getStats(): Promise<{
    myQueue: number;
    projectsThisMonth: number;
    activeJobs: number;
    avgResponseTimeMin: number;
    avgWorkDurationHrs: number;
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [myQueue, projectsThisMonth, activeJobs] = await Promise.all([
      this.reportRepository.count({ where: [{ status: 'submitted' }, { status: 'received' }, { status: 'pending' }] }),
      this.reportRepository.count({
        where: { arrivalDateTime: Between(startOfMonth, now) },
      }),
      this.reportRepository.count({ where: [{ status: 'active' }, { status: 'in-progress' }] }),
    ]);

    return {
      myQueue,
      projectsThisMonth,
      activeJobs,
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
  }): Promise<MaintenanceReport> {
    const building = await this.buildingRepository.findOne({ where: { id: payload.buildingId } });
    if (!building) throw new NotFoundException('Building not found');

    const equipment = await this.equipmentRepository.findOne({
      where: { id: payload.equipmentId },
      relations: ['building'],
    });
    if (!equipment || equipment.building.id !== building.id) {
      throw new NotFoundException('Equipment not found for selected building');
    }

    const report = this.reportRepository.create({
      building,
      equipment,
      reportCode: await this.generateUniqueReportCode(),
      maintenanceType: 'CBS Call',
      arrivalDateTime: new Date(payload.calledTime),
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
    });

    return this.reportRepository.save(report);
  }

  async updateStatus(reportCode: string, status: string): Promise<MaintenanceReport> {
    const report = await this.findByCode(reportCode);
    report.status = status;
    report.internalNotes = [
      ...(report.internalNotes ?? []),
      {
        id: randomUUID(),
        at: new Date().toISOString(),
        author: 'ADMIN',
        kind: 'system',
        text: `Status updated to ${status}`,
      },
    ];
    return this.reportRepository.save(report);
  }
}
