const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/** Verifix «Отчет по кандидатам» sample rows (Excel 21.08.2026). */
const ROWS = [
  ['04.08.2026', 'BEKMUXAMEDOVA NADEJDA SANJAROVNA', '06.08.2007', 'Женский', 'TP', '+998904605599'],
  ['12.08.2026', 'KASIMOVA MADINABONU FARHODBEK QIZI', '13.07.1997', 'Женский', 'TP', '+998938057877'],
  ['03.08.2026', 'JAMOLOVA GULNORA HUSAN QIZI', '05.11.2000', 'Женский', 'TP', '+998880561551'],
  ['11.08.2026', 'XALIKOVA ZAREMA AZIMOVNA', '02.06.1993', 'Женский', 'TP', '+998932243243'],
  ['12.08.2026', 'ERGASHEVA MUHLISAXON MUZAFFAR QIZI', '14.03.2006', 'Женский', 'TP', '+998939852095'],
  ['04.08.2026', 'NIMATJONOVA SARVINOZ ISMOILJON QIZI', '02.09.2008', 'Женский', 'TP', '+998953103091'],
  ['04.08.2026', 'GULMANOVA ZILOLA ABDUXAMID QIZI', '13.03.1996', 'Женский', 'TP', '+998901619331'],
  ['04.08.2026', 'AHMEDOVA MUQADAM', '08.10.1990', 'Женский', 'TP', '+998919108575'],
  ['03.08.2026', 'YOLDOSHEVA HILOLA ERKINBOY QIZI', '01.01.1999', 'Женский', 'TP', '+998950191838'],
  ['06.08.2026', 'ELMURADOVA FAYOZA UMIRZOQ QIZI', '24.11.2000', 'Женский', 'TP', '+998971073525'],
  ['17.08.2026', 'JURAYEVA ZAXROXON FAYZULLO QIZI', '19.02.2002', 'Женский', 'TP', '+998904412202'],
  ['03.08.2026', 'MENGLIYEVA MEXRIBON OTABEKOVNA', '04.12.2007', 'Женский', 'TP', '+998937301611'],
  ['14.08.2026', 'ABDULLAYEVA MANZURA SHUXRATILLA QIZI', '13.02.1997', 'Женский', 'TP', '+998949730990'],
  ['03.08.2026', 'ATABAYEVA MADINA ALISHER QIZI', '16.08.1997', 'Женский', 'MERCHANDISER', '+998946416624'],
  ['12.08.2026', 'ABDULLAYEVA DILNOZA RAXMATULLAYEVNA', '08.01.1992', 'Женский', 'SVR', '998937276272'],
  ['12.08.2026', 'ABDULLAYEVA DILNOZA RAXMATULLAYEVNA', '08.01.1992', 'Женский', 'TP', '998937276272'],
  ['03.08.2026', 'RADJAPOVA SHAXNOZA SHAVKATOVNA', '18.06.1993', 'Женский', 'TP', '+998976161806'],
  ['05.08.2026', 'SHAMSHIYEVA ZARINA SAYTKARIMOVNA', '01.08.1998', 'Женский', 'TP', '+998970148434'],
  ['03.08.2026', 'TURDIYEVA AZIZA OKTAMOVNA', '16.04.1989', 'Женский', 'TP', '+998931876455'],
  ['17.08.2026', 'XUSANOVA GULJAMOL MUTALIB QIZI', '28.11.1997', 'Женский', 'TP', '+998774132897'],
  ['06.08.2026', 'ELTAYEVA IRODA SADULLA QIZI', '15.02.2003', 'Женский', 'TP', '+998900264643'],
  ['11.08.2026', 'TULYAKOVA MAMURAXON ABDUMAJIDOVNA', '22.08.1987', 'Женский', 'TP', '+998887332375'],
  ['17.08.2026', 'ABDUGAPPOROVA MUXLISA ABDUMALIK QIZI', '10.03.2008', 'Женский', 'TP', '+998949345373'],
  ['03.08.2026', 'XUSANOVA NURIYA RAMILEVNA', '14.07.1998', 'Женский', 'TP', '+998995882824'],
  ['05.08.2026', 'SHOBEKOVA ZUXRA AVAZXANOVNA', '18.07.1983', 'Женский', 'TP', '+998905384838'],
  ['10.08.2026', 'GULAMOVA FERUZA OLIMJONOVNA', '07.07.1983', 'Женский', 'TP', '+998973071020'],
  ['10.08.2026', 'ATAJANOVA ODINA ISMOILDJONOVNA', '21.06.1984', 'Женский', 'TP', '+998884413113'],
  ['04.08.2026', 'YUSUPOVA NODIRA BOTIR QIZI', '16.03.1992', 'Женский', 'TP', '998996355356'],
  ['06.08.2026', 'USMONOVA GULHAYO CHORI QIZI', '12.10.1994', 'Женский', 'SVR', '+998991224333'],
];

function dmy(s) {
  const [d, m, y] = s.split('.').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

(async () => {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'demo' } });
  if (!tenant) throw new Error('no demo tenant');

  const dict = await prisma.dictionary.findFirst({
    where: { tenantId: tenant.id, code: 'employment_sources' },
  });
  if (dict) {
    const existing = await prisma.dictionaryItem.findMany({ where: { dictionaryId: dict.id } });
    const names = new Set(existing.map((x) => x.name));
    for (const [i, name] of ['HeadHunter', 'Telegram', 'Рекомендация'].entries()) {
      if (names.has(name)) continue;
      await prisma.dictionaryItem.create({
        data: {
          dictionaryId: dict.id,
          code: `SRC${i + 1}`,
          name,
          sortOrder: existing.length + i,
          isActive: true,
        },
      });
    }
  }

  await prisma.candidate.deleteMany({ where: { tenantId: tenant.id } });

  const types = ['A', 'B', 'C'];
  let n = 0;
  for (const [introduced, fullName, birth, gender, position, phone] of ROWS) {
    await prisma.candidate.create({
      data: {
        tenantId: tenant.id,
        fullName,
        phone,
        gender,
        positionName: position,
        introducedAt: dmy(introduced),
        birthDate: dmy(birth),
        personType: types[n % 3],
        employmentSource: n % 7 === 0 ? 'HeadHunter' : null,
        status: 'new',
      },
    });
    n += 1;
  }

  console.log(JSON.stringify({ tenant: tenant.code, candidates: n }, null, 2));
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
