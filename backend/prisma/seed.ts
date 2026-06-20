import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface ScrapedBranch {
  name: string;
  address: string;
  phone: string;
  timings: Record<string, string>;
  services: string[];
}

interface ScrapedDepartment {
  name: string;
  description: string;
}

interface ScrapedDoctor {
  name: string;
  specialty: string;
  experience: number;
  consultationFee: number;
  languages: string[];
  qualifications: string[];
  branch: string;
  department: string;
  availableDays: string[];
}

interface ScrapedData {
  hospital: {
    branches: ScrapedBranch[];
  };
  departments: ScrapedDepartment[];
  doctors: ScrapedDoctor[];
}

async function main() {
  console.log('Seeding database...');

  // Load scraped data
  const scrapedPath = path.resolve(__dirname, '../../scraper/scraped-data.json');
  if (!fs.existsSync(scrapedPath)) {
    console.error(`Scraped data not found at ${scrapedPath}`);
    console.error('Run the scraper first: cd scraper && npm run scrape');
    process.exit(1);
  }
  const scraped: ScrapedData = JSON.parse(fs.readFileSync(scrapedPath, 'utf-8'));
  console.log(`Loaded scraped data: ${scraped.hospital.branches.length} branches, ${scraped.departments.length} departments, ${scraped.doctors.length} doctors`);

  // Clean existing data
  await prisma.appointmentSlot.deleteMany();
  await prisma.evaluationResult.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.humanFollowup.deleteMany();
  await prisma.conversationSummary.deleteMany();
  await prisma.callLog.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.department.deleteMany();
  await prisma.patient.deleteMany();

  // Create Branches
  const branchMap: Record<string, string> = {};
  for (const b of scraped.hospital.branches) {
    const created = await prisma.branch.create({
      data: {
        name: b.name,
        address: b.address,
        phone: b.phone,
        timings: JSON.stringify(b.timings),
        services: JSON.stringify(b.services),
      },
    });
    branchMap[b.name] = created.id;
  }
  console.log(`Created ${scraped.hospital.branches.length} branches`);

  // Create Departments
  const departmentMap: Record<string, string> = {};
  for (const d of scraped.departments) {
    const created = await prisma.department.create({
      data: {
        name: d.name,
        description: d.description,
      },
    });
    departmentMap[d.name] = created.id;
  }
  console.log(`Created ${scraped.departments.length} departments`);

  // Create Doctors
  let doctorCount = 0;
  for (const doc of scraped.doctors) {
    const branchId = branchMap[doc.branch];
    const departmentId = departmentMap[doc.department];

    if (!branchId) {
      console.warn(`  Skipping ${doc.name}: branch "${doc.branch}" not found`);
      continue;
    }
    if (!departmentId) {
      console.warn(`  Skipping ${doc.name}: department "${doc.department}" not found`);
      continue;
    }

    await prisma.doctor.create({
      data: {
        name: doc.name,
        specialty: doc.specialty,
        experience: doc.experience,
        consultationFee: doc.consultationFee,
        languages: JSON.stringify(doc.languages),
        qualifications: JSON.stringify(doc.qualifications),
        availableDays: JSON.stringify(doc.availableDays),
        branchId,
        departmentId,
      },
    });
    doctorCount++;
  }
  console.log(`Created ${doctorCount} doctors`);

  // Generate appointment slots for next 14 days (batched)
  const slotTimes = ['10:00', '11:00', '14:00', '15:00', '16:00'];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const allDoctors = await prisma.doctor.findMany();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const allSlotData: { doctorId: string; date: Date; time: string; status: string }[] = [];

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const dateObj = new Date(today);
    dateObj.setUTCDate(dateObj.getUTCDate() + dayOffset);
    const dayOfWeek = dayNames[dateObj.getUTCDay()];

    for (const doc of allDoctors) {
      if (!doc.availableDays.includes(dayOfWeek)) continue;

      for (const time of slotTimes) {
        allSlotData.push({
          doctorId: doc.id,
          date: dateObj,
          time,
          status: 'available',
        });
      }
    }
  }

  if (allSlotData.length > 0) {
    await prisma.appointmentSlot.createMany({ data: allSlotData });
  }

  console.log(`Generated ${allSlotData.length} appointment slots across ${allDoctors.length} doctors`);

  console.log('\n✅ Seed completed successfully!');
  console.log(`  ${scraped.hospital.branches.length} branches`);
  console.log(`  ${scraped.departments.length} departments`);
  console.log(`  ${doctorCount} doctors`);
  console.log(`  ${allSlotData.length} slots (14 days)`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
