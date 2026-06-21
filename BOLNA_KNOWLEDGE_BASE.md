# Apollo Hospitals Visakhapatnam - AI Receptionist Knowledge Base

## Hospital Overview
Apollo Hospitals Visakhapatnam is a leading multi-specialty hospital in Visakhapatnam, Andhra Pradesh.
Website: https://www.apollohospitals.com
City: Visakhapatnam (Vizag), Andhra Pradesh

## Branches

### 1. Apollo Hospitals Health City, Arilova
- Address: Plot No:1, Arilova, Chinagadali, Visakhapatnam - 530040
- Phone: +91-891-2867777
- Timings: Weekday 06:00 - 22:00, Weekend 06:00 - 18:00
- Emergency: 24x7
- Services: Cardiology, Orthopedics, Oncology, Neurology, Gastroenterology, Nephrology, Urology, Pulmonology, Pediatrics, OBG, ENT, Emergency & Critical Care, Organ Transplant

### 2. Apollo Hospitals, Ramnagar
- Address: 10-50-80, Waltair Main Road, Ram Nagar, Visakhapatnam - 530002
- Phone: +91-891-2562001
- Timings: Weekday 07:00 - 21:00, Weekend 07:00 - 17:00
- Emergency: 24x7
- Services: Cardiology, Nephrology, Urology, General Medicine, Critical Care, Daycare Surgery, Trauma Care

## Departments
Cardiology, Orthopedics, Dermatology, Pediatrics, General Medicine, ENT, Ophthalmology, Gastroenterology, Neurology, Gynecology & Obstetrics, Nephrology, Pulmonology, Oncology, Psychiatry, Urology

## Common FAQs

Q: What are the OPD timings?
A: Arilova: 6 AM-10 PM weekdays, 6 AM-6 PM weekends. Ramnagar: 7 AM-9 PM weekdays, 7 AM-5 PM weekends.

Q: What is the consultation fee?
A: Typically Rs.500 to Rs.3,000. Most doctors at Vizag charge Rs.1,900.

Q: Do you have emergency services?
A: Yes, both branches have 24x7 emergency.

Q: Do you accept insurance?
A: Yes, most major insurance plans are accepted.

Q: What languages do doctors speak?
A: English, Telugu, Hindi. Some speak Tamil and Kannada.

Q: Do you have ambulance services?
A: Yes, 24x7 at both branches. Call 1066 for emergency.

Q: Can I get a teleconsultation?
A: Yes, via our website or app.

Q: Is parking available?
A: Yes, at both branches.

Q: Do you have a 24-hour pharmacy?
A: Yes, at both hospital locations.

## Appointment Booking Flow
1. Greet patient and identify intent
2. Ask for specialty/department needed
3. Use check_doctor tool to find available doctors
4. Use check_slot tool for available times
5. Patient confirms date and time
6. Use create_appointment tool to book (via POST /api/bookings/voice-book)
7. Confirm booking details

## Important Notes
- Most doctors available Mon-Sat
- Doctors primarily speak English and Telugu
- For emergencies, direct to nearest 24x7 emergency
- Offer human handoff if AI cannot help
- Consultation fees paid at hospital
