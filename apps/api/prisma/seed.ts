import { PrismaClient, Role, EmploymentType, DocumentType, DocumentLifecycle } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Demo1234!', 10);

  const platform = await prisma.user.upsert({
    where: { email: 'platform@hrhub.local' },
    update: {},
    create: {
      email: 'platform@hrhub.local',
      fullName: 'Platform Admin',
      passwordHash,
      role: Role.platform_admin,
      tenantId: null,
    },
  });

  const tenant = await prisma.tenant.upsert({
    where: { code: 'demo' },
    update: { name: 'Demo Company LLC' },
    create: { code: 'demo', name: 'Demo Company LLC' },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.local' },
    update: { tenantId: tenant.id, passwordHash, role: Role.tenant_admin },
    create: {
      email: 'admin@demo.local',
      fullName: 'Demo Tenant Admin',
      passwordHash,
      role: Role.tenant_admin,
      tenantId: tenant.id,
    },
  });

  const hq = await prisma.division.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'HQ' } },
    update: {},
    create: { tenantId: tenant.id, code: 'HQ', name: 'Bosh ofis' },
  });

  const hr = await prisma.division.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'HR' } },
    update: { parentId: hq.id },
    create: {
      tenantId: tenant.id,
      code: 'HR',
      name: 'Кадры / HR',
      parentId: hq.id,
    },
  });

  const it = await prisma.division.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'IT' } },
    update: { parentId: hq.id },
    create: {
      tenantId: tenant.id,
      code: 'IT',
      name: 'IT Department',
      parentId: hq.id,
    },
  });

  const ops = await prisma.division.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'OPS' } },
    update: { parentId: hq.id },
    create: {
      tenantId: tenant.id,
      code: 'OPS',
      name: 'Operations',
      parentId: hq.id,
    },
  });

  const posDev = await prisma.position.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'DEV' } },
    update: {},
    create: { tenantId: tenant.id, code: 'DEV', name: 'Developer' },
  });

  const posHr = await prisma.position.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'HRM' } },
    update: {},
    create: { tenantId: tenant.id, code: 'HRM', name: 'HR Manager' },
  });

  const posCourier = await prisma.position.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'CRR' } },
    update: {},
    create: { tenantId: tenant.id, code: 'CRR', name: 'Courier / GPH' },
  });

  const schedule = await prisma.workSchedule.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'STD' } },
    update: {
      name: 'Standart 09:00–18:00 (6/1)',
      startTime: '09:00',
      endTime: '18:00',
    },
    create: {
      tenantId: tenant.id,
      code: 'STD',
      name: 'Standart 09:00–18:00 (6/1)',
      startTime: '09:00',
      endTime: '18:00',
      graceMinutes: 15,
    },
  });

  const person1 = await prisma.person.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      tenantId: tenant.id,
      firstName: 'Ali',
      lastName: 'Karimov',
      gender: 'M',
      pinfl: '30101990123456',
      passport: 'AA1234567',
      birthDate: new Date('1990-01-30'),
    },
  });

  const emp1 = await prisma.employee.upsert({
    where: { tenantId_tabNumber: { tenantId: tenant.id, tabNumber: '0001' } },
    update: {
      personId: person1.id,
      scheduleId: schedule.id,
      externalId: 'face-0001',
      email: 'employee@demo.local',
    },
    create: {
      tenantId: tenant.id,
      personId: person1.id,
      tabNumber: '0001',
      firstName: 'Ali',
      lastName: 'Karimov',
      email: 'employee@demo.local',
      divisionId: it.id,
      positionId: posDev.id,
      scheduleId: schedule.id,
      hiredAt: new Date('2024-01-15'),
      externalId: 'face-0001',
    },
  });

  const emp2 = await prisma.employee.upsert({
    where: { tenantId_tabNumber: { tenantId: tenant.id, tabNumber: '0002' } },
    update: {
      scheduleId: schedule.id,
      externalId: 'face-0002',
      email: 'manager@demo.local',
    },
    create: {
      tenantId: tenant.id,
      tabNumber: '0002',
      firstName: 'Dilnoza',
      lastName: 'Rahimova',
      email: 'manager@demo.local',
      divisionId: hr.id,
      positionId: posHr.id,
      scheduleId: schedule.id,
      hiredAt: new Date('2023-06-01'),
      externalId: 'face-0002',
    },
  });

  // Mobile demo users — linked to employees via matching email
  await prisma.user.upsert({
    where: { email: 'employee@demo.local' },
    update: {
      tenantId: tenant.id,
      passwordHash,
      role: Role.employee,
      fullName: 'Ali Karimov',
      isActive: true,
    },
    create: {
      email: 'employee@demo.local',
      fullName: 'Ali Karimov',
      passwordHash,
      role: Role.employee,
      tenantId: tenant.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'manager@demo.local' },
    update: {
      tenantId: tenant.id,
      passwordHash,
      role: Role.manager,
      fullName: 'Dilnoza Rahimova',
      isActive: true,
    },
    create: {
      email: 'manager@demo.local',
      fullName: 'Dilnoza Rahimova',
      passwordHash,
      role: Role.manager,
      tenantId: tenant.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'hr@demo.local' },
    update: {
      tenantId: tenant.id,
      passwordHash,
      role: Role.hr,
      fullName: 'Demo HR',
      isActive: true,
    },
    create: {
      email: 'hr@demo.local',
      fullName: 'Demo HR',
      passwordHash,
      role: Role.hr,
      tenantId: tenant.id,
    },
  });

  await prisma.employee.upsert({
    where: { tenantId_tabNumber: { tenantId: tenant.id, tabNumber: 'GPH-01' } },
    update: {},
    create: {
      tenantId: tenant.id,
      tabNumber: 'GPH-01',
      firstName: 'Jasur',
      lastName: 'Toshmatov',
      divisionId: ops.id,
      positionId: posCourier.id,
      employmentType: EmploymentType.gph,
      hiredAt: new Date('2025-03-01'),
      externalId: 'face-gph-01',
    },
  });

  await prisma.employee.upsert({
    where: { tenantId_tabNumber: { tenantId: tenant.id, tabNumber: '0003' } },
    update: {},
    create: {
      tenantId: tenant.id,
      tabNumber: '0003',
      firstName: 'Sardor',
      lastName: 'Nazarov',
      divisionId: it.id,
      positionId: posDev.id,
      status: 'dismissed',
      dismissedAt: new Date('2025-12-01'),
      hiredAt: new Date('2022-01-01'),
    },
  });

  const loc = await prisma.location.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'OFFICE1' } },
    update: {
      latitude: 41.3111,
      longitude: 69.2797,
      geoRadiusM: 200,
    },
    create: {
      tenantId: tenant.id,
      code: 'OFFICE1',
      name: 'Asosiy ofis — kirish',
      address: 'Toshkent',
      latitude: 41.3111,
      longitude: 69.2797,
      geoRadiusM: 200,
    },
  });

  const locTypeOffice = await prisma.locationType.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'OFFICE' } },
    update: {},
    create: { tenantId: tenant.id, code: 'OFFICE', name: 'Офис' },
  });

  const demoLocDefs = [
    {
      code: 'AND1',
      name: 'Andijon 1',
      address: 'Andijon',
      latitude: 40.790345,
      longitude: 72.331761,
      geoRadiusM: 100,
      region: 'Andijon',
    },
    { code: 'AND2', name: 'Andijon 2', address: 'Andijon', region: 'Andijon' },
    { code: 'BUX1', name: 'Buxoro 1', address: 'Buxoro', region: 'Buxoro' },
    { code: 'BUX2', name: 'Buxoro 2 (Zarafshan)', address: 'Buxoro', region: 'Buxoro' },
    { code: 'NAV1', name: 'Navoiy 1', address: 'Navoiy', region: 'Navoiy' },
    { code: 'SAM1', name: 'Samarqand 1', address: 'Samarqand', region: 'Samarqand' },
    { code: 'FER1', name: 'Farg‘ona 1', address: 'Farg‘ona', region: 'Farg‘ona' },
    { code: 'NAM1', name: 'Namangan 1', address: 'Namangan', region: 'Namangan' },
    { code: 'QAR1', name: 'Qarshi 1', address: 'Qarshi', region: 'Qashqadaryo' },
    { code: 'NUK1', name: 'Nukus 1', address: 'Nukus', region: 'Qoraqalpog‘iston' },
    { code: 'JIZ1', name: 'Jizzax 1', address: 'Jizzax', region: 'Jizzax' },
    { code: 'TER1', name: 'Termiz 1', address: 'Termiz', region: 'Surxondaryo' },
  ];
  const demoLocs = [];
  for (const d of demoLocDefs) {
    demoLocs.push(
      await prisma.location.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code: d.code } },
        update: {
          name: d.name,
          address: d.address,
          locationTypeId: locTypeOffice.id,
          isActive: true,
          latitude: d.latitude ?? undefined,
          longitude: d.longitude ?? undefined,
          geoRadiusM: d.geoRadiusM ?? undefined,
          meta: {
            region: d.region,
            restrictMarks: false,
            createdByLabel: 'Admin',
            updatedByLabel: 'Admin',
            changeHistory: [
              {
                at: new Date().toISOString(),
                by: 'Admin',
                action: 'update',
              },
            ],
          },
        },
        create: {
          tenantId: tenant.id,
          code: d.code,
          name: d.name,
          address: d.address,
          locationTypeId: locTypeOffice.id,
          latitude: d.latitude,
          longitude: d.longitude,
          geoRadiusM: d.geoRadiusM ?? 150,
          meta: {
            region: d.region,
            restrictMarks: false,
            createdByLabel: 'Admin',
            updatedByLabel: 'Admin',
            changeHistory: [
              { at: new Date().toISOString(), by: 'Admin', action: 'create' },
            ],
          },
        },
      }),
    );
  }

  // Verifix-style attached locations for demo employee (Авто)
  for (const l of demoLocs.slice(0, 8)) {
    const existingGrant = await prisma.employeeAccessGrant.findFirst({
      where: {
        tenantId: tenant.id,
        employeeId: emp1.id,
        accessType: 'location',
        resource: l.id,
      },
    });
    if (existingGrant) {
      await prisma.employeeAccessGrant.update({
        where: { id: existingGrant.id },
        data: { isActive: true, note: 'auto' },
      });
    } else {
      await prisma.employeeAccessGrant.create({
        data: {
          tenantId: tenant.id,
          employeeId: emp1.id,
          accessType: 'location',
          resource: l.id,
          isActive: true,
          note: 'auto',
        },
      });
    }
  }

  // Seen before but currently offline → NOT "new"
  const hkLastSeen = new Date(Date.now() - 3 * 86400000);
  await prisma.device.upsert({
    where: {
      tenantId_serialNumber: { tenantId: tenant.id, serialNumber: 'HK-DEMO-001' },
    },
    update: {
      locationId: loc.id,
      status: 'offline',
      lastSeenAt: hkLastSeen,
      isActive: false,
      gatewayRef: null,
      host: '192.168.1.50',
      adapterType: 'hikvision',
      meta: {
        deviceType: 'Hikvision',
        timezone: 'Asia/Tashkent',
        battery: null,
        trackingType: 'mark',
        autoGenerateIn: true,
        autoGenerateOut: true,
        invalidMarks: false,
        useBasicSettings: true,
        hikCentral: {
          gatewayHost: 'hikvision.verifix.com',
          gatewayPort: 6362,
          deviceId: 'demo-andijon-1',
          isupKey: '25ILAIN83',
        },
        doorEvents: [
          { type: 'Door Locked', at: new Date(Date.now() - 3600000).toISOString() },
          { type: 'Door Unlocked', at: new Date(Date.now() - 7200000).toISOString() },
        ],
        commands: [
          {
            id: 3302412,
            type: 'Person Edit',
            employeeName: 'DEMO USER',
            createdAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            status: 'completed',
          },
        ],
      },
    },
    create: {
      tenantId: tenant.id,
      locationId: loc.id,
      name: 'Hikvision Face Gate 1',
      serialNumber: 'HK-DEMO-001',
      model: 'DS-K1T343',
      adapterType: 'hikvision',
      host: '192.168.1.50',
      status: 'offline',
      lastSeenAt: hkLastSeen,
      isActive: false,
      gatewayRef: null,
      meta: {
        deviceType: 'Hikvision',
        timezone: 'Asia/Tashkent',
        trackingType: 'mark',
        autoGenerateIn: true,
        autoGenerateOut: true,
        invalidMarks: false,
        useBasicSettings: true,
        hikCentral: {
          gatewayHost: 'hikvision.verifix.com',
          gatewayPort: 6362,
          deviceId: 'demo-andijon-1',
          isupKey: '25ILAIN83',
        },
      },
    },
  });

  // Operational terminal (seen recently) → NOT "new"
  await prisma.device.upsert({
    where: {
      tenantId_serialNumber: { tenantId: tenant.id, serialNumber: 'MOCK-001' },
    },
    update: {
      locationId: loc.id,
      status: 'online',
      lastSeenAt: new Date(),
      isActive: true,
      gatewayRef: null,
      adapterType: 'mock',
      meta: {
        deviceType: 'Mock',
        trackingType: 'mark',
        autoGenerateIn: true,
        autoGenerateOut: true,
        hikCentral: {
          gatewayHost: 'hikvision.verifix.com',
          gatewayPort: 8000,
          deviceId: 'mock-terminal-1',
          isupKey: 'MOCKKEY01',
        },
      },
    },
    create: {
      tenantId: tenant.id,
      locationId: loc.id,
      name: 'Mock Terminal',
      serialNumber: 'MOCK-001',
      adapterType: 'mock',
      status: 'online',
      lastSeenAt: new Date(),
      isActive: true,
      gatewayRef: null,
      meta: {
        deviceType: 'Mock',
        trackingType: 'mark',
        autoGenerateIn: true,
        autoGenerateOut: true,
      },
    },
  });

  const timeLeave = await prisma.timeType.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'LEAVE' } },
    update: {
      name: 'Отпуск',
      isPaid: true,
      letterCode: 'О',
      planLoad: 'partial',
      color: '#FF7000',
    },
    create: {
      tenantId: tenant.id,
      code: 'LEAVE',
      name: 'Отпуск',
      isPaid: true,
      letterCode: 'О',
      planLoad: 'partial',
      color: '#FF7000',
    },
  });
  await prisma.timeType.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'SICK' } },
    update: {
      name: 'Больничный',
      isPaid: true,
      letterCode: 'Б',
      planLoad: 'partial',
      color: '#94C591',
    },
    create: {
      tenantId: tenant.id,
      code: 'SICK',
      name: 'Больничный',
      isPaid: true,
      letterCode: 'Б',
      planLoad: 'partial',
      color: '#94C591',
    },
  });
  await prisma.timeType.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'DAYOFF' } },
    update: {
      name: 'Выходной',
      isPaid: false,
      letterCode: 'В',
      planLoad: 'full',
      color: '#FFD000',
    },
    create: {
      tenantId: tenant.id,
      code: 'DAYOFF',
      name: 'Выходной',
      isPaid: false,
      letterCode: 'В',
      planLoad: 'full',
      color: '#FFD000',
    },
  });
  await prisma.timeType.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'TRIP' } },
    update: {
      name: 'Командировка',
      isPaid: true,
      letterCode: 'К',
      planLoad: 'partial',
      color: '#DCAAA3',
    },
    create: {
      tenantId: tenant.id,
      code: 'TRIP',
      name: 'Командировка',
      isPaid: true,
      letterCode: 'К',
      planLoad: 'partial',
      color: '#DCAAA3',
    },
  });
  const dayOff = await prisma.timeType.findFirst({
    where: { tenantId: tenant.id, code: 'DAYOFF' },
  });
  if (dayOff) {
    await prisma.timeType.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: 'HOLIDAY' } },
      update: {
        name: 'Праздник',
        parentId: dayOff.id,
        letterCode: 'П',
        planLoad: 'full',
        color: '#5CC070',
      },
      create: {
        tenantId: tenant.id,
        code: 'HOLIDAY',
        name: 'Праздник',
        parentId: dayOff.id,
        letterCode: 'П',
        planLoad: 'full',
        color: '#5CC070',
        isPaid: false,
      },
    });
  }

  const vac = await prisma.absenceType.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'VAC' } },
    update: {
      name: 'Ежегодный трудовой отпуск',
      calcKind: 'annual',
      description: null,
      accrualName: 'Оплата отпуска',
      timeTypeId: timeLeave.id,
      paid: true,
      isActive: true,
    },
    create: {
      tenantId: tenant.id,
      code: 'VAC',
      name: 'Ежегодный трудовой отпуск',
      calcKind: 'annual',
      accrualName: 'Оплата отпуска',
      timeTypeId: timeLeave.id,
      paid: true,
    },
  });

  await prisma.absenceType.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'VAC_SEN' } },
    update: {
      name: 'Трудовой отпуск по стажу',
      calcKind: 'annual',
      timeTypeId: timeLeave.id,
      paid: true,
      isActive: true,
    },
    create: {
      tenantId: tenant.id,
      code: 'VAC_SEN',
      name: 'Трудовой отпуск по стажу',
      calcKind: 'annual',
      timeTypeId: timeLeave.id,
      paid: true,
    },
  });

  await prisma.absenceType.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'SICK' } },
    update: {
      name: 'Больничный лист',
      calcKind: 'one_time',
      accrualName: 'Больничный',
      paid: true,
      isActive: true,
    },
    create: {
      tenantId: tenant.id,
      code: 'SICK',
      name: 'Больничный лист',
      calcKind: 'one_time',
      accrualName: 'Больничный',
      paid: true,
    },
  });

  await prisma.hrDocument.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.hrDocument.createMany({
    data: [
      {
        tenantId: tenant.id,
        employeeId: emp1.id,
        type: DocumentType.hire,
        title: 'Прием на работу',
        number: '0000008701',
        documentDate: new Date('2024-01-15'),
        status: 'posted',
        postedAt: new Date('2024-01-15'),
        postedBy: 'admin@demo.local',
        payload: {
          previousStatus: 'active',
          divisionId: ops.id,
        },
      },
      {
        tenantId: tenant.id,
        employeeId: emp2.id,
        type: DocumentType.transfer,
        title: 'Кадровый перевод',
        number: '0000008702',
        documentDate: new Date('2024-07-01'),
        status: 'posted',
        postedAt: new Date('2024-07-01'),
        postedBy: 'admin@demo.local',
        payload: {
          oldDivisionId: hr.id,
          previousDivisionId: hr.id,
          oldPositionId: posHr.id,
          previousPositionId: posHr.id,
          divisionId: ops.id,
          positionId: posDev.id,
          transferFrom: '2024-07-01',
          transferTo: null,
          fromPositionLabel: `${hr.code}/${posHr.code}`,
          toPositionLabel: `${ops.code}/${posDev.code}`,
        },
      },
      {
        tenantId: tenant.id,
        employeeId: emp1.id,
        type: DocumentType.transfer,
        title: 'Кадровый перевод',
        number: '0000008703',
        documentDate: new Date('2024-07-15'),
        status: 'posted',
        postedAt: new Date('2024-07-15'),
        postedBy: 'admin@demo.local',
        payload: {
          oldDivisionId: it.id,
          previousDivisionId: it.id,
          oldPositionId: posDev.id,
          previousPositionId: posDev.id,
          divisionId: hr.id,
          positionId: posHr.id,
          transferFrom: '2024-07-15',
          transferTo: '2024-12-31',
          fromPositionLabel: `${it.code}/${posDev.code}`,
          toPositionLabel: `${hr.code}/${posHr.code}`,
        },
      },
      {
        tenantId: tenant.id,
        employeeId: emp2.id,
        type: DocumentType.transfer,
        title: 'Кадровый перевод',
        number: '0000008704',
        documentDate: new Date(),
        status: 'draft',
        payload: {
          oldDivisionId: ops.id,
          previousDivisionId: ops.id,
          oldPositionId: posDev.id,
          previousPositionId: posDev.id,
          divisionId: it.id,
          positionId: posDev.id,
          transferFrom: new Date().toISOString().slice(0, 10),
          fromPositionLabel: `${ops.code}/${posDev.code}`,
          toPositionLabel: `${it.code}/${posDev.code}`,
        },
      },
    ],
  });

  await prisma.faceProfile.upsert({
    where: { employeeId: emp1.id },
    update: {
      syncStatus: 'pending',
      photoUrl: null,
      photoKey: null,
      lastError: null,
      lastSyncedAt: null,
    },
    create: {
      tenantId: tenant.id,
      employeeId: emp1.id,
      syncStatus: 'pending',
    },
  });

  // Sample punches for today
  const now = new Date();
  const morning = new Date(now);
  morning.setHours(8, 55, 0, 0);
  await prisma.attendanceMark.deleteMany({
    where: { tenantId: tenant.id, employeeId: emp1.id },
  });
  await prisma.attendanceMark.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp1.id,
      employeeExternalId: 'face-0001',
      direction: 'IN',
      occurredAt: morning,
      source: 'mock',
    },
  });

  // Import AttendanceService logic inline via upsert day
  await prisma.attendanceDay.upsert({
    where: {
      tenantId_employeeId_workDate: {
        tenantId: tenant.id,
        employeeId: emp1.id,
        workDate: new Date(now.toISOString().slice(0, 10)),
      },
    },
    create: {
      tenantId: tenant.id,
      employeeId: emp1.id,
      workDate: new Date(now.toISOString().slice(0, 10)),
      status: 'on_time',
      firstInAt: morning,
      lateMinutes: 0,
    },
    update: {
      status: 'on_time',
      firstInAt: morning,
      lateMinutes: 0,
    },
  });

  // Phase 3 — second schedule + QR
  const night = await prisma.workSchedule.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'NIGHT' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'NIGHT',
      name: 'Kechki smena 16:00–01:00',
      startTime: '16:00',
      endTime: '01:00',
      graceMinutes: 10,
    },
  });

  await prisma.qrCode.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'QR-OFFICE-GATE' } },
    update: { locationId: loc.id, isActive: true },
    create: {
      tenantId: tenant.id,
      locationId: loc.id,
      code: 'QR-OFFICE-GATE',
      label: 'Ofis kirish QR',
    },
  });

  // Phase 4 — payroll seed
  await prisma.employee.update({
    where: { id: emp1.id },
    data: { baseSalary: 7500000 },
  });

  const policy = await prisma.payrollPolicy.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'STD' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'STD',
      name: 'Standart jarima / oylik',
      latePenaltyPerMin: 500,
      absencePenalty: 100000,
      overtimeBonusPerHour: 25000,
      baseSalaryDefault: 5000000,
    },
  });

  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const period = await prisma.payrollPeriod.upsert({
    where: {
      tenantId_year_month: { tenantId: tenant.id, year, month },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      year,
      month,
      status: 'open',
      note: 'Demo oy',
    },
  });

  await prisma.payrollAdvance.deleteMany({
    where: { tenantId: tenant.id, employeeId: emp1.id },
  });
  await prisma.payrollAdvance.create({
    data: {
      tenantId: tenant.id,
      periodId: period.id,
      employeeId: emp1.id,
      amount: 1500000,
      note: 'Demo avans (paid)',
      status: 'paid',
      paidAt: new Date(),
    },
  });
  await prisma.payrollAdvance.create({
    data: {
      tenantId: tenant.id,
      periodId: period.id,
      employeeId: emp2.id,
      amount: 500000,
      note: 'Draft avans — pay qilinmagan',
      status: 'draft',
    },
  });

  // Phase 6 — settings seed
  await prisma.tenantSetting.upsert({
    where: { tenantId: tenant.id },
    update: {
      orgName: 'Demo Company LLC',
      legalName: 'OOO "Demo Company"',
      inn: '207123456',
      address: 'Toshkent, Yunusobod',
      phone: '+998711234567',
      currency: 'UZS',
    },
    create: {
      tenantId: tenant.id,
      orgName: 'Demo Company LLC',
      legalName: 'OOO "Demo Company"',
      inn: '207123456',
      address: 'Toshkent, Yunusobod',
      phone: '+998711234567',
      currency: 'UZS',
    },
  });

  const grades = await prisma.dictionary.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'GRADES' } },
    update: { kind: 'core' },
    create: {
      tenantId: tenant.id,
      code: 'GRADES',
      name: 'Разряды',
      kind: 'core',
    },
  });
  await prisma.dictionaryItem.deleteMany({ where: { dictionaryId: grades.id } });
  await prisma.dictionaryItem.createMany({
    data: [
      { dictionaryId: grades.id, code: '1', name: '1-разряд', sortOrder: 1 },
      { dictionaryId: grades.id, code: '2', name: '2-разряд', sortOrder: 2 },
      { dictionaryId: grades.id, code: '3', name: '3-разряд', sortOrder: 3 },
    ],
  });

  const extraDict = await prisma.dictionary.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'DOC_TAGS' } },
    update: { kind: 'extra' },
    create: {
      tenantId: tenant.id,
      code: 'DOC_TAGS',
      name: 'Теги документов',
      kind: 'extra',
    },
  });
  await prisma.dictionaryItem.deleteMany({ where: { dictionaryId: extraDict.id } });
  await prisma.dictionaryItem.createMany({
    data: [
      { dictionaryId: extraDict.id, code: 'URGENT', name: 'Срочно', sortOrder: 1 },
      { dictionaryId: extraDict.id, code: 'ARCHIVE', name: 'Архив', sortOrder: 2 },
    ],
  });

  const skillDict = await prisma.dictionary.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'SKILLS' } },
    update: { kind: 'extra' },
    create: {
      tenantId: tenant.id,
      code: 'SKILLS',
      name: 'Навыки',
      kind: 'extra',
    },
  });
  await prisma.dictionaryItem.deleteMany({ where: { dictionaryId: skillDict.id } });
  await prisma.dictionaryItem.createMany({
    data: [
      { dictionaryId: skillDict.id, code: 'JS', name: 'JavaScript', sortOrder: 1 },
      { dictionaryId: skillDict.id, code: 'SQL', name: 'SQL', sortOrder: 2 },
    ],
  });

  // Verifix Настройки справочники (mega-nav dict= codes)
  const knownDicts: { code: string; name: string; kind: string; items: { code: string; name: string }[] }[] = [
    { code: 'edu', name: 'Виды образования', kind: 'core', items: [{ code: 'HIGH', name: 'Высшее' }] },
    { code: 'institutions', name: 'Учебные заведения', kind: 'core', items: [{ code: 'NUU', name: 'НУУз' }] },
    { code: 'specialties', name: 'Специальности', kind: 'core', items: [{ code: 'IT', name: 'Информатика' }] },
    { code: 'doc_types', name: 'Типы документов', kind: 'core', items: [{ code: 'PASSPORT', name: 'Паспорт' }] },
    { code: 'labor_functions', name: 'Трудовые функции', kind: 'core', items: [{ code: 'MGMT', name: 'Управление' }] },
    { code: 'science', name: 'Отрасли наук', kind: 'core', items: [{ code: 'TECH', name: 'Технические' }] },
    { code: 'languages', name: 'Языки', kind: 'core', items: [{ code: 'UZ', name: 'Узбекский' }, { code: 'RU', name: 'Русский' }] },
    { code: 'lang_levels', name: 'Степени знания языка', kind: 'core', items: [{ code: 'B1', name: 'B1' }, { code: 'C1', name: 'C1' }] },
    { code: 'certificates', name: 'Виды справок', kind: 'core', items: [{ code: 'WORK', name: 'С места работы' }] },
    { code: 'kinship', name: 'Степени родства', kind: 'core', items: [{ code: 'SPOUSE', name: 'Супруг(а)' }] },
    { code: 'marital', name: 'Состояния в браке', kind: 'core', items: [{ code: 'MARRIED', name: 'Женат / замужем' }] },
    { code: 'tenure', name: 'Виды стажа', kind: 'core', items: [{ code: 'TOTAL', name: 'Общий' }] },
    { code: 'awards', name: 'Награды', kind: 'core', items: [{ code: 'HONOR', name: 'Почётная грамота' }] },
    { code: 'inventory_types', name: 'Типы инвентаря', kind: 'core', items: [{ code: 'PC', name: 'Компьютер' }] },
    { code: 'inventory', name: 'Инвентари', kind: 'core', items: [{ code: 'LAPTOP-01', name: 'Ноутбук' }] },
    { code: 'cars', name: 'Список автомобилей', kind: 'core', items: [{ code: '01A001AA', name: 'Cobalt' }] },
    { code: 'trip_reasons', name: 'Причины ухода в командировку', kind: 'extra', items: [{ code: 'CLIENT', name: 'Встреча с клиентом' }] },
    { code: 'sick_reasons', name: 'Причины ухода на больничный', kind: 'extra', items: [{ code: 'ILLNESS', name: 'Заболевание' }] },
    { code: 'employment_sources', name: 'Источники занятости', kind: 'extra', items: [{ code: 'HH', name: 'HeadHunter' }] },
    { code: 'indicators', name: 'Показатели', kind: 'extra', items: [{ code: 'KPI', name: 'KPI' }] },
    { code: 'avg_salary', name: 'Средние зарплаты', kind: 'extra', items: [] },
    {
      code: 'coa',
      name: 'План счетов',
      kind: 'extra',
      items: [
        { code: '0000', name: 'Остатки' },
        { code: '1010', name: 'Сырье и материалы' },
        { code: '5010', name: 'Денежные средства в национальной валюте' },
        { code: '5110', name: 'Расчетный счет' },
        { code: '6710', name: 'Расчеты с персоналом по оплате труда' },
        { code: '6520', name: 'Платежи в Пенсионный фонд' },
        { code: '6410', name: 'Подоходный налог' },
        { code: '9010', name: 'Доходы от реализации готовой продукции' },
      ],
    },
    { code: 'cashboxes', name: 'Кассы', kind: 'extra', items: [{ code: 'MAIN', name: 'Основная касса' }] },
    {
      code: 'currencies',
      name: 'Валюты',
      kind: 'extra',
      items: [
        { code: '860', name: 'Узбекский сум' },
        { code: '840', name: 'Доллар США' },
        { code: '978', name: 'Евро' },
        { code: '398', name: 'Казахстанский тенге' },
        { code: '417', name: 'Киргизский сом' },
        { code: '944', name: 'Азербайджанский манат' },
        { code: 'UZS', name: 'Узбекский сум' },
        { code: 'USD', name: 'Доллар США' },
      ],
    },
    { code: 'nationality', name: 'Национальность', kind: 'extra', items: [
      { code: 'UZB', name: 'Узбек' },
      { code: 'AUTO_ARM', name: 'ARMAN' },
      { code: 'AUTO_AZE', name: 'AZARBAYJAN' },
      { code: 'AUTO_KAZ', name: 'казах' },
      { code: 'AUTO_TJK', name: 'таджик' },
    ] },
    { code: 'orgs', name: 'Организации', kind: 'admin', items: [
      { code: 'ADMIN', name: 'Администрирование' },
      { code: 'LALAKU', name: 'Lalaku' },
      { code: 'QOQON', name: 'Zavod QOQON' },
      { code: 'ZAV1', name: 'ZAVOD_1' },
      { code: 'ZAV2', name: 'ZAVOD_2' },
      { code: 'DEMO', name: 'Demo Company LLC' },
    ] },
    { code: 'legal_entities', name: 'Юридические лица', kind: 'admin', items: [
      { code: 'LE_DEMO', name: 'Demo Company LLC' },
      { code: 'LE_LALAKU', name: 'Lalaku' },
    ] },
    { code: 'app_roles', name: 'Роли', kind: 'admin', items: [
      { code: 'HR', name: 'HR-менеджер' },
      { code: 'MGR', name: 'Руководитель' },
      { code: 'EMP', name: 'Сотрудник' },
      { code: 'ACC', name: 'Бухгалтер' },
      { code: 'ADMIN', name: 'ADMIN' },
      { code: 'BOSHLIQ', name: 'boshliq' },
    ] },
    { code: 'countries', name: 'Страны', kind: 'admin', items: [
      { code: 'UZ', name: 'Узбекистан' },
      { code: 'KZ', name: 'Казахстан' },
      { code: 'KG', name: 'Кыргызстан' },
      { code: 'TJ', name: 'Таджикистан' },
      { code: 'RU', name: 'Россия' },
      { code: 'CV', name: 'Кабо-Верде' },
      { code: 'KH', name: 'Камбоджа' },
      { code: 'CM', name: 'Камерун' },
      { code: 'CA', name: 'Канада' },
      { code: 'CN', name: 'Китай' },
    ] },
    { code: 'regions', name: 'Регионы', kind: 'admin', items: [
      { code: 'TAS', name: 'г. Ташкент' },
      { code: 'SAM', name: 'Самаркандская область' },
      { code: 'AND', name: 'Андижанская область' },
      { code: 'QQR', name: 'Республика Каракалпакстан' },
      { code: 'BUX', name: 'Бухарская область' },
      { code: 'FER', name: 'Ферганская область' },
      { code: 'NAM', name: 'Наманганская область' },
      { code: 'NAV', name: 'Навоийская область' },
    ] },
    { code: 'banks', name: 'Банки', kind: 'admin', items: [{ code: 'NBU', name: 'НБУ' }] },
  ];
  for (const def of knownDicts) {
    const d = await prisma.dictionary.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: def.code } },
      update: { name: def.name, kind: def.kind },
      create: { tenantId: tenant.id, code: def.code, name: def.name, kind: def.kind },
    });
    for (let i = 0; i < def.items.length; i++) {
      const it = def.items[i];
      await prisma.dictionaryItem.upsert({
        where: {
          dictionaryId_code: { dictionaryId: d.id, code: it.code },
        },
        update: { name: it.name, sortOrder: i + 1, isActive: true },
        create: {
          dictionaryId: d.id,
          code: it.code,
          name: it.name,
          sortOrder: i + 1,
        },
      });
    }
  }

  // Link employees → regions (admin dictionary) + demo birthdays near today
  const regionsDict = await prisma.dictionary.findFirst({
    where: { tenantId: tenant.id, code: 'regions' },
    include: { items: true },
  });
  const regionTashkent = regionsDict?.items.find((i) => i.code === 'TAS');
  const regionSamarkand = regionsDict?.items.find((i) => i.code === 'SAM');
  if (regionTashkent) {
    await prisma.employee.update({
      where: { id: emp1.id },
      data: { regionId: regionTashkent.id },
    });
  }
  if (regionSamarkand) {
    await prisma.employee.update({
      where: { id: emp2.id },
      data: { regionId: regionSamarkand.id },
    });
  }

  const todayBd = new Date();
  const bdSoon = new Date(
    Date.UTC(1992, todayBd.getMonth(), todayBd.getDate()),
  );
  const bdTomorrow = new Date(
    Date.UTC(1988, todayBd.getMonth(), todayBd.getDate() + 1),
  );
  await prisma.person.update({
    where: { id: person1.id },
    data: { birthDate: bdSoon },
  });
  const person2 = await prisma.person.upsert({
    where: { id: '00000000-0000-4000-8000-000000000002' },
    update: {
      birthDate: bdTomorrow,
      firstName: 'Dilnoza',
      lastName: 'Rahimova',
    },
    create: {
      id: '00000000-0000-4000-8000-000000000002',
      tenantId: tenant.id,
      firstName: 'Dilnoza',
      lastName: 'Rahimova',
      gender: 'F',
      birthDate: bdTomorrow,
    },
  });
  await prisma.employee.update({
    where: { id: emp2.id },
    data: { personId: person2.id },
  });
  const empGphEarly = await prisma.employee.findFirst({
    where: { tenantId: tenant.id, tabNumber: 'GPH-01' },
  });
  if (regionTashkent && empGphEarly) {
    await prisma.employee.update({
      where: { id: empGphEarly.id },
      data: { regionId: regionTashkent.id },
    });
  }

  // Verifix-like demo roster (ФИО + пол + регион + фото-плейсхолдер)
  const regionByCode = (code: string) =>
    regionsDict?.items.find((i) => i.code === code)?.id;
  const posWarehouse = await prisma.position.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'WH' } },
    update: {},
    create: { tenantId: tenant.id, code: 'WH', name: 'КЛАДОВЩИК' },
  });
  const posDelivery = await prisma.position.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'DLV' } },
    update: {},
    create: { tenantId: tenant.id, code: 'DLV', name: 'ДОСТАВЩИК' },
  });
  const posTp = await prisma.position.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'TP' } },
    update: {},
    create: { tenantId: tenant.id, code: 'TP', name: 'ТП' },
  });
  const divLogNukus = await prisma.division.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'LOG_NUK' } },
    update: { parentId: ops.id },
    create: {
      tenantId: tenant.id,
      code: 'LOG_NUK',
      name: 'ЛОГИСТИКА НУКУС',
      parentId: ops.id,
    },
  });
  const divMonno = await prisma.division.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'MONNO' } },
    update: { parentId: ops.id },
    create: {
      tenantId: tenant.id,
      code: 'MONNO',
      name: 'MONNO',
      parentId: ops.id,
    },
  });
  const divDelux = await prisma.division.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'DELUX' } },
    update: { parentId: ops.id },
    create: {
      tenantId: tenant.id,
      code: 'DELUX',
      name: 'DELUX',
      parentId: ops.id,
    },
  });
  const divLalaku = await prisma.division.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'LALAKU' } },
    update: { parentId: ops.id },
    create: {
      tenantId: tenant.id,
      code: 'LALAKU',
      name: 'LALAKU MAMA',
      parentId: ops.id,
    },
  });

  const verifixRoster: Array<{
    tab: string;
    firstName: string;
    lastName: string;
    gender: 'M' | 'F';
    region: string;
    divisionId: string;
    positionId: string;
    personSuffix: string;
  }> = [
    {
      tab: '0000000575',
      firstName: 'Махмуд',
      lastName: 'Абдиганиев',
      gender: 'M',
      region: 'QQR',
      divisionId: divLogNukus.id,
      positionId: posDelivery.id,
      personSuffix: '0101',
    },
    {
      tab: '0000004515',
      firstName: 'Мадина',
      lastName: 'Абдугаппарова',
      gender: 'F',
      region: 'TAS',
      divisionId: divMonno.id,
      positionId: posTp.id,
      personSuffix: '0102',
    },
    {
      tab: '0000001203',
      firstName: 'Жасур',
      lastName: 'Абдуллаев',
      gender: 'M',
      region: 'SAM',
      divisionId: divDelux.id,
      positionId: posWarehouse.id,
      personSuffix: '0103',
    },
    {
      tab: '0000000888',
      firstName: 'Нилуфар',
      lastName: 'Алимова',
      gender: 'F',
      region: 'AND',
      divisionId: divLalaku.id,
      positionId: posHr.id,
      personSuffix: '0104',
    },
    {
      tab: '0000002311',
      firstName: 'Бобур',
      lastName: 'Исмаилов',
      gender: 'M',
      region: 'BUX',
      divisionId: divMonno.id,
      positionId: posDelivery.id,
      personSuffix: '0105',
    },
    {
      tab: '0000003422',
      firstName: 'Сабина',
      lastName: 'Каримова',
      gender: 'F',
      region: 'FER',
      divisionId: divDelux.id,
      positionId: posTp.id,
      personSuffix: '0106',
    },
    {
      tab: '0000004533',
      firstName: 'Ойбек',
      lastName: 'Рахимов',
      gender: 'M',
      region: 'NAM',
      divisionId: divLogNukus.id,
      positionId: posWarehouse.id,
      personSuffix: '0107',
    },
    {
      tab: '0000005644',
      firstName: 'Дилшод',
      lastName: 'Усманов',
      gender: 'M',
      region: 'NAV',
      divisionId: ops.id,
      positionId: posDelivery.id,
      personSuffix: '0108',
    },
    {
      tab: '0000006755',
      firstName: 'Зарина',
      lastName: 'Юлдашева',
      gender: 'F',
      region: 'TAS',
      divisionId: hr.id,
      positionId: posHr.id,
      personSuffix: '0109',
    },
    {
      tab: '0000007866',
      firstName: 'Шерзод',
      lastName: 'Хасанов',
      gender: 'M',
      region: 'SAM',
      divisionId: it.id,
      positionId: posDev.id,
      personSuffix: '0110',
    },
  ];

  for (const row of verifixRoster) {
    const personId = `00000000-0000-4000-8000-00000000${row.personSuffix}`;
    const person = await prisma.person.upsert({
      where: { id: personId },
      update: {
        firstName: row.firstName,
        lastName: row.lastName,
        gender: row.gender,
      },
      create: {
        id: personId,
        tenantId: tenant.id,
        firstName: row.firstName,
        lastName: row.lastName,
        gender: row.gender,
      },
    });
    const emp = await prisma.employee.upsert({
      where: {
        tenantId_tabNumber: { tenantId: tenant.id, tabNumber: row.tab },
      },
      update: {
        personId: person.id,
        firstName: row.firstName,
        lastName: row.lastName,
        divisionId: row.divisionId,
        positionId: row.positionId,
        regionId: regionByCode(row.region),
        scheduleId: schedule.id,
        status: 'active',
      },
      create: {
        tenantId: tenant.id,
        personId: person.id,
        tabNumber: row.tab,
        firstName: row.firstName,
        lastName: row.lastName,
        divisionId: row.divisionId,
        positionId: row.positionId,
        regionId: regionByCode(row.region),
        scheduleId: schedule.id,
        hiredAt: new Date('2024-03-01'),
        externalId: `face-${row.tab}`,
      },
    });
    const photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
      `${row.firstName}+${row.lastName}`,
    )}&background=1bc5bd&color=fff&size=64`;
    await prisma.faceProfile.upsert({
      where: { employeeId: emp.id },
      update: { photoUrl },
      create: {
        tenantId: tenant.id,
        employeeId: emp.id,
        photoUrl,
        syncStatus: 'pending',
      },
    });
  }

  // Verifix: кадровые документы for roster (hire + sample dismiss)
  const rosterEmps = await prisma.employee.findMany({
    where: { tenantId: tenant.id, status: 'active' },
    orderBy: { tabNumber: 'asc' },
    take: 18,
  });
  let docSeq = 8710;
  for (const emp of rosterEmps) {
    const hasHire = await prisma.hrDocument.findFirst({
      where: { tenantId: tenant.id, employeeId: emp.id, type: DocumentType.hire },
    });
    if (hasHire) continue;
    docSeq += 1;
    await prisma.hrDocument.create({
      data: {
        tenantId: tenant.id,
        employeeId: emp.id,
        type: DocumentType.hire,
        title: 'Прием на работу',
        number: String(docSeq).padStart(10, '0'),
        documentDate: emp.hiredAt || new Date('2024-03-01'),
        status: DocumentLifecycle.posted,
        postedAt: emp.hiredAt || new Date('2024-03-01'),
        postedBy: 'admin@demo.local',
        payload: {
          previousStatus: 'active',
          divisionId: emp.divisionId,
          positionId: emp.positionId,
        },
      },
    });
  }
  if (rosterEmps[3]) {
    await prisma.hrDocument.create({
      data: {
        tenantId: tenant.id,
        employeeId: rosterEmps[3].id,
        type: DocumentType.dismiss,
        title: 'Увольнение',
        number: String(docSeq + 1).padStart(10, '0'),
        documentDate: new Date(),
        status: DocumentLifecycle.draft,
        payload: {},
      },
    });
  }

  // Free физлица for «Прикрепить»
  const freePersons = [
    { id: '00000000-0000-4000-8000-000000000201', firstName: 'Азиз', lastName: 'Тохиров', gender: 'M' as const },
    { id: '00000000-0000-4000-8000-000000000202', firstName: 'Малика', lastName: 'Эргашева', gender: 'F' as const },
    { id: '00000000-0000-4000-8000-000000000203', firstName: 'Жамшид', lastName: 'Норматов', gender: 'M' as const },
  ];
  for (const fp of freePersons) {
    await prisma.person.upsert({
      where: { id: fp.id },
      update: {
        firstName: fp.firstName,
        lastName: fp.lastName,
        gender: fp.gender,
      },
      create: {
        id: fp.id,
        tenantId: tenant.id,
        firstName: fp.firstName,
        lastName: fp.lastName,
        gender: fp.gender,
      },
    });
  }

  // Verifix org chart: HR → ADMIN
  const posHrd = await prisma.position.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'HRD' } },
    update: { name: 'HRD' },
    create: { tenantId: tenant.id, code: 'HRD', name: 'HRD' },
  });
  const divHrChart = await prisma.division.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'HR' } },
    update: { name: 'HR', parentId: hq.id, isActive: true },
    create: {
      tenantId: tenant.id,
      code: 'HR',
      name: 'HR',
      parentId: hq.id,
    },
  });
  const divAdmin = await prisma.division.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'ADMIN' } },
    update: { name: 'ADMIN', parentId: divHrChart.id, isActive: true },
    create: {
      tenantId: tenant.id,
      code: 'ADMIN',
      name: 'ADMIN',
      parentId: divHrChart.id,
    },
  });
  const mgrPerson = await prisma.person.upsert({
    where: { id: '00000000-0000-4000-8000-000000000301' },
    update: {
      firstName: 'Нафиса',
      lastName: 'Абдусаттарова',
      middleName: 'П.',
      gender: 'F',
    },
    create: {
      id: '00000000-0000-4000-8000-000000000301',
      tenantId: tenant.id,
      firstName: 'Нафиса',
      lastName: 'Абдусаттарова',
      middleName: 'П.',
      gender: 'F',
    },
  });
  const mgrEmp = await prisma.employee.upsert({
    where: {
      tenantId_tabNumber: { tenantId: tenant.id, tabNumber: '0000000100' },
    },
    update: {
      personId: mgrPerson.id,
      firstName: 'Нафиса',
      lastName: 'Абдусаттарова',
      middleName: 'П.',
      divisionId: divHrChart.id,
      positionId: posHrd.id,
      scheduleId: schedule.id,
      status: 'active',
    },
    create: {
      tenantId: tenant.id,
      personId: mgrPerson.id,
      tabNumber: '0000000100',
      firstName: 'Нафиса',
      lastName: 'Абдусаттарова',
      middleName: 'П.',
      divisionId: divHrChart.id,
      positionId: posHrd.id,
      scheduleId: schedule.id,
      hiredAt: new Date('2020-01-10'),
      externalId: 'face-hrd-100',
    },
  });
  const mgrPhoto = `https://ui-avatars.com/api/?name=${encodeURIComponent('Нафиса+Абдусаттарова')}&background=1b3a5f&color=fff&size=64`;
  await prisma.faceProfile.upsert({
    where: { employeeId: mgrEmp.id },
    update: { photoUrl: mgrPhoto },
    create: {
      tenantId: tenant.id,
      employeeId: mgrEmp.id,
      photoUrl: mgrPhoto,
      syncStatus: 'pending',
    },
  });
  await prisma.division.update({
    where: { id: divHrChart.id },
    data: { managerId: mgrEmp.id },
  });
  // Put some demo staff under ADMIN for card avatars
  const adminTabs = ['0000000575', '0000004515', '0000001203', '0000000888', '0000002311'];
  for (const tab of adminTabs) {
    await prisma.employee.updateMany({
      where: { tenantId: tenant.id, tabNumber: tab },
      data: { divisionId: divAdmin.id },
    });
  }
  // Extra child stubs under ADMIN (Verifix "Кол-во подразделений: 7")
  for (let i = 1; i <= 7; i++) {
    const code = `ADM${i}`;
    await prisma.division.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code } },
      update: { parentId: divAdmin.id, name: `ADMIN-${i}`, isActive: true },
      create: {
        tenantId: tenant.id,
        code,
        name: `ADMIN-${i}`,
        parentId: divAdmin.id,
      },
    });
  }

  const extSystems = [
    { id: '00000000-0000-4000-8000-0000000000a1', name: 'Настройки ARTIX', sys: 'artix' },
    { id: '00000000-0000-4000-8000-0000000000a2', name: 'Настройки IIKO', sys: 'iiko' },
    { id: '00000000-0000-4000-8000-0000000000a3', name: 'Продажи IIKO', sys: 'iiko_sales' },
    { id: '00000000-0000-4000-8000-0000000000a4', name: 'Настройки Billz 2.0', sys: 'billz2' },
    { id: '00000000-0000-4000-8000-0000000000a5', name: 'Продажи Billz 1.0', sys: 'billz1' },
  ];
  for (const s of extSystems) {
    await prisma.externalIntegration.upsert({
      where: { id: s.id },
      update: { name: s.name },
      create: {
        id: s.id,
        tenantId: tenant.id,
        type: 'custom',
        name: s.name,
        config: { sys: s.sys },
        isActive: s.sys === 'artix' ? false : true,
      },
    });
  }

  await prisma.externalIntegration.upsert({
    where: { id: '00000000-0000-4000-8000-0000000000aa' },
    update: { isActive: true },
    create: {
      id: '00000000-0000-4000-8000-0000000000aa',
      tenantId: tenant.id,
      type: 'hikvision',
      name: 'Hikvision Device Gateway',
      config: { note: 'Mock + ISAPI' },
      isActive: true,
    },
  });

  await prisma.externalIntegration.upsert({
    where: { id: '00000000-0000-4000-8000-0000000000bb' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-0000000000bb',
      tenantId: tenant.id,
      type: 'webhook',
      name: 'ERP webhook',
      webhookUrl: 'https://example.local/hooks/hrhub',
      isActive: false,
    },
  });

  // —— Full catalog demo entities ——
  const grade1 = await prisma.grade.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'G1' } },
    update: {},
    create: { tenantId: tenant.id, code: 'G1', name: '1-разряд', level: 1 },
  });
  const grade2 = await prisma.grade.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'G2' } },
    update: {},
    create: { tenantId: tenant.id, code: 'G2', name: '2-разряд', level: 2 },
  });

  const divGroup = await prisma.divisionGroup.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'CORE' } },
    update: {},
    create: { tenantId: tenant.id, code: 'CORE', name: 'Asosiy bo‘limlar' },
  });
  await prisma.division.update({
    where: { id: hq.id },
    data: { divisionGroupId: divGroup.id },
  });

  const posGroup = await prisma.positionGroup.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'TECH' } },
    update: {},
    create: { tenantId: tenant.id, code: 'TECH', name: 'Texnik lavozimlar' },
  });
  await prisma.position.update({
    where: { id: posDev.id },
    data: { positionGroupId: posGroup.id },
  });

  const tariff = await prisma.tariffGroup.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'T-STD' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'T-STD',
      name: 'Standart tarif',
      gradeId: grade1.id,
      baseRate: 5000000,
    },
  });

  await prisma.tariffGroupApproval.create({
    data: {
      tenantId: tenant.id,
      tariffGroupId: tariff.id,
      status: 'approved',
      note: 'Seed tasdiq',
      reviewedAt: new Date(),
    },
  }).catch(() => undefined);

  await prisma.tariffGroupApproval.create({
    data: {
      tenantId: tenant.id,
      tariffGroupId: tariff.id,
      status: 'pending',
      note: 'Seed kutilmoqda — smoke approve/reject',
    },
  }).catch(() => undefined);

  const staffPosOpen = {
    status: 'occupied' as const,
    isActive: true,
    closedAt: null,
    openedAt: new Date('2020-01-01'),
    headcount: 2,
    divisionId: it.id,
    positionId: posDev.id,
    gradeId: grade2.id,
    tariffGroupId: tariff.id,
  };
  const staffPos = await prisma.staffPosition.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'SP-DEV-01' } },
    update: staffPosOpen,
    create: {
      tenantId: tenant.id,
      code: 'SP-DEV-01',
      title: 'Developer #1',
      ...staffPosOpen,
    },
  });

  await prisma.staffPosition.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'SP-HR-01' } },
    update: {
      status: 'occupied',
      isActive: true,
      closedAt: null,
      openedAt: new Date('2020-01-01'),
      headcount: 1,
      divisionId: hr.id,
      positionId: posHr.id,
      gradeId: grade1.id,
      tariffGroupId: tariff.id,
    },
    create: {
      tenantId: tenant.id,
      code: 'SP-HR-01',
      title: 'HR Manager #1',
      divisionId: hr.id,
      positionId: posHr.id,
      gradeId: grade1.id,
      tariffGroupId: tariff.id,
      headcount: 1,
      status: 'occupied',
      isActive: true,
      openedAt: new Date('2020-01-01'),
    },
  });

  await prisma.staffPosition.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'SP-OPS-01' } },
    update: {
      status: 'vacant',
      isActive: true,
      closedAt: null,
      openedAt: new Date('2020-01-01'),
      headcount: 3,
      divisionId: ops.id,
      positionId: posCourier.id,
    },
    create: {
      tenantId: tenant.id,
      code: 'SP-OPS-01',
      title: 'Courier #1',
      divisionId: ops.id,
      positionId: posCourier.id,
      headcount: 3,
      status: 'vacant',
      isActive: true,
      openedAt: new Date('2020-01-01'),
    },
  });

  await prisma.employee.update({
    where: { id: emp1.id },
    data: { staffPositionId: staffPos.id },
  });
  const staffHr = await prisma.staffPosition.findFirst({
    where: { tenantId: tenant.id, code: 'SP-HR-01' },
  });
  if (staffHr) {
    await prisma.employee.update({
      where: { id: emp2.id },
      data: { staffPositionId: staffHr.id },
    });
  }

  await prisma.dismissalReason.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'OWN' } },
    update: {},
    create: { tenantId: tenant.id, code: 'OWN', name: 'O‘z xohishi bilan' },
  });
  const dismissOwn = await prisma.dismissalReason.findFirst({
    where: { tenantId: tenant.id, code: 'OWN' },
  });

  await prisma.locationType.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'OFFICE' } },
    update: {},
    create: { tenantId: tenant.id, code: 'OFFICE', name: 'Ofis' },
  });

  await prisma.incidentType.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'LATE' } },
    update: { accrualName: 'Штраф за опоздание', isActive: true },
    create: {
      tenantId: tenant.id,
      code: 'LATE',
      name: 'Kechikish',
      accrualName: 'Штраф за опоздание',
      isActive: true,
    },
  });
  await prisma.incidentType.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'ABSENCE' } },
    update: { accrualName: 'Штраф за прогул', isActive: true },
    create: {
      tenantId: tenant.id,
      code: 'ABSENCE',
      name: 'Прогул',
      accrualName: 'Штраф за прогул',
      isActive: true,
    },
  });

  const clrTpl = await prisma.clearanceTemplate.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'EXIT' } },
    update: {
      divisionId: hq.id,
      positionId: posDev.id,
      requireManagerSign: true,
      requireHigherManagerSign: false,
    },
    create: {
      tenantId: tenant.id,
      code: 'EXIT',
      name: 'Ishdan bo‘shash obxodnoy',
      divisionId: hq.id,
      positionId: posDev.id,
      requireManagerSign: true,
      requireHigherManagerSign: false,
      employees: {
        create: [{ employeeId: emp1.id, sortOrder: 0 }],
      },
      items: {
        create: [
          { title: 'IT texnika topshirish', department: 'IT', sortOrder: 1 },
          { title: 'Buxgalteriya', department: 'Finance', sortOrder: 2 },
          { title: 'HR kartochka', department: 'HR', sortOrder: 3 },
        ],
      },
    },
  });
  await prisma.clearanceTemplateEmployee.deleteMany({ where: { templateId: clrTpl.id } });
  await prisma.clearanceTemplateEmployee.create({
    data: { templateId: clrTpl.id, employeeId: emp1.id, sortOrder: 0 },
  });

  const career = await prisma.careerPath.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'DEV-PATH' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'DEV-PATH',
      name: 'Developer growth',
      steps: {
        create: [
          { title: 'Junior', positionId: posDev.id, gradeId: grade1.id, sortOrder: 1, minMonths: 6 },
          { title: 'Middle', positionId: posDev.id, gradeId: grade2.id, sortOrder: 2, minMonths: 18 },
        ],
      },
    },
  });

  await prisma.salesCommissionPolicy.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.salesCommissionPolicy.create({
    data: {
      tenantId: tenant.id,
      positionId: posDev.id,
      personalPercent: 5,
      divisionPercent: 2,
    },
  });

  const pairDefs = [
    {
      code: 'CLIENT',
      name: 'Взаиморасчеты с клиентами',
      debitAccount: '4010. Счета к получению от покупателей и заказчиков',
      creditAccount: '6310. Авансы, полученные от покупателей и заказчиков',
      sortOrder: 1,
    },
    {
      code: 'SUPPLIER',
      name: 'Взаиморасчеты с поставщиками',
      debitAccount: '4310. Авансы, выданные поставщикам и подрядчикам',
      creditAccount: '6010. Счета к оплате поставщикам и подрядчикам',
      sortOrder: 2,
    },
    {
      code: 'VAT',
      name: 'Взаиморасчеты с НДС',
      debitAccount: '4412. Налог на добавленную стоимость (НДС) (авансовый платеж)',
      creditAccount: '6412. Налог на добавленную стоимость (НДС)',
      sortOrder: 3,
    },
  ];
  for (const p of pairDefs) {
    await prisma.accountPair.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: p.code } },
      update: {
        name: p.name,
        debitAccount: p.debitAccount,
        creditAccount: p.creditAccount,
        sortOrder: p.sortOrder,
        isActive: true,
      },
      create: { tenantId: tenant.id, ...p, isActive: true },
    });
  }
  await prisma.accountPair.updateMany({
    where: { tenantId: tenant.id, code: 'AP-1' },
    data: { isActive: false },
  });

  await prisma.timeType.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'WRK' } },
    update: {},
    create: { tenantId: tenant.id, code: 'WRK', name: 'Ish vaqti', isPaid: true },
  });

  await prisma.scheduleShift.upsert({
    where: { scheduleId_code: { scheduleId: schedule.id, code: 'A' } },
    update: {},
    create: {
      tenantId: tenant.id,
      scheduleId: schedule.id,
      code: 'A',
      name: 'Smena A',
      startTime: '09:00',
      endTime: '18:00',
      weekday: 1,
    },
  });

  const empGph = await prisma.employee.findFirst({
    where: { tenantId: tenant.id, tabNumber: 'GPH-01' },
  });
  if (!emp2 || !empGph) throw new Error('Seed employees missing');

  // —— New / unseen device for «Новые устройства» filter ——
  // The ONLY device matching filter=new: never seen + pre-operational status
  await prisma.device.upsert({
    where: {
      tenantId_serialNumber: { tenantId: tenant.id, serialNumber: 'NEW-UNSEEN-01' },
    },
    update: { status: 'new', lastSeenAt: null },
    create: {
      tenantId: tenant.id,
      locationId: loc.id,
      name: 'Yangi qurilma (kutilmoqda)',
      serialNumber: 'NEW-UNSEEN-01',
      adapterType: 'mock',
      status: 'new',
      isActive: true,
      lastSeenAt: null,
    },
  });

  // —— Late attendance days (lateness report + timesheet demo) ——
  const seedDay = (d: Date) => new Date(d.toISOString().slice(0, 10));
  const lateSeed = [
    { employeeId: emp2.id, daysAgo: 0, lateMinutes: 25 },
    { employeeId: emp1.id, daysAgo: 2, lateMinutes: 12 },
    { employeeId: emp2.id, daysAgo: 3, lateMinutes: 40 },
    { employeeId: emp1.id, daysAgo: 6, lateMinutes: 18 },
  ];
  for (const ls of lateSeed) {
    const workDate = seedDay(new Date(Date.now() - ls.daysAgo * 86400000));
    const firstInAt = new Date(workDate);
    firstInAt.setHours(9, 15 + ls.lateMinutes, 0, 0);
    await prisma.attendanceDay.upsert({
      where: {
        tenantId_employeeId_workDate: {
          tenantId: tenant.id,
          employeeId: ls.employeeId,
          workDate,
        },
      },
      create: {
        tenantId: tenant.id,
        employeeId: ls.employeeId,
        workDate,
        status: 'late',
        firstInAt,
        lateMinutes: ls.lateMinutes,
      },
      update: {
        status: 'late',
        firstInAt,
        lateMinutes: ls.lateMinutes,
      },
    });
  }
  // Matching IN mark for today's late arrival (emp2)
  await prisma.attendanceMark.deleteMany({
    where: { tenantId: tenant.id, employeeId: emp2.id },
  });
  const emp2LateIn = new Date();
  emp2LateIn.setHours(9, 40, 0, 0);
  await prisma.attendanceMark.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp2.id,
      employeeExternalId: 'face-0002',
      direction: 'IN',
      occurredAt: emp2LateIn,
      source: 'mock',
    },
  });

  // Absent / day-off rows for dashboard donut + table parity
  if (empGph) {
    const workDateToday = seedDay(new Date());
    await prisma.attendanceDay.upsert({
      where: {
        tenantId_employeeId_workDate: {
          tenantId: tenant.id,
          employeeId: empGph.id,
          workDate: workDateToday,
        },
      },
      create: {
        tenantId: tenant.id,
        employeeId: empGph.id,
        workDate: workDateToday,
        status: 'absent',
        lateMinutes: 0,
      },
      update: { status: 'absent', lateMinutes: 0, firstInAt: null, lastOutAt: null },
    });
  }
  // Extra active employee on day_off for donut segment
  const empDayOff = await prisma.employee.upsert({
    where: { tenantId_tabNumber: { tenantId: tenant.id, tabNumber: '0004' } },
    update: {},
    create: {
      tenantId: tenant.id,
      tabNumber: '0004',
      firstName: 'Malika',
      lastName: 'Yusupova',
      divisionId: hr.id,
      positionId: posHr.id,
      scheduleId: schedule.id,
      hiredAt: new Date('2024-08-01'),
      externalId: 'face-0004',
      regionId: regionTashkent?.id,
    },
  });
  await prisma.attendanceDay.upsert({
    where: {
      tenantId_employeeId_workDate: {
        tenantId: tenant.id,
        employeeId: empDayOff.id,
        workDate: seedDay(new Date()),
      },
    },
    create: {
      tenantId: tenant.id,
      employeeId: empDayOff.id,
      workDate: seedDay(new Date()),
      status: 'day_off',
      lateMinutes: 0,
    },
    update: { status: 'day_off', lateMinutes: 0, firstInAt: null, lastOutAt: null },
  });

  // —— Problem marks (проблемные отметки) ——
  await prisma.problemMark.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.problemMark.createMany({
    data: [
      {
        tenantId: tenant.id,
        reason: 'unknown_employee',
        payload: {
          employeeExternalId: 'face-9999',
          serialNumber: 'MOCK-001',
          direction: 'IN',
          occurredAt: new Date().toISOString(),
        },
        resolved: false,
      },
      {
        tenantId: tenant.id,
        reason: 'gps_out_of_range',
        payload: {
          employeeId: emp1.id,
          latitude: 41.355,
          longitude: 69.41,
          distanceM: 9120,
          radiusM: 200,
          locationId: loc.id,
        },
        resolved: false,
      },
      {
        tenantId: tenant.id,
        reason: 'gps_no_geofence',
        payload: { employeeId: emp2.id, latitude: 41.3111, longitude: 69.2797 },
        resolved: false,
      },
    ],
  });

  // —— Audit log entries (Настройки → Аудит) ——
  await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.auditLog.createMany({
    data: [
      {
        tenantId: tenant.id,
        userId: admin.id,
        action: 'auth.login',
        entity: 'User',
        entityId: admin.id,
        meta: { ip: '127.0.0.1', agent: 'seed' },
        createdAt: new Date(Date.now() - 2 * 3600000),
      },
      {
        tenantId: tenant.id,
        userId: admin.id,
        action: 'org.settings.update',
        entity: 'TenantSetting',
        meta: { fields: ['phone', 'address'] },
        createdAt: new Date(Date.now() - 90 * 60000),
      },
      {
        tenantId: tenant.id,
        userId: admin.id,
        action: 'user.create',
        entity: 'User',
        meta: { email: 'hr@demo.local', role: 'hr' },
        createdAt: new Date(Date.now() - 60 * 60000),
      },
      {
        tenantId: tenant.id,
        userId: admin.id,
        action: 'integration.sync',
        entity: 'ExternalIntegration',
        entityId: '00000000-0000-4000-8000-0000000000aa',
        meta: { webhookStatus: 'ok' },
        createdAt: new Date(Date.now() - 30 * 60000),
      },
      {
        tenantId: tenant.id,
        action: 'attendance.mark-absents',
        entity: 'AttendanceDay',
        meta: { checked: 3 },
        createdAt: new Date(Date.now() - 10 * 60000),
      },
    ],
  });

  // —— HR requests (all types + scopes) ——
  await prisma.hrRequest.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.hrRequest.createMany({
    data: [
      {
        tenantId: tenant.id,
        employeeId: emp1.id,
        type: 'hr_change',
        title: 'Lavozim o‘zgartirish arizasi',
        visibility: 'shared',
        createdByUserId: admin.id,
        status: 'pending',
      },
      {
        tenantId: tenant.id,
        employeeId: emp1.id,
        type: 'schedule_change',
        title: 'Grafik o‘zgartirish (09→10)',
        visibility: 'personal',
        createdByUserId: admin.id,
        status: 'pending',
        payload: {
          scheduleId: schedule.id,
          startDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        },
      },
      {
        tenantId: tenant.id,
        employeeId: emp2.id,
        type: 'roster_change',
        title: 'Расписание smena o‘zgartirish',
        visibility: 'shared',
        createdByUserId: admin.id,
        status: 'pending',
      },
      {
        tenantId: tenant.id,
        employeeId: emp1.id,
        type: 'overtime',
        title: 'Сверхурочные · 04:00 · Smena',
        visibility: 'inbox',
        createdByUserId: admin.id,
        assigneeUserId: admin.id,
        status: 'pending',
        payload: {
          requestDate: new Date().toISOString().slice(0, 10),
          startDate: new Date().toISOString().slice(0, 10),
          endDate: new Date().toISOString().slice(0, 10),
          overtimeTime: '04:00',
          hours: 4,
          timeType: 'Сверхурочные',
          note: 'Smena uchun overtime 4 soat',
        },
      },
      {
        tenantId: tenant.id,
        employeeId: emp2.id,
        type: 'location',
        title: `Локация · ${loc.name} · Masofaviy`,
        visibility: 'shared',
        createdByUserId: admin.id,
        status: 'pending',
        payload: {
          locationId: loc.id,
          locationName: loc.name,
          requestKind: 'full_day',
          requestDate: new Date().toISOString().slice(0, 10),
          startDate: new Date().toISOString().slice(0, 10),
          endDate: new Date().toISOString().slice(0, 10),
          note: 'Chirchiq filialini o‘rganish',
        },
      },
      {
        tenantId: tenant.id,
        employeeId: emp1.id,
        type: 'location',
        title: `Локация · ${loc.name} · Личный`,
        visibility: 'personal',
        createdByUserId: admin.id,
        status: 'pending',
        payload: {
          locationId: loc.id,
          locationName: loc.name,
          requestKind: 'part_day',
          requestDate: new Date().toISOString().slice(0, 10),
          startDate: new Date().toISOString().slice(0, 10),
          endDate: new Date().toISOString().slice(0, 10),
          startTime: '09:00',
          endTime: '13:00',
          note: 'Складга borish',
        },
      },
      {
        tenantId: tenant.id,
        employeeId: emp2.id,
        type: 'absence',
        title: 'Ta’til arizasi (HR request)',
        visibility: 'personal',
        createdByUserId: admin.id,
        status: 'pending',
        payload: {
          startDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          endDate: new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10),
          absenceTypeId: vac.id,
        },
      },
      {
        tenantId: tenant.id,
        employeeId: emp1.id,
        type: 'hr_change',
        title: 'Umumiy so‘rov — bo‘lim o‘tkazish',
        visibility: 'shared',
        status: 'approved',
      },
      {
        tenantId: tenant.id,
        employeeId: emp2.id,
        type: 'overtime',
        title: 'Сверхурочные · 02:00 · Available',
        visibility: 'shared',
        createdByUserId: admin.id,
        status: 'pending',
        payload: {
          requestDate: new Date().toISOString().slice(0, 10),
          startDate: new Date().toISOString().slice(0, 10),
          endDate: new Date().toISOString().slice(0, 10),
          overtimeTime: '02:00',
          hours: 2,
          timeType: 'Сверхурочные',
          note: 'Kechnik smena',
        },
      },
      {
        tenantId: tenant.id,
        employeeId: emp1.id,
        type: 'overtime',
        title: 'Сверхурочные · 01:30 · Личный',
        visibility: 'personal',
        createdByUserId: admin.id,
        status: 'pending',
        payload: {
          requestDate: new Date().toISOString().slice(0, 10),
          startDate: new Date().toISOString().slice(0, 10),
          endDate: new Date().toISOString().slice(0, 10),
          overtimeTime: '01:30',
          hours: 1.5,
          timeType: 'Сверхурочные',
          note: 'Hisobot yakunlash',
        },
      },
    ],
  });
  // location requests already use visibility shared

  await prisma.absence.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.absence.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp1.id,
      absenceTypeId: vac.id,
      startDate: new Date(Date.now() + 14 * 86400000),
      endDate: new Date(Date.now() + 17 * 86400000),
      status: 'draft',
      note: 'Demo ta’til',
      meta: {
        number: '00000091',
        documentType: 'Отпуск',
        documentDate: new Date().toISOString().slice(0, 10),
        requestDate: new Date().toISOString(),
      },
    },
  });

  const sickType = await prisma.absenceType.findFirst({
    where: { tenantId: tenant.id, code: 'SICK' },
  });
  if (sickType) {
    await prisma.absence.create({
      data: {
        tenantId: tenant.id,
        employeeId: emp1.id,
        absenceTypeId: sickType.id,
        startDate: new Date('2025-03-10'),
        endDate: new Date('2025-03-14'),
        status: 'approved',
        note: 'ОРВИ',
        meta: {
          number: 'BL-2025-0142',
          documentType: 'Больничный лист',
          documentDate: '2025-03-10',
          reason: 'ОРВИ',
          coefficient: 1,
        },
      },
    });
  }

  // Second employee vacation order
  await prisma.absence.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp2.id,
      absenceTypeId: vac.id,
      startDate: new Date('2026-06-01'),
      endDate: new Date('2026-06-14'),
      status: 'pending',
      note: 'Ежегодный отпуск',
      meta: {
        number: '00000092',
        documentType: 'Отпуск',
        documentDate: '2026-05-20',
      },
    },
  });

  await prisma.travelExpenseReport.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.internalTrip.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.internalTrip.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp1.id,
      title: 'Встреча с партнёрами',
      startDate: new Date('2025-05-12'),
      endDate: new Date('2025-05-15'),
      status: 'completed',
      requestStatus: 'approved',
      visibility: 'shared',
      note: 'Средства компании',
      meta: {
        organization: 'Samarqand 1',
        reason: 'Встреча с партнёрами',
        fundedBy: 'Средства компании',
      },
    },
  });

  // Clear any leave flags on today so Verifix calendar demo shows work hours.
  await prisma.attendanceDay.updateMany({
    where: {
      tenantId: tenant.id,
      employeeId: emp1.id,
      workDate: seedDay(new Date()),
      status: 'leave',
    },
    data: { status: 'on_time' },
  });

  const incidentType = await prisma.incidentType.findFirst({
    where: { tenantId: tenant.id, code: 'LATE' },
  });
  if (incidentType) {
    await prisma.incident.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.incident.create({
      data: {
        tenantId: tenant.id,
        employeeId: emp1.id,
        managerId: emp2.id,
        incidentTypeId: incidentType.id,
        number: 'ИНЦ-0001',
        title: 'ИНЦ-0001',
        description: 'Seed incident',
        note: 'Опоздание на 15 минут',
        action: 'verbal_warning',
        damageAmount: null,
        sendNotification: false,
        severity: 'low',
        status: 'open',
        occurredAt: new Date(),
      },
    });
  }

  await prisma.clearanceSheet.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.clearanceSheet.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp1.id,
      templateId: clrTpl.id,
      number: 'ОБ-0001',
      documentDate: new Date(),
      title: 'Obxodnoy — demo (in progress)',
      status: 'in_progress',
      items: {
        create: [
          { title: 'IT', department: 'IT', sortOrder: 1, status: 'pending' },
          { title: 'HR', department: 'HR', sortOrder: 2, status: 'done' },
          { title: 'Руководитель', sortOrder: 3, status: 'pending' },
        ],
      },
    },
  });
  // Ready to complete — all items done
  await prisma.clearanceSheet.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp2.id,
      templateId: clrTpl.id,
      number: 'ОБ-0002',
      documentDate: new Date(),
      title: 'Obxodnoy — complete-ready',
      status: 'in_progress',
      items: {
        create: [
          { title: 'IT', department: 'IT', sortOrder: 1, status: 'done' },
          { title: 'HR', department: 'HR', sortOrder: 2, status: 'skipped' },
        ],
      },
    },
  });

  await prisma.employeeNameChange.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.employeeNameChange.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp2.id,
      status: 'posted',
      oldLastName: 'Rahimova',
      oldFirstName: 'Dilnoza',
      newLastName: 'Karimova',
      newFirstName: 'Dilnoza',
      effectiveAt: new Date('2025-01-10'),
      documentNumber: 'NC-1',
      note: 'Seed posted',
      postedAt: new Date('2025-01-10'),
    },
  });
  await prisma.employeeNameChange.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp1.id,
      status: 'draft',
      oldLastName: emp1.lastName,
      oldFirstName: emp1.firstName,
      newLastName: 'Karimov',
      newFirstName: 'Alijon',
      effectiveAt: new Date(),
      documentNumber: 'NC-DRAFT',
      note: 'Draft — post qilinishi kerak',
    },
  });

  await prisma.wageChange.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.wageChange.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp1.id,
      status: 'posted',
      oldAmount: 4500000,
      newAmount: 5000000,
      effectiveAt: new Date('2025-06-01'),
      reason: 'Indexatsiya',
      documentNumber: 'WC-1',
      postedAt: new Date('2025-06-01'),
    },
  });
  await prisma.wageChange.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp2.id,
      status: 'draft',
      oldAmount: 4000000,
      newAmount: 4500000,
      effectiveAt: new Date(),
      reason: 'Draft oylik oshirish',
      documentNumber: 'WC-DRAFT',
    },
  });
  await prisma.wageChange.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp1.id,
      status: 'posted',
      oldAmount: 5000000,
      newAmount: 5500000,
      effectiveAt: new Date('2026-01-15'),
      reason: 'Attestatsiya',
      documentNumber: 'WC-2',
      postedAt: new Date('2026-01-15'),
    },
  });

  await prisma.employeeGradeHistory.deleteMany({ where: { tenantId: tenant.id } });
  const dayOnly = (d: Date) => new Date(d.toISOString().slice(0, 10));
  await prisma.employeeGradeHistory.createMany({
    data: [
      {
        tenantId: tenant.id,
        employeeId: emp1.id,
        gradeId: grade1.id,
        effectiveAt: new Date('2025-03-01'),
        note: 'Boshlang‘ich razryad',
      },
      {
        tenantId: tenant.id,
        employeeId: emp1.id,
        gradeId: grade2.id,
        effectiveAt: dayOnly(new Date(Date.now() - 45 * 86400000)),
        note: 'Junior → Middle',
      },
      {
        tenantId: tenant.id,
        employeeId: emp2.id,
        gradeId: grade2.id,
        effectiveAt: dayOnly(new Date()),
        note: 'Yillik attestatsiya bo‘yicha oshirish',
      },
    ],
  });

  await prisma.timesheetAdjustment.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.timesheetCorrectionLine.deleteMany({
    where: { correction: { tenantId: tenant.id } },
  });
  await prisma.timesheetCorrection.deleteMany({ where: { tenantId: tenant.id } });

  const periodFrom = new Date();
  periodFrom.setUTCDate(1);
  const periodTo = new Date();

  await prisma.timesheetCorrection.create({
    data: {
      tenantId: tenant.id,
      status: 'draft',
      documentDate: new Date(),
      number: 'КТ-0001',
      title: 'Корректировка табеля',
      divisionId: emp1.divisionId ?? ops.id,
      periodFrom,
      periodTo,
      meta: {
        outsideLimit: 'Без ограничений',
        countLunch: true,
        countBefore: false,
        countAfter: false,
        beforeLimit: 'Без ограничений',
        afterLimit: 'Без ограничений',
      },
      lines: {
        create: [
          {
            employeeId: emp1.id,
            sortOrder: 0,
            plannedHours: 160,
            workedHours: 158,
            onTimeHours: 150,
            overtimeHours: 8,
          },
        ],
      },
    },
  });

  await prisma.timesheetCorrection.create({
    data: {
      tenantId: tenant.id,
      status: 'posted',
      documentDate: new Date(Date.now() - 5 * 86400000),
      number: 'КТ-0002',
      title: 'Корректировка табеля списком',
      divisionId: emp2.divisionId ?? ops.id,
      periodFrom,
      periodTo,
      postedAt: new Date(Date.now() - 4 * 86400000),
      postedBy: admin.email,
      meta: { outsideLimit: 'Без ограничений' },
      lines: {
        create: [
          { employeeId: emp1.id, sortOrder: 0, plannedHours: 80, workedHours: 80 },
          { employeeId: emp2.id, sortOrder: 1, plannedHours: 80, workedHours: 76 },
        ],
      },
    },
  });

  const adjDay = (offset: number) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - offset);
    return d;
  };
  await prisma.timesheetAdjustment.createMany({
    data: [
      {
        tenantId: tenant.id,
        employeeId: emp1.id,
        workDate: adjDay(2),
        oldStatus: 'on_time',
        newStatus: 'late',
        reason: 'Корректировка табеля',
        createdBy: admin.email,
      },
      {
        tenantId: tenant.id,
        employeeId: emp1.id,
        workDate: adjDay(1),
        oldStatus: 'on_time',
        newStatus: 'absent',
        reason: 'Корректировка табеля',
        createdBy: admin.email,
      },
      {
        tenantId: tenant.id,
        employeeId: emp2.id,
        workDate: adjDay(1),
        oldStatus: 'late',
        newStatus: 'on_time',
        reason: 'Корректировка табеля списком',
        createdBy: admin.email,
      },
    ],
  });

  await prisma.hrChangeRequestLine.deleteMany({
    where: { request: { tenantId: tenant.id } },
  });
  await prisma.hrChangeRequest.deleteMany({ where: { tenantId: tenant.id } });

  await prisma.hrChangeRequest.create({
    data: {
      tenantId: tenant.id,
      kind: 'open_position',
      status: 'draft',
      number: 'ЗКИ-0001',
      requestDate: new Date(),
      title: 'Открытие позиции Backend Developer',
      divisionId: it.id,
      positionId: posDev.id,
      effectiveDate: new Date(),
      quantity: 2,
      note: 'Расширение команды',
      createdByUserId: admin.id,
      createdByLabel: admin.email,
    },
  });

  await prisma.hrChangeRequest.create({
    data: {
      tenantId: tenant.id,
      kind: 'hire',
      status: 'pending',
      number: 'ЗКИ-0002',
      requestDate: new Date(),
      title: 'Прием на работу',
      divisionId: it.id,
      positionId: posDev.id,
      staffPositionId: staffPos.id,
      effectiveDate: new Date(),
      employmentType: 'staff',
      candidateGender: 'male',
      candidateFirstName: 'Sardor',
      candidateLastName: 'Aliyev',
      candidateMiddleName: 'Bahromovich',
      createdByUserId: admin.id,
      createdByLabel: admin.email,
    },
  });

  await prisma.hrChangeRequest.create({
    data: {
      tenantId: tenant.id,
      kind: 'transfer',
      status: 'draft',
      number: 'ЗКИ-0003',
      requestDate: new Date(),
      title: 'Кадровый перевод',
      employeeId: emp2.id,
      divisionId: it.id,
      positionId: posDev.id,
      staffPositionId: staffPos.id,
      effectiveDate: new Date(),
      employmentType: 'staff',
      createdByUserId: admin.id,
      createdByLabel: admin.email,
    },
  });

  await prisma.hrChangeRequest.create({
    data: {
      tenantId: tenant.id,
      kind: 'transfer_batch',
      status: 'draft',
      number: 'ЗКИ-0004',
      requestDate: new Date(),
      title: 'Кадровый перевод списком',
      createdByUserId: admin.id,
      createdByLabel: admin.email,
      lines: {
        create: [
          {
            employeeId: emp1.id,
            sortOrder: 0,
            effectiveDate: new Date(),
            staffPositionId: staffPos.id,
            note: 'В IT',
          },
          {
            employeeId: emp2.id,
            sortOrder: 1,
            effectiveDate: new Date(),
            staffPositionId: staffPos.id,
          },
        ],
      },
    },
  });

  await prisma.hrChangeRequest.create({
    data: {
      tenantId: tenant.id,
      kind: 'dismiss',
      status: 'draft',
      number: 'ЗКИ-0005',
      requestDate: new Date(),
      title: 'Увольнение',
      employeeId: emp2.id,
      effectiveDate: new Date(Date.now() + 14 * 86400000),
      dismissalReasonId: dismissOwn?.id,
      note: 'По собственному желанию',
      createdByUserId: admin.id,
      createdByLabel: admin.email,
    },
  });

  await prisma.gphService.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.gphContract.deleteMany({ where: { tenantId: tenant.id } });
  const gph = await prisma.gphContract.create({
    data: {
      tenantId: tenant.id,
      employeeId: empGph.id,
      divisionId: empGph.divisionId ?? ops.id,
      personId: empGph.personId ?? undefined,
      number: 'GPH-2026-01',
      title: 'Kuryer xizmati',
      startDate: new Date('2025-03-01'),
      amount: 3000000,
      allowAddService: true,
      status: 'posted',
      postedAt: new Date('2025-03-01'),
      postedBy: 'admin@demo.local',
      isActive: true,
      services: {
        create: [
          {
            tenantId: tenant.id,
            code: 'DELIV',
            name: 'Yetkazib berish',
            unitPrice: 25000,
            unit: 'trip',
          },
        ],
      },
    },
  });
  // Second draft contract for demo
  await prisma.gphContract.create({
    data: {
      tenantId: tenant.id,
      employeeId: empGph.id,
      divisionId: empGph.divisionId ?? ops.id,
      personId: empGph.personId ?? undefined,
      number: 'GPH-2026-02',
      title: 'Konsultatsiya',
      startDate: new Date(),
      amount: 1500000,
      allowAddService: true,
      status: 'draft',
      isActive: true,
    },
  });

  await prisma.employeeScheduleOverride.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.employeeScheduleOverride.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp2.id,
      scheduleId: schedule.id,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 86400000),
      note: 'Individual grafik',
    },
  });

  await prisma.positionSchedule.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.positionSchedule.create({
    data: {
      tenantId: tenant.id,
      positionId: posDev.id,
      scheduleId: schedule.id,
      isActive: true,
    },
  });

  await prisma.travelExpenseReport.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.internalTrip.deleteMany({ where: { tenantId: tenant.id } });
  const trip = await prisma.internalTrip.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp1.id,
      locationId: loc.id,
      recipientDivisionId: emp1.divisionId || undefined,
      senderDivisionId: emp1.divisionId || undefined,
      positionId: emp1.positionId || undefined,
      workScheduleId: schedule.id,
      title: 'Внутренняя командировка — филиал',
      startDate: new Date(),
      endDate: new Date(Date.now() + 2 * 86400000),
      requestDate: new Date(),
      status: 'active',
      requestStatus: 'pending',
      visibility: 'personal',
      note: 'Мой запрос (seed)',
      accrualName: 'Командировочные',
      amount: 500000,
      bySchedule: true,
    },
  });
  await prisma.internalTrip.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp1.id,
      locationId: loc.id,
      recipientDivisionId: emp1.divisionId || undefined,
      senderDivisionId: emp1.divisionId || undefined,
      positionId: emp1.positionId || undefined,
      title: 'Запрос менеджеру — командировка',
      startDate: new Date(Date.now() + 86400000),
      endDate: new Date(Date.now() + 3 * 86400000),
      requestDate: new Date(),
      status: 'planned',
      requestStatus: 'pending',
      visibility: 'inbox',
      note: 'Запросы мне (seed)',
    },
  });
  await prisma.internalTrip.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp1.id,
      locationId: loc.id,
      recipientDivisionId: emp1.divisionId || undefined,
      senderDivisionId: emp1.divisionId || undefined,
      positionId: emp1.positionId || undefined,
      title: 'Общая командировка',
      startDate: new Date(Date.now() + 2 * 86400000),
      endDate: new Date(Date.now() + 5 * 86400000),
      requestDate: new Date(),
      status: 'planned',
      requestStatus: 'pending',
      visibility: 'shared',
      note: 'Общие запросы (seed)',
    },
  });

  await prisma.gpsTrackPoint.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.gpsTrackPoint.createMany({
    data: [
      {
        tenantId: tenant.id,
        employeeId: emp1.id,
        latitude: 41.3111,
        longitude: 69.2797,
        accuracyM: 12,
        recordedAt: new Date(),
        source: 'mobile',
      },
      {
        tenantId: tenant.id,
        employeeId: emp1.id,
        latitude: 41.312,
        longitude: 69.281,
        accuracyM: 15,
        recordedAt: new Date(Date.now() - 3600000),
        source: 'mobile',
      },
      {
        tenantId: tenant.id,
        employeeId: emp2.id,
        latitude: 41.3265,
        longitude: 69.2285,
        accuracyM: 8,
        recordedAt: new Date(Date.now() - 1800000),
        source: 'mobile',
      },
      {
        tenantId: tenant.id,
        employeeId: emp2.id,
        latitude: 41.3111,
        longitude: 69.2797,
        accuracyM: 10,
        recordedAt: new Date(Date.now() - 600000),
        source: 'qr',
      },
    ],
  });

  await prisma.paymentOrder.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.paymentOrder.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp1.id,
      periodId: period.id,
      number: 'PO-001',
      title: 'Месячная оплата труда',
      accrualName: 'Месячная оплата труда',
      amount: 5000000,
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-31'),
      dueDate: new Date('2026-07-31'),
      status: 'new',
    },
  });

  const ap = await prisma.accountPair.findFirst({
    where: { tenantId: tenant.id, code: 'CLIENT' },
  });
  if (ap) {
    await prisma.settlement.deleteMany({ where: { tenantId: tenant.id } });
  }

  await prisma.salesCommissionAccrual.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.bonusAccrualDoc.deleteMany({ where: { tenantId: tenant.id } });

  await prisma.employeeLoan.deleteMany({ where: { tenantId: tenant.id } });
  const loan = await prisma.employeeLoan.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp1.id,
      number: '0000000001',
      loanDate: new Date('2025-01-15'),
      contractNumber: 'Д-15',
      contractDate: new Date('2025-01-10'),
      currency: 'UZS',
      principal: 10000000,
      remaining: 8000000,
      monthlyPayment: 1000000,
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-01'),
      status: 'active',
      note: 'Demo loan',
      payments: {
        create: [
          { amount: 1000000, paidAt: new Date('2025-02-01'), note: '1-to‘lov' },
          { amount: 1000000, paidAt: new Date('2025-03-01'), note: '2-to‘lov' },
        ],
      },
    },
  });

  await prisma.travelExpenseReport.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp1.id,
      tripId: trip.id,
      number: '0000000001',
      title: '0000000001',
      docDate: new Date(),
      currency: 'UZS',
      advance: 500000,
      amount: 450000,
      calcForSalary: false,
      status: 'draft',
      spentAt: new Date(),
      note: 'Transport + ovqat',
      lines: {
        create: [
          {
            accrualName: 'Командировочные',
            startDate: new Date(),
            endDate: new Date(Date.now() + 2 * 86400000),
            amount: 450000,
            note: 'Transport + ovqat',
            sortOrder: 0,
          },
        ],
      },
    },
  });

  await prisma.vacancy.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.vacancy.create({
    data: {
      tenantId: tenant.id,
      staffPositionId: staffPos.id,
      title: 'Developer #2 ochiq',
      status: 'open',
      openedAt: new Date(),
      note: 'Seed vacancy',
    },
  });

  await prisma.candidate.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.candidate.create({
    data: {
      tenantId: tenant.id,
      staffPositionId: staffPos.id,
      fullName: 'Bekzod Yusupov',
      phone: '+998901112233',
      email: 'bekzod@example.com',
      status: 'interview',
      note: 'Seed candidate',
      introducedAt: new Date(),
      gender: 'Мужской',
      personType: 'A',
      positionName: staffPos.title,
    },
  });

  await prisma.employeeRelative.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.employeeRelative.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp1.id,
      fullName: 'Malika Karimova',
      relation: 'Жена',
      birthDate: new Date('1992-05-01'),
      phone: '+998909998877',
      gender: 'Женский',
      workplace: 'ООО Verifix',
      dependent: true,
    },
  });

  await prisma.employeeAccessGrant.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.employeeAccessGrant.create({
    data: {
      tenantId: tenant.id,
      employeeId: emp1.id,
      accessType: 'office',
      resource: 'HQ-FLOOR-3',
      grantedAt: new Date(),
      isActive: true,
      note: 'Badge access',
    },
  });

  // Verifix «Кол-во сотрудников» — location attachments (recreate after wipe)
  const allLocsForGrants = await prisma.location.findMany({
    where: { tenantId: tenant.id, isActive: true },
    select: { id: true, code: true },
  });
  const activeEmps = await prisma.employee.findMany({
    where: { tenantId: tenant.id, status: 'active' },
    select: { id: true },
  });
  for (const l of allLocsForGrants) {
    // Main office: all active employees; regional: first employee + round-robin extras
    const targets =
      l.code === 'OFFICE1'
        ? activeEmps
        : activeEmps.filter((_, idx) => idx % Math.max(1, allLocsForGrants.length - 1) === 0 || idx < 2);
    for (const emp of targets) {
      await prisma.employeeAccessGrant.create({
        data: {
          tenantId: tenant.id,
          employeeId: emp.id,
          accessType: 'location',
          resource: l.id,
          isActive: true,
          note: l.code === 'OFFICE1' ? 'auto' : 'manual',
        },
      });
    }
  }

  // Link org divisions to main office so division-based counts also work
  await prisma.division.updateMany({
    where: { tenantId: tenant.id, locationId: null },
    data: { locationId: loc.id },
  });

  await prisma.location.update({
    where: { id: loc.id },
    data: { locationTypeId: locTypeOffice.id },
  });

  await prisma.reportTemplate.deleteMany({ where: { tenantId: tenant.id } });
  const tplBase = {
    tenantId: tenant.id,
    createdBy: 'System',
    isActive: true,
    templateType: 'word',
    useNameInReport: true,
  };
  await prisma.reportTemplate.createMany({
    data: [
      {
        ...tplBase,
        code: 'EMP-CONTRACT',
        name: 'Трудовой договор',
        kind: 'contract',
        source: 'Трудовой договор',
        fileName: 'employment_contract.docx',
        sortOrder: 1,
        definition: {
          variables: ['fullName', 'position', 'salary', 'hireDate'],
        },
      },
      {
        ...tplBase,
        code: 'FIRE-ORDER',
        name: 'Приказ об увольнении',
        kind: 'order',
        source: 'Приказ об увольнении',
        fileName: 'dismissal_order.docx',
        sortOrder: 2,
      },
      {
        ...tplBase,
        code: 'FIRE-LIST',
        name: 'Приказ об увольнении списком',
        kind: 'order',
        source: 'Приказ об увольнении списком',
        fileName: 'dismissal_order_bulk.docx',
        sortOrder: 3,
      },
      {
        ...tplBase,
        code: 'TRANSFER-ORDER',
        name: 'Приказ о кадровом переводе',
        kind: 'order',
        source: 'Приказ о кадровом переводе',
        fileName: 'transfer_order.docx',
        sortOrder: 4,
      },
      {
        ...tplBase,
        code: 'TRANSFER-LIST',
        name: 'Приказ о кадровом переводе списком',
        kind: 'order',
        source: 'Приказ о кадровом переводе списком',
        fileName: 'transfer_order_bulk.docx',
        sortOrder: 5,
      },
      {
        ...tplBase,
        code: 'HIRE-ORDER',
        name: 'Приказ о приеме на работу',
        kind: 'order',
        source: 'Приказ о приеме на работу',
        fileName: 'hire_order.docx',
        sortOrder: 6,
      },
      {
        ...tplBase,
        code: 'HIRE-LIST',
        name: 'Приказ о приеме на работу списком',
        kind: 'order',
        source: 'Приказ о приеме на работу списком',
        fileName: 'hire_order_bulk.docx',
        sortOrder: 7,
      },
      {
        ...tplBase,
        code: 'T13-STD',
        name: 'T-13 standart',
        kind: 't13',
        source: 'Табель учёта',
        templateType: 'excel',
        fileName: 't13_standard.xlsx',
        sortOrder: 10,
        definition: { columns: ['tab', 'name', 'days'], variables: ['period', 'division'] },
      },
    ],
  });

  await prisma.dynamicObject.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.dynamicObject.createMany({
    data: [
      { tenantId: tenant.id, code: 'CANDIDATE', name: 'Кандидат', kind: 'entity', sortOrder: 1 },
      { tenantId: tenant.id, code: 'HIRE', name: 'Прием на работу', kind: 'entity', sortOrder: 2 },
      { tenantId: tenant.id, code: 'INVENTORY', name: 'Инвентарь', kind: 'entity', sortOrder: 3 },
      { tenantId: tenant.id, code: 'EMPLOYEE', name: 'Сотрудник', kind: 'entity', sortOrder: 4 },
      { tenantId: tenant.id, code: 'DIVISION', name: 'Подразделение', kind: 'entity', sortOrder: 5 },
      {
        tenantId: tenant.id,
        code: 'SURVEY_Q',
        name: 'Survey Question Custom Reference',
        kind: 'entity',
        sortOrder: 6,
      },
      { tenantId: tenant.id, code: 'CANDIDATE_2', name: 'Кандидат-2', kind: 'entity', sortOrder: 7 },
      { tenantId: tenant.id, code: 'ACCEPT_ACT', name: 'Акт Приемки', kind: 'entity', sortOrder: 8 },
      {
        tenantId: tenant.id,
        code: 'HR_TRANSFER',
        name: 'Кадровые переводы',
        kind: 'entity',
        sortOrder: 9,
      },
      {
        tenantId: tenant.id,
        code: 'HR_DOCS',
        name: 'Кадровые документы',
        kind: 'entity',
        sortOrder: 10,
      },
      { tenantId: tenant.id, code: 'UNIT', name: 'Unit', kind: 'entity', sortOrder: 11 },
      { tenantId: tenant.id, code: 'FACT_HIRE', name: 'Приём на работу', kind: 'fact', sortOrder: 1 },
      { tenantId: tenant.id, code: 'FACT_TRANSFER', name: 'Перевод', kind: 'fact', sortOrder: 2 },
      { tenantId: tenant.id, code: 'FACT_DISMISS', name: 'Увольнение', kind: 'fact', sortOrder: 3 },
    ],
  });

  await prisma.accrualType.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.accrualType.createMany({
    data: [
      {
        tenantId: tenant.id,
        code: 'SICK',
        name: 'Больничный',
        shortName: 'Больничный',
        sortOrder: 10,
        purpose: 'Больничный',
        periodCalc: 'period',
        resultMode: 'formula',
        taxNdfl: true,
      },
      {
        tenantId: tenant.id,
        code: 'ATTEND',
        name: 'Явочная оплата труда',
        shortName: 'Явочная',
        sortOrder: 20,
        purpose: 'Оклад',
        periodCalc: 'day',
        resultMode: 'formula',
        taxNdfl: true,
        taxInps: true,
      },
      {
        tenantId: tenant.id,
        code: 'NIGHT',
        name: 'Дополнительная оплата труда в ночное время',
        shortName: 'Ночные',
        sortOrder: 30,
        purpose: 'Ночные',
        periodCalc: 'shift',
        resultMode: 'formula',
        taxNdfl: true,
      },
      {
        tenantId: tenant.id,
        code: 'INT_TRIP_PAY',
        name: 'Зарплата с внутренних командировок',
        shortName: 'Вн.команд.',
        sortOrder: 40,
        purpose: 'Командировка',
        periodCalc: 'period',
        resultMode: 'fixed',
        taxNdfl: true,
      },
      {
        tenantId: tenant.id,
        code: 'TRIP',
        name: 'Командировки',
        shortName: 'Командировки',
        sortOrder: 50,
        purpose: 'Командировка',
        periodCalc: 'period',
        resultMode: 'fixed',
        taxNdfl: false,
      },
      {
        tenantId: tenant.id,
        code: 'MONTHLY',
        name: 'Месячная оплата труда',
        shortName: 'Месячная',
        sortOrder: 60,
        purpose: 'Оклад',
        periodCalc: 'period',
        resultMode: 'formula',
        taxNdfl: true,
        taxInps: true,
        taxOss: true,
      },
      {
        tenantId: tenant.id,
        code: 'VACATION',
        name: 'Отпуск',
        shortName: 'Отпуск',
        sortOrder: 70,
        purpose: 'Отпуск',
        periodCalc: 'period',
        resultMode: 'formula',
        taxNdfl: true,
      },
      {
        tenantId: tenant.id,
        code: 'HOURLY',
        name: 'Почасовая оплата труда',
        shortName: 'Почасовая',
        sortOrder: 80,
        purpose: 'Оклад',
        periodCalc: 'day',
        resultMode: 'formula',
        taxNdfl: true,
      },
      {
        tenantId: tenant.id,
        code: 'OVERTIME',
        name: 'Сверхурочная оплата труда',
        shortName: 'Сверхурочные',
        sortOrder: 90,
        purpose: 'Сверхурочные',
        periodCalc: 'shift',
        resultMode: 'formula',
        taxNdfl: true,
      },
      {
        tenantId: tenant.id,
        code: 'BONUS',
        name: 'Премия',
        shortName: 'Премия',
        sortOrder: 100,
        purpose: 'Премия',
        periodCalc: 'period',
        resultMode: 'fixed',
        taxNdfl: true,
      },
      {
        tenantId: tenant.id,
        code: 'HOLIDAY',
        name: 'Оплата праздничных дней',
        shortName: 'Праздничные',
        sortOrder: 110,
        purpose: 'Доплата',
        periodCalc: 'day',
        resultMode: 'formula',
        taxNdfl: true,
      },
      {
        tenantId: tenant.id,
        code: 'ALLOWANCE',
        name: 'Надбавка',
        shortName: 'Надбавка',
        sortOrder: 120,
        purpose: 'Доплата',
        periodCalc: 'period',
        resultMode: 'fixed',
        taxNdfl: true,
      },
      {
        tenantId: tenant.id,
        code: 'MAT_AID',
        name: 'Материальная помощь',
        shortName: 'Мат.помощь',
        sortOrder: 130,
        purpose: 'Доплата',
        periodCalc: 'period',
        resultMode: 'fixed',
        taxNdfl: false,
      },
      {
        tenantId: tenant.id,
        code: 'SEVERANCE',
        name: 'Выходное пособие',
        shortName: 'Вых.пособие',
        sortOrder: 140,
        purpose: 'Доплата',
        periodCalc: 'period',
        resultMode: 'fixed',
        taxNdfl: false,
      },
    ],
  });

  await prisma.deductionType.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.deductionType.createMany({
    data: [
      {
        tenantId: tenant.id,
        code: 'FINE_DISC',
        name: 'Штрафы за нарушение дисциплины',
        shortName: 'Штрафы за нарушение дисциплины',
        sortOrder: 10,
        purpose: 'Штраф',
        periodCalc: 'period',
        resultMode: 'fixed',
        accountingMode: 'employee',
      },
      {
        tenantId: tenant.id,
        code: 'FINE_LATE',
        name: 'Штраф за опоздание',
        shortName: 'Штраф за опоздание',
        sortOrder: 20,
        purpose: 'Штраф',
        periodCalc: 'day',
        resultMode: 'fixed',
        accountingMode: 'employee',
      },
      {
        tenantId: tenant.id,
        code: 'ALIMONY',
        name: 'Алименты',
        shortName: 'Алименты',
        sortOrder: 30,
        purpose: 'Алименты',
        periodCalc: 'period',
        resultMode: 'formula',
        accountingMode: 'operation',
        account: '6850 — Прочие обязательства',
      },
      {
        tenantId: tenant.id,
        code: 'LOAN',
        name: 'Удержание по займу',
        shortName: 'Займ',
        sortOrder: 40,
        purpose: 'Займ',
        periodCalc: 'period',
        resultMode: 'fixed',
        accountingMode: 'employee',
      },
      {
        tenantId: tenant.id,
        code: 'ADVANCE',
        name: 'Удержание подотчётных сумм',
        shortName: 'Подотчёт',
        sortOrder: 50,
        purpose: 'Подотчёт',
        periodCalc: 'period',
        resultMode: 'fixed',
        accountingMode: 'employee',
      },
      {
        tenantId: tenant.id,
        code: 'UNION',
        name: 'Профсоюзные взносы',
        shortName: 'Профсоюз',
        sortOrder: 60,
        purpose: 'Прочее',
        periodCalc: 'period',
        resultMode: 'formula',
        accountingMode: 'operation',
        account: '6850 — Прочие обязательства',
      },
      {
        tenantId: tenant.id,
        code: 'DAMAGE',
        name: 'Возмещение материального ущерба',
        shortName: 'Ущерб',
        sortOrder: 70,
        purpose: 'Прочее',
        periodCalc: 'period',
        resultMode: 'fixed',
        accountingMode: 'employee',
      },
      {
        tenantId: tenant.id,
        code: 'OVERPAY',
        name: 'Удержание излишне выплаченных сумм',
        shortName: 'Переплата',
        sortOrder: 80,
        purpose: 'Прочее',
        periodCalc: 'period',
        resultMode: 'fixed',
        accountingMode: 'employee',
      },
    ],
  });

  await prisma.fact.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.factType.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.factType.createMany({
    data: [
      {
        tenantId: tenant.id,
        code: 'SALES_BILLA',
        name: 'Продажи Billa',
        unit: 'Количество',
        isActive: true,
        sortOrder: 1,
      },
      {
        tenantId: tenant.id,
        code: 'SALES_BILLA_10',
        name: 'Продажи Billa 1.0',
        unit: 'Количество',
        isActive: true,
        sortOrder: 2,
      },
      {
        tenantId: tenant.id,
        code: 'SALES_BILLZ',
        name: 'Продажи Billz',
        unit: 'Количество',
        isActive: true,
        sortOrder: 3,
      },
      {
        tenantId: tenant.id,
        code: 'SALES_BILLZ_10',
        name: 'Продажи Billz 1.0',
        unit: 'Количество',
        isActive: true,
        sortOrder: 4,
      },
      {
        tenantId: tenant.id,
        code: 'SALES_IIKO',
        name: 'Продажи iiko',
        unit: 'Количество',
        isActive: true,
        sortOrder: 5,
      },
      {
        tenantId: tenant.id,
        code: 'SALES_IIKO_EX',
        name: 'Продажи исключений iiko',
        unit: 'Количество',
        isActive: true,
        sortOrder: 6,
      },
      {
        tenantId: tenant.id,
        code: 'SALES_IIKO_CAP',
        name: 'Продажи Iiko',
        unit: 'Количество',
        isActive: true,
        sortOrder: 7,
      },
      {
        tenantId: tenant.id,
        code: 'SALES_IIKO_EX_CAP',
        name: 'Продажи исключений Iiko',
        unit: 'Количество',
        isActive: true,
        sortOrder: 8,
      },
    ],
  });

  const seedFactType = await prisma.factType.findFirst({
    where: { tenantId: tenant.id, code: 'SALES_BILLA' },
  });
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0));
  await prisma.bonusAccrualDoc.create({
    data: {
      tenantId: tenant.id,
      kind: 'fact',
      number: '0000000001',
      docDate: new Date(),
      startDate: monthStart,
      endDate: monthEnd,
      divisionId: emp1.divisionId || undefined,
      factTypeId: seedFactType?.id,
      factTypeName: seedFactType?.name,
      considerPayroll: false,
      note: 'Seed bonus fact',
      totalAmount: 250000,
      status: 'draft',
      lines: {
        create: [
          {
            employeeId: emp1.id,
            typeName: seedFactType?.name || 'Факт',
            accrualName: 'Бонус',
            amount: 250000,
            sortOrder: 0,
          },
        ],
      },
    },
  });
  await prisma.bonusAccrualDoc.create({
    data: {
      tenantId: tenant.id,
      kind: 'kpi',
      number: '0000000002',
      docDate: new Date(),
      startDate: monthStart,
      endDate: monthEnd,
      divisionId: emp1.divisionId || undefined,
      note: 'Seed bonus KPI',
      totalAmount: 150000,
      status: 'draft',
      lines: {
        create: [
          {
            employeeId: emp1.id,
            accrualName: 'КПЭ',
            startDate: monthStart,
            endDate: monthEnd,
            amount: 150000,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  await prisma.payrollLine.deleteMany({ where: { tenantId: tenant.id, periodId: period.id } });
  await prisma.payrollLine.createMany({
    data: [
      {
        tenantId: tenant.id,
        periodId: period.id,
        employeeId: emp1.id,
        type: 'base',
        description: 'Oklad',
        amount: 5000000,
        workDays: 22,
      },
      {
        tenantId: tenant.id,
        periodId: period.id,
        employeeId: emp1.id,
        type: 'bonus',
        description: 'KPI bonus',
        amount: 500000,
      },
      {
        tenantId: tenant.id,
        periodId: period.id,
        employeeId: emp1.id,
        type: 'deduction',
        description: 'Ushlab qolish',
        amount: -100000,
      },
      {
        tenantId: tenant.id,
        periodId: period.id,
        employeeId: emp2.id,
        type: 'one_time',
        description: 'Разовое начисление',
        amount: 250000,
      },
      {
        tenantId: tenant.id,
        periodId: period.id,
        employeeId: emp2.id,
        type: 'penalty',
        description: 'Kechikish jarimasi',
        amount: -50000,
        lateMinutes: 30,
      },
      {
        tenantId: tenant.id,
        periodId: period.id,
        employeeId: emp1.id,
        type: 'other',
        description: 'Boshqa',
        amount: 75000,
      },
    ],
  });

  const monthlyType = await prisma.accrualType.findFirst({
    where: { tenantId: tenant.id, code: 'MONTHLY' },
  });
  await prisma.payrollAccrualDoc.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.payrollAccrualDoc.create({
    data: {
      tenantId: tenant.id,
      kind: 'all_types',
      status: 'posted',
      month: new Date('2026-07-01'),
      docDate: new Date('2026-08-02'),
      number: '0000000001',
      title: 'Начисление всех видов',
      currency: 'UZS',
      accruedTotal: 5000000,
      deductedTotal: 0,
      ndflTotal: 600000,
      inpsTotal: 0,
      espTotal: 0,
      postedAt: new Date('2026-08-02T14:12:12Z'),
      postedBy: admin.fullName,
      lines: {
        create: {
          employeeId: emp1.id,
          accrualTypeId: monthlyType?.id,
          accrualName: monthlyType?.name || 'Месячная оплата труда',
          accrued: 5000000,
          toPay: 4400000,
          ndfl: 600000,
          inps: 0,
          esp: 0,
        },
      },
      entries: {
        create: [
          {
            tenantId: tenant.id,
            createdDate: new Date('2026-08-02T14:12:12Z'),
            transDate: new Date('2026-08-02'),
            debitAccount: '9420',
            debitSubconto: `${emp1.lastName} ${emp1.firstName}`,
            creditAccount: '6710',
            creditSubconto: `${emp1.lastName} ${emp1.firstName}`,
            amount: 5000000,
            currency: 'UZS',
            exchangeRate: 1,
            amountFx: 5000000,
            note: 'Начисление',
          },
          {
            tenantId: tenant.id,
            createdDate: new Date('2026-08-02T14:12:12Z'),
            transDate: new Date('2026-08-02'),
            debitAccount: '6710',
            debitSubconto: `${emp1.lastName} ${emp1.firstName}`,
            creditAccount: '6410',
            creditSubconto: 'НДФЛ',
            amount: 600000,
            currency: 'UZS',
            exchangeRate: 1,
            amountFx: 600000,
            note: 'НДФЛ',
          },
        ],
      },
      audits: {
        create: [
          {
            event: 'Добавлен',
            userName: admin.fullName,
            month: new Date('2026-07-01'),
            number: '0000000001',
            title: 'Начисление всех видов',
            posted: false,
            occurredAt: new Date('2026-08-02T14:10:00Z'),
          },
          {
            event: 'Проведен',
            userName: admin.fullName,
            month: new Date('2026-07-01'),
            number: '0000000001',
            title: 'Начисление всех видов',
            posted: true,
            occurredAt: new Date('2026-08-02T14:12:12Z'),
          },
        ],
      },
    },
  });

  void gph;
  void loan;
  void career;
  void grade1;

  const { seedMovementStaff } = require('../scripts/seed-movement-staff.js');
  await seedMovementStaff(prisma, tenant.id);

  console.log('Seed OK — full Verifix catalog demo data');
  console.log({
    platform: platform.email,
    admin: admin.email,
    mobileEmployee: 'employee@demo.local',
    mobileManager: 'manager@demo.local',
    mobileHr: 'hr@demo.local',
    password: 'Demo1234!',
    tenant: tenant.code,
    vacType: vac.code,
    scheduleNight: night.code,
    policy: policy.code,
    period: `${period.year}-${period.month}`,
    tariff: tariff.code,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
