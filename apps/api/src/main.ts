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
  // Hikvision HttpHost sends multipart JSON + JPEG — must keep raw bytes.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const express = require('express') as typeof import('express');
  app.use(
    '/api/attendance/hikvision/events',
    express.raw({ type: () => true, limit: bodyLimit }),
  );
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: true });

  app.setGlobalPrefix('api');

  const isProd = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
  const corsOrigins = process.env.CORS_ORIGIN?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? ['http://localhost:3001'];

  // Security headers. CSP: Swagger UI needs inline + jsdelivr; JSON API responses are fine.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          fontSrc: ["'self'", 'https:', 'data:'],
          imgSrc: ["'self'", 'data:', 'https:'],
          objectSrc: ["'none'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://cdn.jsdelivr.net',
            'https://unpkg.com',
          ],
          scriptSrcAttr: ["'none'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://cdn.jsdelivr.net',
            'https://unpkg.com',
            'https://fonts.googleapis.com',
          ],
          connectSrc: ["'self'", ...corsOrigins],
          frameSrc: ["'self'"],
          upgradeInsecureRequests: isProd ? [] : null,
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.set('trust proxy', 1);
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
  if (weakSecrets.has(jwtSecret) || jwtSecret.length < (isProd ? 32 : 24)) {
    const msg =
      'JWT_SECRET is missing/weak. Set a long random secret before production (≥32).';
    if (isProd) {
      throw new Error(msg);
    }
    logger.warn(msg);
  }

  if (isProd && !(process.env.PUNCH_INGEST_API_KEY ?? '').trim()) {
    throw new Error(
      'PUNCH_INGEST_API_KEY is required in production. Punch ingest must not start open.',
    );
  }

  const vaultKey = (
    process.env.DEVICE_CREDENTIAL_VAULT_KEY ??
    process.env.DEVICE_LINK_KEY ??
    process.env.PUNCH_INGEST_API_KEY ??
    ''
  ).trim();
  if (isProd && !vaultKey) {
    throw new Error(
      'DEVICE_CREDENTIAL_VAULT_KEY (or DEVICE_LINK_KEY / PUNCH_INGEST_API_KEY) is required in production for device password encryption.',
    );
  }

  const bindSecret = (
    process.env.OFFICE_LINK_BIND_SECRET ??
    process.env.JWT_SECRET ??
    ''
  ).trim();
  if (isProd && !bindSecret) {
    throw new Error(
      'OFFICE_LINK_BIND_SECRET (or JWT_SECRET) is required in production — no hardcoded bind fallback.',
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
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3002);
  await app.listen(port, '0.0.0.0');
  logger.log(`HR HUB API listening on http://0.0.0.0:${port}`);
  logger.log(`Swagger: http://localhost:${port}/docs`);
  logger.log(`CORS origins: ${corsOrigins.join(', ')}`);
}

bootstrap();
