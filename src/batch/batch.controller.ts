import { Body, Controller, Post } from '@nestjs/common';
import { BatchService } from './batch.service';

@Controller('batch')
export class BatchController {
  constructor(private readonly batchService: BatchService) {}

  @Post('buildings')
  async batchBuildings(@Body() body: { rows: any[] }) {
    const results = await this.batchService.batchCreateBuildings(body.rows ?? []);
    const created = results.filter((r) => r.status === 'created').length;
    const errors = results.filter((r) => r.status === 'error').length;
    return { success: true, summary: { total: results.length, created, errors }, results };
  }

  @Post('equipment')
  async batchEquipment(@Body() body: { rows: any[] }) {
    const results = await this.batchService.batchCreateEquipment(body.rows ?? []);
    const created = results.filter((r) => r.status === 'created').length;
    const errors = results.filter((r) => r.status === 'error').length;
    return { success: true, summary: { total: results.length, created, errors }, results };
  }
}
