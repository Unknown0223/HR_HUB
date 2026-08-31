const { PrismaClient } = require('./apps/api/node_modules/@prisma/client');

async function main() {
  const p = new PrismaClient();
  const d = await p.device.findUnique({
    where: { id: '34b673f8-5b7e-4a81-ba7d-577c408cff72' },
    select: { passwordEnc: true, status: true, host: true },
  });
  const pwd = d?.passwordEnc || '';
  // Write password to local file for unlock script (not stdout)
  const fs = require('fs');
  const out = '/mnt/d/hr-hub/data/verifix-dump/.device-pwd.tmp';
  fs.writeFileSync(out, pwd, { mode: 0o600 });
  console.log(
    JSON.stringify({
      status: d?.status,
      host: d?.host,
      len: pwd.length,
      prefix: pwd.slice(0, 2),
      written: true,
    }),
  );
  await p.$disconnect();
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
