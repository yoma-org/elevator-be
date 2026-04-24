import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MmprService } from './mmpr.service';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';

@ApiTags('mmpr')
@ApiBearerAuth('admin-jwt')
@Controller('mmpr')
export class MmprController {
  constructor(private readonly mmprService: MmprService) {}

  /**
   * Yearly MMPR matrix (item × month grid).
   * Defaults: startYear = currentYear-1, startMonth = 1, endYear = currentYear, endMonth = currentMonth.
   */
  @Get('yearly-matrix/:equipmentId')
  @UseGuards(AdminAuthGuard)
  async getYearlyMatrix(
    @Param('equipmentId') equipmentId: string,
    @Query('startYear') startYearStr?: string,
    @Query('startMonth') startMonthStr?: string,
    @Query('endYear') endYearStr?: string,
    @Query('endMonth') endMonthStr?: string,
  ) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const startYear = Number(startYearStr) || currentYear - 1;
    const startMonth = Number(startMonthStr) || 1;
    const endYear = Number(endYearStr) || currentYear;
    const endMonth = Number(endMonthStr) || currentMonth;
    return this.mmprService.getYearlyMatrix(equipmentId, startYear, startMonth, endYear, endMonth);
  }

  /** GET /mmpr/:equipmentId?year=2025 */
  @Get(':equipmentId')
  @UseGuards(AdminAuthGuard)
  async get(
    @Param('equipmentId') equipmentId: string,
    @Query('year') yearStr?: string,
  ) {
    const year = Number(yearStr) || new Date().getFullYear();
    return this.mmprService.getFullMmprData(equipmentId, year);
  }

  /** PUT /mmpr/:equipmentId?year=2025 */
  @Put(':equipmentId')
  @UseGuards(AdminAuthGuard)
  async update(
    @Param('equipmentId') equipmentId: string,
    @Query('year') yearStr: string,
    @Body()
    body: {
      work_instructions?: unknown[];
      work_details?: unknown[];
      major_repairs?: unknown[];
      call_back_records?: unknown[];
    },
  ) {
    const year = Number(yearStr) || new Date().getFullYear();
    const record = await this.mmprService.update(equipmentId, year, body);
    return { success: true, data: record };
  }
}
