#!/usr/bin/env node
/**
 * Soft-purge face photos for dismissed employees older than FACE_PURGE_DAYS.
 * Same logic as Nest FacePurgeScheduler — use for host cron if API is not always on:
 *
 *   FACE_PURGE_DAYS=90 node scripts/face-purge.js
 *   # crontab: 0 3 * * * cd /opt/hr-hub && FACE_PURGE_DAYS=90 node scripts/face-purge.js
 *
 * Requires DATABASE_URL (+ optional MinIO_*). Does not need Nest to be running.
 */
const { PrismaClient } = require('@prisma/client');
const {
  S3Client,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');

const days = Math.floor(Number(process.env.FACE_PURGE_DAYS || '0'));
if (!Number.isFinite(days) || days < 1) {
  console.error('Set FACE_PURGE_DAYS≥1 (e.g. FACE_PURGE_DAYS=90)');
  process.exit(1);
}

const prisma = new PrismaClient();

function s3() {
  const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
  const port = process.env.MINIO_PORT || '9000';
  const bucket = process.env.MINIO_BUCKET || 'hrhub';
  const client = new S3Client({
    region: 'us-east-1',
    endpoint: `http://${endpoint}:${port}`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    },
  });
  return { client, bucket };
}

async function main() {
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);

  const profiles = await prisma.faceProfile.findMany({
    where: {
      OR: [{ photoKey: { not: null } }, { photoUrl: { not: null } }],
      employee: {
        status: 'dismissed',
        dismissedAt: { lte: cutoff },
      },
    },
    include: {
      employee: { select: { id: true, tenantId: true } },
    },
    take: 500,
  });

  const { client, bucket } = s3();
  let purged = 0;
  let errors = 0;
  const byTenant = new Map();

  for (const profile of profiles) {
    try {
      if (profile.photoKey) {
        try {
          await client.send(
            new DeleteObjectCommand({ Bucket: bucket, Key: profile.photoKey }),
          );
        } catch {
          /* MinIO may be down — still clear DB refs */
        }
      }
      await prisma.faceProfile.update({
        where: { id: profile.id },
        data: {
          photoKey: null,
          photoUrl: null,
          contentType: null,
          syncStatus: 'pending',
          lastError: `purged by retention (${days}d after dismiss)`,
          lastSyncedAt: null,
        },
      });
      const tid = profile.employee.tenantId;
      const list = byTenant.get(tid) || [];
      list.push(profile.employeeId);
      byTenant.set(tid, list);
      purged += 1;
    } catch (e) {
      errors += 1;
      console.warn(`purge failed ${profile.employeeId}:`, e.message || e);
    }
  }

  for (const [tenantId, employeeIds] of byTenant) {
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'face.retention_purge',
        entity: 'FaceProfile',
        meta: {
          days,
          cutoff: cutoff.toISOString().slice(0, 10),
          count: employeeIds.length,
          employeeIds: employeeIds.slice(0, 100),
          via: 'scripts/face-purge.js',
        },
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        days,
        cutoff: cutoff.toISOString().slice(0, 10),
        candidates: profiles.length,
        purged,
        errors,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
