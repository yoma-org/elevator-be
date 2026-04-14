import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RosterImportService } from './roster-import.service';
import type { RosterImportPayload } from './roster-import.service';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';

@ApiTags('roster-import')
@ApiBearerAuth('admin-jwt')
@Controller('roster-import')
@UseGuards(AdminAuthGuard)
export class RosterImportController {
  constructor(private readonly rosterImportService: RosterImportService) {}

  /** POST /api/roster-import/preview — Dry-run: return counts without writing */
  @Post('preview')
  async preview(@Body() payload: RosterImportPayload) {
    return this.rosterImportService.preview(payload);
  }

  /** POST /api/roster-import/import — Create a new batch and insert records */
  @Post('import')
  async import(@Body() payload: RosterImportPayload, @Req() req: any) {
    return this.rosterImportService.importBatch(payload, {
      name: req.adminUser?.name,
      email: req.adminUser?.email,
    });
  }

  /** GET /api/roster-import/batches — List all import batches */
  @Get('batches')
  async listBatches() {
    return this.rosterImportService.listBatches();
  }

  /** GET /api/roster-import/batches/:id/usage — Check dependencies before undo */
  @Get('batches/:id/usage')
  async batchUsage(@Param('id') id: string) {
    return this.rosterImportService.checkBatchUsage(id);
  }

  /** DELETE /api/roster-import/batches/:id — Undo a batch (force=true to unlink reports) */
  @Delete('batches/:id')
  async undo(@Param('id') id: string, @Query('force') force?: string) {
    return this.rosterImportService.undoBatch(id, force === 'true');
  }
}
