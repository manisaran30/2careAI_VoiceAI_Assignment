import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clean existing data
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
  const branchesData = [
    {
      name: 'Apollo Hospitals, Greams Road',
      address: '21, Greams Lane, Off Greams Road, Chennai - 600006',
      phone: '+91-44-28290200',
      timings: JSON.stringify({ weekday: '06:00 - 22:00', weekend: '06:00 - 18:00', emergency: '24x7' }),
      services: JSON.stringify(['Emergency Services', 'Cardiology', 'Neurology', 'Orthopedics', 'Oncology', 'Pediatrics', 'Maternity', 'Pharmacy']),
    },
    {
      name: 'Apollo Speciality Hospitals, Teynampet',
      address: '320, Anna Salai, Teynampet, Chennai - 600018',
      phone: '+91-44-24336161',
      timings: JSON.stringify({ weekday: '07:00 - 21:00', weekend: '07:00 - 17:00', emergency: '24x7' }),
      services: JSON.stringify(['Cardiology', 'Gastroenterology', 'Nephrology', 'Urology', 'Endocrinology', 'Dermatology', 'ENT', 'Ophthalmology']),
    },
    {
      name: 'Apollo Clinic, Velachery',
      address: '22, 3rd Cross Road, Velachery, Chennai - 600042',
      phone: '+91-44-49049999',
      timings: JSON.stringify({ weekday: '08:00 - 20:00', weekend: '08:00 - 14:00', emergency: 'No emergency services' }),
      services: JSON.stringify(['General Medicine', 'Pediatrics', 'Dermatology', 'ENT', 'Orthopedics', 'Gynecology', 'Dental', 'Physiotherapy']),
    },
    {
      name: 'Apollo Hospitals, OMR Road',
      address: 'Plot No 1, Thiruvannmiyur, OMR Road, Chennai - 600041',
      phone: '+91-44-24502100',
      timings: JSON.stringify({ weekday: '06:00 - 22:00', weekend: '06:00 - 18:00', emergency: '24x7' }),
      services: JSON.stringify(['Cardiology', 'Neurology', 'Orthopedics', 'Pediatrics', 'Gynecology', 'Pulmonology', 'Pharmacy', 'Diagnostics']),
    },
  ];

  const branches = await Promise.all(
    branchesData.map((b) => prisma.branch.create({ data: b }))
  );

  const [greamsRoad, teynampet, velachery, omrRoad] = branches;
  console.log(`Created ${branches.length} branches`);

  // Create Departments
  const departmentsData = [
    { name: 'Cardiology', description: 'Comprehensive heart care including diagnostics, interventional cardiology, and cardiac surgery.' },
    { name: 'Orthopedics', description: 'Bone, joint, and spine care including joint replacement, sports medicine, and trauma surgery.' },
    { name: 'Dermatology', description: 'Skin, hair, and nail care including cosmetic dermatology and laser treatments.' },
    { name: 'Pediatrics', description: 'Child healthcare from newborn to adolescent, including vaccinations and developmental care.' },
    { name: 'General Medicine', description: 'Primary care, internal medicine, and preventive healthcare for adults.' },
    { name: 'ENT', description: 'Ear, nose, and throat care including hearing tests, sinus surgery, and voice disorders.' },
    { name: 'Ophthalmology', description: 'Eye care including cataract surgery, glaucoma treatment, and LASIK.' },
    { name: 'Gastroenterology', description: 'Digestive system care including endoscopy, colonoscopy, and liver disease management.' },
    { name: 'Neurology', description: 'Brain, spine, and nervous system care including stroke treatment and epilepsy management.' },
    { name: 'Gynecology & Obstetrics', description: 'Women\'s health including prenatal care, fertility treatments, and gynecological surgery.' },
  ];

  const departments = await Promise.all(
    departmentsData.map((d) => prisma.department.create({ data: d }))
  );

  const [cardiology, orthopedics, dermatology, pediatrics, generalMedicine, ent, ophthalmology, gastroenterology, neurology, gynecology] = departments;
  console.log(`Created ${departments.length} departments`);

  // Create Doctors
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
  console.log(`Created ${doctorsData.length} doctors`);

  // Generate appointment slots for next 14 days
  const slotTimes = ['10:00', '11:00', '14:00', '15:00', '16:00'];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let totalSlots = 0;

  const allDoctors = await prisma.doctor.findMany();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const dateObj = new Date(today);
    dateObj.setUTCDate(dateObj.getUTCDate() + dayOffset);
    const dayOfWeek = dayNames[dateObj.getUTCDay()];

    for (const doc of allDoctors) {
      if (!doc.availableDays.includes(dayOfWeek)) continue;

      const slotData = slotTimes.map((time) => ({
        doctorId: doc.id,
        date: dateObj,
        time,
        status: 'available' as const,
      }));

      await prisma.appointmentSlot.createMany({ data: slotData });
      totalSlots += slotData.length;
    }
  }

  console.log(`Generated ${totalSlots} appointment slots across ${allDoctors.length} doctors`);

  console.log('\n✅ Seed completed successfully!');
  console.log(`  ${branches.length} branches`);
  console.log(`  ${departments.length} departments`);
  console.log(`  ${doctorsData.length} doctors`);
  console.log(`  ${totalSlots} slots (14 days)`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
