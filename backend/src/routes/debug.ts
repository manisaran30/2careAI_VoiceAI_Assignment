import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';

interface RecentRequest {
  method: string;
  path: string;
  status: number;
  duration: number;
  timestamp: string;
}

const recentRequests: RecentRequest[] = [];
const MAX_REQUESTS = 100;

export function recordRequest(method: string, path: string, status: number, duration: number): void {
  recentRequests.push({ method, path, status, duration, timestamp: new Date().toISOString() });
  if (recentRequests.length > MAX_REQUESTS) {
    recentRequests.splice(0, recentRequests.length - MAX_REQUESTS);
  }
}

export function getRecentRequests(): RecentRequest[] {
  return [...recentRequests];
}

const router = Router();

router.get('/recent-requests', (_req: Request, res: Response) => {
  res.json({ success: true, data: getRecentRequests() });
});

router.post('/seed', async (_req: Request, res: Response) => {
  try {
    const branchesData = [
      { name: 'Apollo Hospitals, Greams Road', address: '21, Greams Lane, Off Greams Road, Chennai - 600006', phone: '+91-44-28290200', timings: JSON.stringify({ weekday: '06:00 - 22:00', weekend: '06:00 - 18:00', emergency: '24x7' }), services: JSON.stringify(['Emergency Services', 'Cardiology', 'Neurology', 'Orthopedics', 'Oncology', 'Pediatrics', 'Maternity', 'Pharmacy']) },
      { name: 'Apollo Speciality Hospitals, Teynampet', address: '320, Anna Salai, Teynampet, Chennai - 600018', phone: '+91-44-24336161', timings: JSON.stringify({ weekday: '07:00 - 21:00', weekend: '07:00 - 17:00', emergency: '24x7' }), services: JSON.stringify(['Cardiology', 'Gastroenterology', 'Nephrology', 'Urology', 'Endocrinology', 'Dermatology', 'ENT', 'Ophthalmology']) },
      { name: 'Apollo Clinic, Velachery', address: '22, 3rd Cross Road, Velachery, Chennai - 600042', phone: '+91-44-49049999', timings: JSON.stringify({ weekday: '08:00 - 20:00', weekend: '08:00 - 14:00', emergency: 'No emergency services' }), services: JSON.stringify(['General Medicine', 'Pediatrics', 'Dermatology', 'ENT', 'Orthopedics', 'Gynecology', 'Dental', 'Physiotherapy']) },
      { name: 'Apollo Hospitals, OMR Road', address: 'Plot No 1, Thiruvannmiyur, OMR Road, Chennai - 600041', phone: '+91-44-24502100', timings: JSON.stringify({ weekday: '06:00 - 22:00', weekend: '06:00 - 18:00', emergency: '24x7' }), services: JSON.stringify(['Cardiology', 'Neurology', 'Orthopedics', 'Pediatrics', 'Gynecology', 'Pulmonology', 'Pharmacy', 'Diagnostics']) },
    ];
    const branches = await Promise.all(branchesData.map((b) => prisma.branch.create({ data: b })));
    const [greamsRoad, teynampet, velachery, omrRoad] = branches;

    const departmentsData = [
      { name: 'Cardiology', description: 'Comprehensive heart care' },
      { name: 'Orthopedics', description: 'Bone, joint, and spine care' },
      { name: 'Dermatology', description: 'Skin, hair, and nail care' },
      { name: 'Pediatrics', description: 'Child healthcare' },
      { name: 'General Medicine', description: 'Primary care and internal medicine' },
      { name: 'ENT', description: 'Ear, nose, and throat care' },
      { name: 'Ophthalmology', description: 'Eye care' },
      { name: 'Gastroenterology', description: 'Digestive system care' },
      { name: 'Neurology', description: 'Brain and nervous system care' },
      { name: 'Gynecology & Obstetrics', description: 'Women\'s health' },
    ];
    const departments = await Promise.all(departmentsData.map((d) => prisma.department.create({ data: d })));
    const [cardiology, orthopedics, dermatology, pediatrics, generalMedicine, ent, ophthalmology, gastroenterology, neurology, gynecology] = departments;

    const doctorsData = [
      { name: 'Dr. S. Natarajan', specialty: 'Interventional Cardiologist', experience: 32, consultationFee: 1200, languages: JSON.stringify(['English', 'Tamil', 'Telugu']), availableDays: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']), qualifications: JSON.stringify(['MBBS', 'MD', 'DM Cardiology']), branchId: greamsRoad.id, departmentId: cardiology.id },
      { name: 'Dr. R. Suresh Kumar', specialty: 'Cardiologist', experience: 18, consultationFee: 900, languages: JSON.stringify(['English', 'Tamil']), availableDays: JSON.stringify(['Monday', 'Tuesday', 'Thursday', 'Friday', 'Saturday']), qualifications: JSON.stringify(['MBBS', 'MD', 'DM Cardiology']), branchId: omrRoad.id, departmentId: cardiology.id },
      { name: 'Dr. Priya Venkatesh', specialty: 'Pediatric Cardiologist', experience: 14, consultationFee: 1000, languages: JSON.stringify(['English', 'Tamil', 'Hindi']), availableDays: JSON.stringify(['Monday', 'Wednesday', 'Friday']), qualifications: JSON.stringify(['MBBS', 'MD', 'DM Cardiology']), branchId: greamsRoad.id, departmentId: cardiology.id },
      { name: 'Dr. K. S. Subramanian', specialty: 'Orthopedic Surgeon', experience: 28, consultationFee: 1100, languages: JSON.stringify(['English', 'Tamil']), availableDays: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']), qualifications: JSON.stringify(['MBBS', 'MS Ortho', 'MCh Ortho']), branchId: greamsRoad.id, departmentId: orthopedics.id },
      { name: 'Dr. Vishnu Mohan', specialty: 'Joint Replacement Specialist', experience: 15, consultationFee: 1000, languages: JSON.stringify(['English', 'Tamil', 'Malayalam']), availableDays: JSON.stringify(['Tuesday', 'Thursday', 'Saturday']), qualifications: JSON.stringify(['MBBS', 'MS Ortho', 'Fellowship Joint Replacement']), branchId: velachery.id, departmentId: orthopedics.id },
      { name: 'Dr. Anitha Ravindran', specialty: 'Dermatologist', experience: 20, consultationFee: 800, languages: JSON.stringify(['English', 'Tamil', 'Hindi']), availableDays: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']), qualifications: JSON.stringify(['MBBS', 'MD Dermatology']), branchId: teynampet.id, departmentId: dermatology.id },
      { name: 'Dr. Meenakshi Sundaram', specialty: 'Cosmetic Dermatologist', experience: 12, consultationFee: 1500, languages: JSON.stringify(['English', 'Tamil']), availableDays: JSON.stringify(['Monday', 'Wednesday', 'Friday']), qualifications: JSON.stringify(['MBBS', 'MD Dermatology', 'Fellowship Cosmetic Dermatology']), branchId: velachery.id, departmentId: dermatology.id },
      { name: 'Dr. Lakshmi Narayanan', specialty: 'Pediatrician', experience: 25, consultationFee: 700, languages: JSON.stringify(['English', 'Tamil', 'Telugu']), availableDays: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']), qualifications: JSON.stringify(['MBBS', 'MD Pediatrics']), branchId: greamsRoad.id, departmentId: pediatrics.id },
      { name: 'Dr. Kavitha Rajan', specialty: 'Pediatric Pulmonologist', experience: 10, consultationFee: 850, languages: JSON.stringify(['English', 'Tamil']), availableDays: JSON.stringify(['Tuesday', 'Thursday', 'Saturday']), qualifications: JSON.stringify(['MBBS', 'MD Pediatrics', 'DM Pulmonology']), branchId: omrRoad.id, departmentId: pediatrics.id },
      { name: 'Dr. S. Ramachandran', specialty: 'General Physician', experience: 30, consultationFee: 500, languages: JSON.stringify(['English', 'Tamil', 'Hindi']), availableDays: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']), qualifications: JSON.stringify(['MBBS', 'MD General Medicine']), branchId: greamsRoad.id, departmentId: generalMedicine.id },
      { name: 'Dr. Aruna Devi', specialty: 'Internal Medicine', experience: 16, consultationFee: 600, languages: JSON.stringify(['English', 'Tamil', 'Telugu']), availableDays: JSON.stringify(['Monday', 'Wednesday', 'Friday', 'Saturday']), qualifications: JSON.stringify(['MBBS', 'MD Internal Medicine']), branchId: velachery.id, departmentId: generalMedicine.id },
      { name: 'Dr. Ravi Shankar', specialty: 'ENT Specialist', experience: 22, consultationFee: 800, languages: JSON.stringify(['English', 'Tamil']), availableDays: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']), qualifications: JSON.stringify(['MBBS', 'MS ENT']), branchId: teynampet.id, departmentId: ent.id },
      { name: 'Dr. S. K. Sreedharan', specialty: 'ENT Surgeon', experience: 26, consultationFee: 1000, languages: JSON.stringify(['English', 'Tamil', 'Malayalam']), availableDays: JSON.stringify(['Monday', 'Tuesday', 'Thursday', 'Friday']), qualifications: JSON.stringify(['MBBS', 'MS ENT', 'Fellowship ENT Surgery']), branchId: omrRoad.id, departmentId: ent.id },
      { name: 'Dr. N. S. Murali', specialty: 'Ophthalmologist', experience: 24, consultationFee: 900, languages: JSON.stringify(['English', 'Tamil', 'Telugu']), availableDays: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']), qualifications: JSON.stringify(['MBBS', 'MS Ophthalmology', 'FRCS']), branchId: teynampet.id, departmentId: ophthalmology.id },
      { name: 'Dr. Shweta Agarwal', specialty: 'Cornea Specialist', experience: 11, consultationFee: 1000, languages: JSON.stringify(['English', 'Hindi', 'Tamil']), availableDays: JSON.stringify(['Tuesday', 'Thursday', 'Saturday']), qualifications: JSON.stringify(['MBBS', 'MS Ophthalmology', 'Fellowship Cornea']), branchId: velachery.id, departmentId: ophthalmology.id },
      { name: 'Dr. P. S. Venkatesan', specialty: 'Gastroenterologist', experience: 27, consultationFee: 1100, languages: JSON.stringify(['English', 'Tamil']), availableDays: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']), qualifications: JSON.stringify(['MBBS', 'MD', 'DM Gastroenterology']), branchId: teynampet.id, departmentId: gastroenterology.id },
      { name: 'Dr. R. K. Ranganathan', specialty: 'Hepatologist', experience: 19, consultationFee: 1200, languages: JSON.stringify(['English', 'Tamil', 'Telugu']), availableDays: JSON.stringify(['Monday', 'Wednesday', 'Friday']), qualifications: JSON.stringify(['MBBS', 'MD', 'DM Gastroenterology', 'Fellowship Hepatology']), branchId: omrRoad.id, departmentId: gastroenterology.id },
      { name: 'Dr. V. S. Karthikeyan', specialty: 'Neurologist', experience: 21, consultationFee: 1500, languages: JSON.stringify(['English', 'Tamil', 'Telugu']), availableDays: JSON.stringify(['Monday', 'Tuesday', 'Thursday', 'Friday', 'Saturday']), qualifications: JSON.stringify(['MBBS', 'MD', 'DM Neurology']), branchId: greamsRoad.id, departmentId: neurology.id },
      { name: 'Dr. Sunita Rajan', specialty: 'Pediatric Neurologist', experience: 13, consultationFee: 1300, languages: JSON.stringify(['English', 'Tamil', 'Hindi']), availableDays: JSON.stringify(['Tuesday', 'Thursday', 'Saturday']), qualifications: JSON.stringify(['MBBS', 'MD', 'DM Neurology', 'Fellowship Pediatric Neurology']), branchId: omrRoad.id, departmentId: neurology.id },
      { name: 'Dr. Radha Devi', specialty: 'Gynecologist & Obstetrician', experience: 23, consultationFee: 800, languages: JSON.stringify(['English', 'Tamil', 'Telugu']), availableDays: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']), qualifications: JSON.stringify(['MBBS', 'MD OBG']), branchId: velachery.id, departmentId: gynecology.id },
      { name: 'Dr. P. L. Krishnan', specialty: 'Fertility Specialist', experience: 17, consultationFee: 1200, languages: JSON.stringify(['English', 'Tamil']), availableDays: JSON.stringify(['Monday', 'Wednesday', 'Friday', 'Saturday']), qualifications: JSON.stringify(['MBBS', 'MD OBG', 'Fellowship Reproductive Medicine']), branchId: omrRoad.id, departmentId: gynecology.id },
    ];
    for (const doc of doctorsData) {
      await prisma.doctor.create({ data: doc });
    }

    res.json({ success: true, data: { branches: branches.length, departments: departments.length, doctors: doctorsData.length } });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

router.post('/migrate', async (_req: Request, res: Response) => {
  try {
    const results: string[] = [];
    results.push(await prisma.$executeRawUnsafe(`ALTER TABLE call_logs ADD COLUMN "sessionId" TEXT`).then(() => 'Added sessionId').catch(e => 'sessionId: ' + e.message));
    results.push(await prisma.$executeRawUnsafe(`ALTER TABLE call_logs ADD COLUMN "operation" TEXT`).then(() => 'Added operation').catch(e => 'operation: ' + e.message));
    results.push(await prisma.$executeRawUnsafe(`ALTER TABLE call_logs ADD COLUMN "transcript" TEXT`).then(() => 'Added transcript').catch(e => 'transcript: ' + e.message));
    results.push(await prisma.$executeRawUnsafe(`ALTER TABLE call_logs ADD COLUMN "partialSession" BOOLEAN DEFAULT false`).then(() => 'Added partialSession').catch(e => 'partialSession: ' + e.message));
    results.push(await prisma.$executeRawUnsafe(`ALTER TABLE call_logs ADD COLUMN "errorLog" TEXT`).then(() => 'Added errorLog').catch(e => 'errorLog: ' + e.message));
    results.push(await prisma.$executeRawUnsafe(`ALTER TABLE call_logs ADD COLUMN "updatedAt" TIMESTAMP`).then(() => 'Added updatedAt').catch(e => 'updatedAt: ' + e.message));
    res.json({ success: true, data: results });
  } catch (error) {
    res.json({ success: false, error: String(error) });
  }
});

router.get('/test-recent', async (_req: Request, res: Response) => {
  try {
    const calls = await prisma.callLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10 });
    const callsWithInclude = await prisma.callLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { patient: { select: { name: true, phone: true } }, conversationSummary: true } });
    const apps = await prisma.appointment.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { patient: { select: { name: true, phone: true } }, doctor: { select: { name: true, specialty: true } }, branch: { select: { name: true } } } });
    const fups = await prisma.humanFollowup.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'desc' }, take: 20, include: { patient: { select: { name: true, phone: true } } } });
    res.json({ success: true, data: { calls: calls.length, callsWithInclude: callsWithInclude.length, apps: apps.length, fups: fups.length } });
  } catch (error) {
    res.json({ success: false, error: String(error), stack: error instanceof Error ? error.stack : undefined });
  }
});

router.get('/db-check', async (_req: Request, res: Response) => {
  try {
    const hasDbUrl = !!process.env.DATABASE_URL;
    const dbUrlPrefix = process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 30) + '...' : 'not set';
    const start = Date.now();
    await prisma.$connect();
    const connectTime = Date.now() - start;
    const result = await prisma.$queryRaw`SELECT 1 as connected`;
    const queryTime = Date.now() - start;
    await prisma.branch.count();
    const countTime = Date.now() - start;
    res.json({
      success: true,
      data: {
        databaseUrlSet: hasDbUrl,
        databaseUrlPrefix: dbUrlPrefix,
        connectTimeMs: connectTime,
        queryTimeMs: queryTime,
        countTimeMs: countTime - queryTime,
        queryResult: result,
      },
    });
  } catch (error) {
    res.json({
      success: false,
      error: String(error),
      env: {
        databaseUrlSet: !!process.env.DATABASE_URL,
        databaseUrlPrefix: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 30) + '...' : 'not set',
        nodeEnv: process.env.NODE_ENV,
      },
    });
  }
});

export default router;
