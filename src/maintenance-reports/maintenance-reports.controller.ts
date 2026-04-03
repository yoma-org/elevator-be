import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateMaintenanceReportDto } from '../common/dto/create-maintenance-report.dto';
import { MaintenanceReportsService } from './maintenance-reports.service';

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
  async getStats() {
    return this.maintenanceReportsService.getStats();
  }

  @Get('admin/list')
  async findAll(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    const reports = await this.maintenanceReportsService.findAll(from, to, status);
    return reports.map((r) => ({
      id: r.reportCode,
      building: r.building?.name ?? '',
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
  async findOne(@Param('reportCode') reportCode: string) {
    const r = await this.maintenanceReportsService.findByCode(reportCode);
    return {
      id: r.reportCode,
      building: r.building?.name ?? '',
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
      submittedAt: r.submittedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  @Post('admin/cbs-call')
  async createCbsCall(
    @Body() body: { buildingId: string; equipmentId: string; calledPerson: string; calledTime: string; issue: string },
  ) {
    const report = await this.maintenanceReportsService.createCbsCall(body);
    return { success: true, reportCode: report.reportCode, status: report.status };
  }

  @Patch('admin/:reportCode/status')
  async updateStatus(
    @Param('reportCode') reportCode: string,
    @Body() body: { status: string },
  ) {
    const report = await this.maintenanceReportsService.updateStatus(reportCode, body.status);
    return { success: true, reportCode: report.reportCode, status: report.status };
  }
}
