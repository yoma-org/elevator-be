import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
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
