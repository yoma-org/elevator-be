import { Module } from '@nestjs/common';
import { RosterImportController } from './roster-import.controller';
import { RosterImportService } from './roster-import.service';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';

@Module({
  imports: [AdminAuthModule],
  controllers: [RosterImportController],
  providers: [RosterImportService],
})
export class RosterImportModule {}
