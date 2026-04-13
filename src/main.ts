import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import express from 'express';

const server = express();
server.use(express.json({ limit: '50mb' }));
server.use(express.urlencoded({ limit: '50mb', extended: true }));

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), { bodyParser: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? '*',
  });

  // ── Swagger / OpenAPI docs ──
  const swaggerConfig = new DocumentBuilder()
    .setTitle('YECL Maintenance API')
    .setDescription('REST API for elevator maintenance reporting and admin dashboard.')
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Admin JWT token' },
      'admin-jwt',
    )
    .addTag('maintenance-reports', 'Submit reports, CBS calls, admin listing & status workflow')
    .addTag('equipment', 'Buildings & equipment lookups')
    .addTag('checklists', 'Inspection checklist templates')
    .addTag('suggestions', 'Auto-complete for findings / parts / remarks')
    .addTag('mmpr', 'Monthly Maintenance Performance Report')
    .addTag('batch', 'Bulk import of buildings / equipment')
    .addTag('admin-auth', 'Admin login + JWT issuance')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'YECL Maintenance API Docs',
  });

  await app.init();

  if (!process.env.VERCEL) {
    const port = process.env.PORT ?? 3001;
    server.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  }
}

let bootstrapPromise: Promise<void> | null = null;

function ensureBootstrap() {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrap();
  }
  return bootstrapPromise;
}

if (!process.env.VERCEL) {
  ensureBootstrap();
}

export { ensureBootstrap };
export default server;
