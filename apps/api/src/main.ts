import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  // Face ID selfies arrive as base64 JSON — default Express 100kb limit → 413.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const logger = new Logger('Bootstrap');
  // Original-resolution mobile selfies are base64 encoded (~33% larger).
  const bodyLimit = process.env.API_BODY_LIMIT ?? '30mb';
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: true });

  app.setGlobalPrefix('api');

  // Security headers (CSP disabled — Swagger + Next cross-origin in lab)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const corsOrigins = process.env.CORS_ORIGIN?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? ['http://localhost:3000'];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const jwtSecret = (process.env.JWT_SECRET ?? '').trim();
  const weakSecrets = new Set([
    '',
    'dev-secret',
    'change-me-phase0-dev-secret-min-32-chars!!',
  ]);
  const isProd = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
  if (weakSecrets.has(jwtSecret) || jwtSecret.length < 24) {
    const msg =
      'JWT_SECRET is missing/weak. Set a long random secret before production.';
    if (isProd) {
      throw new Error(msg);
    }
    logger.warn(msg);
  }

  if (isProd && !(process.env.PUNCH_INGEST_API_KEY ?? '').trim()) {
    logger.warn(
      'PUNCH_INGEST_API_KEY unset in production — public punch ingest is open. See docs/SECURITY_CHECKLIST.md',
    );
  }

  const config = new DocumentBuilder()
    .setTitle('HR HUB API')
    .setDescription('Multi-tenant HR + attendance + payroll platform')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'X-Tenant-Id', in: 'header' }, 'tenant')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // Railway / PaaS inject PORT; local/dev still use API_PORT.
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  logger.log(`HR HUB API listening on http://0.0.0.0:${port}`);
  logger.log(`Swagger: http://localhost:${port}/docs`);
  logger.log(`CORS origins: ${corsOrigins.join(', ')}`);
}

bootstrap();
