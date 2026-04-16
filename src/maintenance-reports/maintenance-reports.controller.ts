import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateMaintenanceReportDto } from '../common/dto/create-maintenance-report.dto';
import { MaintenanceReportsService } from './maintenance-reports.service';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { can, canView, NEXT_STATUS } from '../admin-auth/permissions';

@ApiTags('maintenance-reports')
@ApiBearerAuth('admin-jwt')
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
        report_code: report.report_code,
        status: report.status,
        photoCount: report.photos?.length ?? 0,
        hasTechnicianSignature: Boolean(report.technician_signature),
        hasCustomerSignature: Boolean(report.customer_signature),
        submitted_at: report.submitted_at,
      },
    };
  }

  @Get('admin/management-schedule')
  @UseGuards(AdminAuthGuard)
  async getManagementSchedule(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortField') sortField?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('search') search?: string,
    @Query('equipmentType') equipmentType?: string,
    @Query('status') status?: string,
  ) {
    return this.maintenanceReportsService.getManagementSchedule({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      sortField,
      sortDir,
      search,
      equipmentType,
      status,
    });
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
        id: r.report_code,
        building: r.buildings?.name ?? '',
        building_team: r.buildings?.team ?? null,
        equipment_code: r.equipment?.equipment_code ?? '',
        equipment_type: r.equipment?.equipment_type ?? '',
        status: r.status,
        maintenance_type: r.maintenance_type,
        technician_name: r.technician_name,
        arrival_date_time: r.arrival_date_time,
        findings: r.findings,
        work_performed: r.work_performed,
        parts_used: r.parts_used,
        priority: r.priority,
        submitted_at: r.submitted_at,
        created_at: r.created_at,
      }));
  }

  @Get('admin/:report_code')
  @UseGuards(AdminAuthGuard)
  async findOne(@Req() req: any, @Param('report_code') report_code: string) {
    const role: string = req.adminUser?.role ?? '';
    const r = await this.maintenanceReportsService.findByCode(report_code);

    if (!canView(role, r.status)) {
      throw new ForbiddenException('You do not have permission to view this report');
    }

    return {
      id: r.report_code,
      building_id: r.building_id,
      building: r.buildings?.name ?? '',
      building_team: r.buildings?.team ?? null,
      equipmentId: r.equipment_id,
      equipment_code: r.equipment?.equipment_code ?? '',
      equipment_type: r.equipment?.equipment_type ?? '',
      status: r.status,
      maintenance_type: r.maintenance_type,
      technician_name: r.technician_name,
      arrival_date_time: r.arrival_date_time,
      findings: r.findings,
      work_performed: r.work_performed,
      parts_used: r.parts_used,
      checklist_results: r.checklist_results,
      remarks: r.remarks,
      internal_notes: r.internal_notes,
      priority: r.priority,
      assigned_to: r.assigned_to,
      completion_date_time: r.completion_date_time ?? null,
      customer_name: r.customer_name ?? null,
      customer_title: r.customer_title ?? null,
      photos: r.photos ?? null,
      technician_signature: r.technician_signature ?? null,
      customer_signature: r.customer_signature ?? null,
      submitted_at: r.submitted_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  }

  @Post('admin/cbs-call')
  @UseGuards(AdminAuthGuard)
  async createCbsCall(
    @Req() req: any,
    @Body() body: { building_id: string; equipmentId: string; calledPerson: string; calledTime: string; issue: string },
  ) {
    const role: string = req.adminUser?.role ?? '';
    // Only operation can create CBS calls (they have approve on 'received')
    if (!can(role, 'received', 'approve')) {
      throw new ForbiddenException('You do not have permission to create CBS calls');
    }

    const report = await this.maintenanceReportsService.createCbsCall(body);
    return { success: true, report_code: report.report_code, status: report.status };
  }

  @Patch('admin/:report_code/status')
  @UseGuards(AdminAuthGuard)
  async updateStatus(
    @Req() req: any,
    @Param('report_code') report_code: string,
    @Body() body: { status: string },
  ) {
    const role: string = req.adminUser?.role ?? '';
    const existing = await this.maintenanceReportsService.findByCode(report_code);

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
    const report = await this.maintenanceReportsService.updateStatus(report_code, body.status, author);
    return { success: true, report_code: report.report_code, status: report.status };
  }

  @Post('admin/:report_code/notes')
  @UseGuards(AdminAuthGuard)
  async addNote(
    @Req() req: any,
    @Param('report_code') report_code: string,
    @Body() body: { text: string; author?: string; kind?: string },
  ) {
    const role: string = req.adminUser?.role ?? '';
    const existing = await this.maintenanceReportsService.findByCode(report_code);

    if (!can(role, existing.status, 'comment') && !can(role, existing.status, 'review')) {
      throw new ForbiddenException('You do not have permission to comment on this report');
    }

    const author = body.author?.trim() || req.adminUser?.name || 'ADMIN';
    const report = await this.maintenanceReportsService.addNote(report_code, {
      text: body.text,
      author,
      kind: body.kind,
    });
    return { success: true, report_code: report.report_code };
  }

  @Patch('admin/:report_code')
  @UseGuards(AdminAuthGuard)
  async updateDetail(
    @Param('report_code') report_code: string,
    @Body() body: { equipmentId?: string },
  ) {
    const report = await this.maintenanceReportsService.updateDetail(report_code, body);
    return { success: true, report_code: report.report_code };
  }
}
