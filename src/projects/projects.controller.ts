import { Body, Controller, ForbiddenException, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { CreateProjectDto } from '../common/dto/create-project.dto';
import { can } from '../admin-auth/permissions';

@ApiTags('projects')
@ApiBearerAuth('admin-jwt')
@Controller('admin/projects')
@UseGuards(AdminAuthGuard)
export class ProjectsController {
  constructor(private readonly svc: ProjectsService) {}

  /**
   * Create a new project — building + equipment type + N equipment.
   * Only operation role (or anyone who can approve `received` status) can create projects.
   */
  @Post()
  async create(@Body() body: CreateProjectDto, @Req() req: any) {
    const role: string = req.adminUser?.role ?? '';
    if (!can(role, 'received', 'approve')) {
      throw new ForbiddenException('You do not have permission to create projects');
    }
    return this.svc.createProject(body);
  }
}
