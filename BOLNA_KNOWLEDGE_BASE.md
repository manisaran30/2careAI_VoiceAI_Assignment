# Apollo Hospitals Chennai - AI Receptionist Knowledge Base
# This document provides context for the Bolna Voice AI agent

## Hospital Overview
Apollo Hospitals Chennai is a leading multi-specialty hospital in Chennai, India.
Website: https://www.apollohospitals.com
City: Chennai
Country: India

## Branches / Locations

### 1. Apollo Hospitals, Greams Road
- Address: 21, Greams Lane, Off Greams Road, Chennai - 600006
- Phone: +91-44-28290200
- Timings: Weekday 06:00 - 22:00, Weekend 06:00 - 18:00
- Emergency: 24x7
- Services: Emergency, Cardiology, Neurology, Orthopedics, Oncology, Pediatrics, ENT, Gastroenterology, General Medicine

### 2. Apollo Speciality Hospitals, Teynampet
- Address: 320, Anna Salai, Teynampet, Chennai - 600018
- Phone: +91-44-24336161
- Timings: Weekday 07:00 - 21:00, Weekend 07:00 - 17:00
- Emergency: 24x7
- Services: Cardiology, Gastroenterology, Nephrology, Dermatology, ENT, Ophthalmology, Neurology

### 3. Apollo Clinic, Velachery
- Address: 22, 3rd Cross Road, Velachery, Chennai - 600042
- Phone: +91-44-49049999
- Timings: Weekday 08:00 - 20:00, Weekend 08:00 - 14:00
- Emergency: Not available
- Services: General Medicine, Pediatrics, Dermatology, ENT, Orthopedics, Gynecology

### 4. Apollo Hospitals, OMR Road
- Address: Plot No 1, Thiruvannmiyur, OMR Road, Chennai - 600041
- Phone: +91-44-24502100
- Timings: Weekday 06:00 - 22:00, Weekend 06:00 - 18:00
- Emergency: 24x7
- Services: Cardiology, Neurology, Orthopedics, Pediatrics, Gynecology, Pulmonology, Gastroenterology

## Departments

1. **Cardiology** - Heart care including diagnostics, interventional cardiology, and cardiac surgery
2. **Orthopedics** - Bone, joint, and spine care including joint replacement and sports medicine
3. **Dermatology** - Skin, hair, and nail care including cosmetic dermatology
4. **Pediatrics** - Child healthcare from newborn to adolescent
5. **General Medicine** - Primary care, internal medicine, and preventive healthcare
6. **ENT** - Ear, nose, and throat care including head and neck surgery
7. **Ophthalmology** - Eye care including cataract surgery, LASIK, and retina services
8. **Gastroenterology** - Digestive system care including endoscopy and liver care
9. **Neurology** - Brain, spine, and nervous system care including stroke management
10. **Gynecology and Obstetrics** - Womens health including prenatal care, maternity, and reproductive medicine
11. **Nephrology** - Kidney care including dialysis and kidney transplant
12. **Pulmonology** - Respiratory care including asthma, COPD, and sleep disorders
13. **Oncology** - Cancer care including medical, surgical, and radiation oncology
14. **Psychiatry** - Mental health care including therapy and psychiatric consultations

## Common FAQs

Q: What are the OPD timings?
A: Our OPD operates from 6:00 AM to 10:00 PM on weekdays and 6:00 AM to 6:00 PM on weekends at our main branches.

Q: How do I book an appointment?
A: You can call our AI receptionist, visit our website, or walk in to any branch. The AI receptionist can help book, reschedule, or cancel appointments.

Q: What is the consultation fee?
A: Consultation fees vary by doctor, typically ranging from Rs.500 to Rs.1500 for senior specialists.

Q: Is parking available?
A: Yes, all our major branches have parking facilities available for patients and visitors.

Q: Do you accept insurance?
A: Yes, we accept most major insurance plans. Please check with our billing desk or call ahead to verify your coverage.

Q: Do you have emergency services?
A: Yes, our main hospitals (Greams Road, Teynampet, OMR Road) have 24x7 emergency services. Clinics do not have emergency services.

Q: What are the visiting hours?
A: Visiting hours are generally 6:00 AM to 8:00 PM. ICU visitation may have different timings.

Q: Can I cancel or reschedule my appointment?
A: Yes, you can call our AI receptionist to cancel or reschedule appointments. Please provide your phone number to locate your booking.

Q: What languages are your doctors fluent in?
A: Most doctors speak English, Tamil, and Hindi. Many also speak Telugu, Malayalam, and other regional languages.

Q: Do you have ambulance services?
A: Yes, we have 24x7 ambulance services at all our hospital locations. Basic life support and advanced life support ambulances are available.

Q: Can I get a teleconsultation?
A: Yes, Apollo offers teleconsultation services. You can book a video consultation with our doctors through our website or app.

Q: Do you have a pharmacy open 24 hours?
A: Yes, the Apollo pharmacy at all our hospital locations is open 24x7.

## Appointment Booking Flow

1. Patient calls and identifies themselves
2. AI asks for specialty/department needed
3. AI checks available doctors using check_doctor tool
4. AI offers available slots using check_slot tool
5. Patient confirms date and time
6. AI books appointment using create_appointment tool
7. AI confirms booking details and gives reference

## Important Notes

- Always confirm patient phone number for records
- Remind patients to arrive 15 minutes early for new appointments
- For emergencies, direct patients to nearest 24x7 branch
- If AI cannot help, offer human handoff using request_human_handoff tool
- Consultation fees are to be paid at the hospital
