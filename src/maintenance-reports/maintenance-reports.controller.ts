import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CreateMaintenanceReportDto } from '../common/dto/create-maintenance-report.dto';
import { MaintenanceReportsService } from './maintenance-reports.service';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { can, canView, NEXT_STATUS } from '../admin-auth/permissions';

@Controller('maintenance-reports')
export class MaintenanceReportsController {
  constructor(private readonly maintenanceReportsService: MaintenanceReportsService) {}

  @Post()
  async create(@Body() payload: CreateMaintenanceReportDto) {
    const report = await this.maintenanceReportsService.create(payload);

    return {
      success: true,
      message: 'Maintenance report submitted successfully',
      data: {
        reportCode: report.reportCode,
        status: report.status,
        photoCount: report.photos?.length ?? 0,
        hasTechnicianSignature: Boolean(report.technicianSignature),
        hasCustomerSignature: Boolean(report.customerSignature),
        submittedAt: report.submittedAt,
      },
    };
  }

  @Get('admin/stats')
  @UseGuards(AdminAuthGuard)
  async getStats(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    return this.maintenanceReportsService.getStats(from, to, status);
  }

  @Get('admin/list')
  @UseGuards(AdminAuthGuard)
  async findAll(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    const role: string = req.adminUser?.role ?? '';
    const reports = await this.maintenanceReportsService.findAll(from, to, status);

    // Filter reports: only return those the role can see
    return reports
      .filter((r: any) => canView(role, r.status))
      .map((r: any) => ({
        id: r.reportCode,
        building: r.buildings?.name ?? '',
        equipmentCode: r.equipment?.equipmentCode ?? '',
        equipmentType: r.equipment?.equipmentType ?? '',
        status: r.status,
        maintenanceType: r.maintenanceType,
        technicianName: r.technicianName,
        arrivalDateTime: r.arrivalDateTime,
        findings: r.findings,
        workPerformed: r.workPerformed,
        partsUsed: r.partsUsed,
        priority: r.priority,
        submittedAt: r.submittedAt,
        createdAt: r.createdAt,
      }));
  }

  @Get('admin/:reportCode')
  @UseGuards(AdminAuthGuard)
  async findOne(@Req() req: any, @Param('reportCode') reportCode: string) {
    const role: string = req.adminUser?.role ?? '';
    const r = await this.maintenanceReportsService.findByCode(reportCode);

    if (!canView(role, r.status)) {
      throw new ForbiddenException('You do not have permission to view this report');
    }

    return {
      id: r.reportCode,
      buildingId: r.building_id,
      building: r.buildings?.name ?? '',
      equipmentId: r.equipment_id,
      equipmentCode: r.equipment?.equipmentCode ?? '',
      equipmentType: r.equipment?.equipmentType ?? '',
      status: r.status,
      maintenanceType: r.maintenanceType,
      technicianName: r.technicianName,
      arrivalDateTime: r.arrivalDateTime,
      findings: r.findings,
      workPerformed: r.workPerformed,
      partsUsed: r.partsUsed,
      checklistResults: r.checklistResults,
      remarks: r.remarks,
      internalNotes: r.internalNotes,
      priority: r.priority,
      assignedTo: r.assignedTo,
      photos: r.photos ?? null,
      technicianSignature: r.technicianSignature ?? null,
      customerSignature: r.customerSignature ?? null,
      submittedAt: r.submittedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  @Post('admin/cbs-call')
  @UseGuards(AdminAuthGuard)
  async createCbsCall(
    @Req() req: any,
    @Body() body: { buildingId: string; equipmentId: string; calledPerson: string; calledTime: string; issue: string },
  ) {
    const role: string = req.adminUser?.role ?? '';
    // Only operation can create CBS calls (they have approve on 'received')
    if (!can(role, 'received', 'approve')) {
      throw new ForbiddenException('You do not have permission to create CBS calls');
    }

    const report = await this.maintenanceReportsService.createCbsCall(body);
    return { success: true, reportCode: report.reportCode, status: report.status };
  }

  @Patch('admin/:reportCode/status')
  @UseGuards(AdminAuthGuard)
  async updateStatus(
    @Req() req: any,
    @Param('reportCode') reportCode: string,
    @Body() body: { status: string },
  ) {
    const role: string = req.adminUser?.role ?? '';
    const existing = await this.maintenanceReportsService.findByCode(reportCode);

    // Only allow advancing to the next status if the role has 'approve'
    const nextStatus = NEXT_STATUS[existing.status];
    if (body.status === nextStatus) {
      if (!can(role, existing.status, 'approve')) {
        throw new ForbiddenException('You do not have permission to approve at this status');
      }
    } else {
      // For any other status change, require approve permission on current status
      if (!can(role, existing.status, 'approve')) {
        throw new ForbiddenException('You do not have permission to change status');
      }
    }

    const author = req.adminUser?.name ?? 'ADMIN';
    const report = await this.maintenanceReportsService.updateStatus(reportCode, body.status, author);
    return { success: true, reportCode: report.reportCode, status: report.status };
  }

  @Post('admin/:reportCode/notes')
  @UseGuards(AdminAuthGuard)
  async addNote(
    @Req() req: any,
    @Param('reportCode') reportCode: string,
    @Body() body: { text: string; author?: string; kind?: string },
  ) {
    const role: string = req.adminUser?.role ?? '';
    const existing = await this.maintenanceReportsService.findByCode(reportCode);

    if (!can(role, existing.status, 'comment') && !can(role, existing.status, 'review')) {
      throw new ForbiddenException('You do not have permission to comment on this report');
    }

    const author = body.author?.trim() || req.adminUser?.name || 'ADMIN';
    const report = await this.maintenanceReportsService.addNote(reportCode, {
      text: body.text,
      author,
      kind: body.kind,
    });
    return { success: true, reportCode: report.reportCode };
  }

  @Patch('admin/:reportCode')
  @UseGuards(AdminAuthGuard)
  async updateDetail(
    @Param('reportCode') reportCode: string,
    @Body() body: { equipmentId?: string },
  ) {
    const report = await this.maintenanceReportsService.updateDetail(reportCode, body);
    return { success: true, reportCode: report.reportCode };
  }
}
