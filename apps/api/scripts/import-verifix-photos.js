/**
 * Attach downloaded Verifix JPEGs to FaceProfile (MinIO when available).
 * Photos: data/verifix-dump/live/photos/{verifixEmployeeId}.jpg
 */
const { PrismaClient, FaceSyncStatus } = require('@prisma/client');
const {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const PHOTOS = path.join(ROOT, 'data', 'verifix-dump', 'live', 'photos');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i);
    let v = t.slice(i + 1);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] == null) process.env[k] = v;
  }
}
loadEnvFile(path.join(ROOT, '.env'));

const prisma = new PrismaClient();

async function makeS3() {
  if (process.env.SKIP_MINIO === '1') {
    return { client: null, bucket: process.env.MINIO_BUCKET || 'hrhub' };
  }
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
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch {
      return { client: null, bucket };
    }
  }
  return { client, bucket };
}

(async () => {
  if (!fs.existsSync(PHOTOS)) throw new Error(`photos yo‘q: ${PHOTOS}`);
  const files = fs.readdirSync(PHOTOS).filter((n) => n.endsWith('.jpg'));
  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('demo tenant yo‘q');
  const { client, bucket } = await makeS3();
  console.log('minio', client ? 'ready' : 'fallback-data-url', 'files', files.length);

  let ok = 0;
  let miss = 0;
  let fail = 0;
  for (let i = 0; i < files.length; i += 1) {
    const vfId = files[i].replace(/\.jpg$/i, '');
    const buf = fs.readFileSync(path.join(PHOTOS, files[i]));
    const emp = await prisma.employee.findFirst({
      where: { tenantId: tenant.id, externalId: `verifix:${vfId}` },
      select: { id: true },
    });
    if (!emp) {
      miss += 1;
      continue;
    }
    const key = `faces/${tenant.id}/${emp.id}/${vfId}.jpg`;
    const photoUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
    const photoKey = key;
    if (client) {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buf,
            ContentType: 'image/jpeg',
          }),
        );
      } catch (e) {
        console.log('minio fail', vfId, e.message);
      }
    }
    await prisma.faceProfile.upsert({
      where: { employeeId: emp.id },
      create: {
        tenantId: tenant.id,
        employeeId: emp.id,
        photoUrl,
        photoKey,
        contentType: 'image/jpeg',
        syncStatus: FaceSyncStatus.pending,
        lastError: null,
      },
      update: {
        photoUrl,
        photoKey,
        contentType: 'image/jpeg',
        syncStatus: FaceSyncStatus.pending,
        lastError: null,
      },
    });
    ok += 1;
    if ((i + 1) % 100 === 0 || i + 1 === files.length) {
      console.log(`attach ${i + 1}/${files.length} ok=${ok} miss=${miss} fail=${fail}`);
    }
  }
  console.log('DONE', JSON.stringify({ ok, miss, fail, minio: Boolean(client) }));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
