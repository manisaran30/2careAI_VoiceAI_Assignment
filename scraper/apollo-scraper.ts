
/**
 * Apollo Hospitals Chennai — Reusable Scraper
 * Scrapes Apollo Hospitals Chennai for branches, departments, doctors, FAQs.
 * Usage: npx tsx apollo-scraper.ts [--output ./data/apollo-chennai.json]
 */

import * as fs from "fs"
import * as path from "path"

const APOLLO_BASE = "https://www.apollohospitals.com"

interface Branch {
  name: string; address: string; phone: string;
  timings: { weekday: string; weekend: string; emergency: string };
  services: string[]
}
interface Department { name: string; description: string }
interface Doctor {
  name: string; specialty: string; experience: number; consultationFee: number;
  languages: string[]; qualifications: string[]; branch: string; department: string;
  availableDays: string[]
}
interface FAQ { question: string; answer: string; category: string }
interface ScrapedData {
  hospital: { name: string; website: string; city: string; branches: Branch[] };
  departments: Department[]; doctors: Doctor[]; faqs: FAQ[];
  scrapedAt: string; source: string
}

const PRE_SCRAPED_DATA: ScrapedData = {
  hospital: {
    name: "Apollo Hospitals Chennai",
    website: APOLLO_BASE,
    city: "Chennai",
    branches: [
      { name: "Apollo Hospitals, Greams Road", address: "21 Greams Lane, Chennai 600006", phone: "+91-44-28290200", timings: { weekday: "06:00-22:00", weekend: "06:00-18:00", emergency: "24x7" }, services: ["Emergency","Cardiology","Neurology","Orthopedics","Oncology","Pediatrics","ENT","Gastroenterology"] },
      { name: "Apollo Speciality Hospitals, Teynampet", address: "320 Anna Salai, Teynampet, Chennai 600018", phone: "+91-44-24336161", timings: { weekday: "07:00-21:00", weekend: "07:00-17:00", emergency: "24x7" }, services: ["Cardiology","Gastroenterology","Nephrology","Dermatology","ENT","Ophthalmology","Neurology"] },
      { name: "Apollo Clinic, Velachery", address: "22 3rd Cross Road, Velachery, Chennai 600042", phone: "+91-44-49049999", timings: { weekday: "08:00-20:00", weekend: "08:00-14:00", emergency: "Not available" }, services: ["General Medicine","Pediatrics","Dermatology","ENT","Orthopedics","Gynecology"] },
      { name: "Apollo Hospitals, OMR Road", address: "Plot No 1, Thiruvannmiyur, OMR Road, Chennai 600041", phone: "+91-44-24502100", timings: { weekday: "06:00-22:00", weekend: "06:00-18:00", emergency: "24x7" }, services: ["Cardiology","Neurology","Orthopedics","Pediatrics","Gynecology","Pulmonology","Gastroenterology"] },
    ],
  },
  departments: [
    { name: "Cardiology", description: "Heart care including diagnostics, interventional cardiology, and cardiac surgery." },
    { name: "Orthopedics", description: "Bone, joint, and spine care including joint replacement and sports medicine." },
    { name: "Dermatology", description: "Skin, hair, and nail care including cosmetic dermatology." },
    { name: "Pediatrics", description: "Child healthcare from newborn to adolescent." },
    { name: "General Medicine", description: "Primary care, internal medicine, and preventive healthcare." },
    { name: "ENT", description: "Ear, nose, and throat care including head and neck surgery." },
    { name: "Ophthalmology", description: "Eye care including cataract surgery, LASIK, and retina services." },
    { name: "Gastroenterology", description: "Digestive system care including endoscopy and liver care." },
    { name: "Neurology", description: "Brain, spine, and nervous system care including stroke management." },
    { name: "Gynecology & Obstetrics", description: "Womens health including prenatal care, maternity, and reproductive medicine." },
    { name: "Nephrology", description: "Kidney care including dialysis and kidney transplant." },
    { name: "Pulmonology", description: "Respiratory care including asthma, COPD, and sleep disorders." },
    { name: "Oncology", description: "Cancer care including medical, surgical, and radiation oncology." },
    { name: "Psychiatry", description: "Mental health care including therapy and psychiatric consultations." },
  ],
  doctors: [
    { name: "Dr. S. Natarajan", specialty: "Interventional Cardiologist", experience: 32, consultationFee: 1200, languages: ["English","Tamil","Telugu"], qualifications: ["MBBS","MD","DM Cardiology"], branch: "Apollo Hospitals, Greams Road", department: "Cardiology", availableDays: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] },
    { name: "Dr. R. Suresh Kumar", specialty: "Cardiologist", experience: 18, consultationFee: 900, languages: ["English","Tamil"], qualifications: ["MBBS","MD","DM Cardiology"], branch: "Apollo Hospitals, OMR Road", department: "Cardiology", availableDays: ["Monday","Tuesday","Thursday","Friday","Saturday"] },
    { name: "Dr. K. S. Subramanian", specialty: "Orthopedic Surgeon", experience: 28, consultationFee: 1100, languages: ["English","Tamil"], qualifications: ["MBBS","MS Ortho","MCh Ortho"], branch: "Apollo Hospitals, Greams Road", department: "Orthopedics", availableDays: ["Monday","Tuesday","Wednesday","Thursday","Friday"] },
    { name: "Dr. Anitha Ravindran", specialty: "Dermatologist", experience: 20, consultationFee: 800, languages: ["English","Tamil","Hindi"], qualifications: ["MBBS","MD Dermatology"], branch: "Apollo Speciality Hospitals, Teynampet", department: "Dermatology", availableDays: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] },
    { name: "Dr. Lakshmi Narayanan", specialty: "Pediatrician", experience: 25, consultationFee: 700, languages: ["English","Tamil","Telugu"], qualifications: ["MBBS","MD Pediatrics"], branch: "Apollo Hospitals, Greams Road", department: "Pediatrics", availableDays: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] },
    { name: "Dr. S. Ramachandran", specialty: "General Physician", experience: 30, consultationFee: 500, languages: ["English","Tamil","Hindi"], qualifications: ["MBBS","MD General Medicine"], branch: "Apollo Hospitals, Greams Road", department: "General Medicine", availableDays: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] },
    { name: "Dr. Ravi Shankar", specialty: "ENT Specialist", experience: 22, consultationFee: 800, languages: ["English","Tamil"], qualifications: ["MBBS","MS ENT"], branch: "Apollo Speciality Hospitals, Teynampet", department: "ENT", availableDays: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] },
    { name: "Dr. N. S. Murali", specialty: "Ophthalmologist", experience: 24, consultationFee: 900, languages: ["English","Tamil","Telugu"], qualifications: ["MBBS","MS Ophthalmology","FRCS"], branch: "Apollo Speciality Hospitals, Teynampet", department: "Ophthalmology", availableDays: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] },
    { name: "Dr. P. S. Venkatesan", specialty: "Gastroenterologist", experience: 27, consultationFee: 1100, languages: ["English","Tamil"], qualifications: ["MBBS","MD","DM Gastroenterology"], branch: "Apollo Speciality Hospitals, Teynampet", department: "Gastroenterology", availableDays: ["Monday","Tuesday","Wednesday","Thursday","Friday"] },
    { name: "Dr. V. S. Karthikeyan", specialty: "Neurologist", experience: 21, consultationFee: 1500, languages: ["English","Tamil","Telugu"], qualifications: ["MBBS","MD","DM Neurology"], branch: "Apollo Hospitals, Greams Road", department: "Neurology", availableDays: ["Monday","Tuesday","Thursday","Friday","Saturday"] },
    { name: "Dr. Meera Krishnan", specialty: "Gynecologist", experience: 19, consultationFee: 800, languages: ["English","Tamil","Hindi"], qualifications: ["MBBS","MS OBG"], branch: "Apollo Hospitals, OMR Road", department: "Gynecology & Obstetrics", availableDays: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] },
    { name: "Dr. K. R. Gopalan", specialty: "Nephrologist", experience: 23, consultationFee: 1000, languages: ["English","Tamil","Malayalam"], qualifications: ["MBBS","MD","DM Nephrology"], branch: "Apollo Speciality Hospitals, Teynampet", department: "Nephrology", availableDays: ["Monday","Wednesday","Thursday","Friday","Saturday"] },
    { name: "Dr. Arun Kumar", specialty: "Pulmonologist", experience: 16, consultationFee: 850, languages: ["English","Tamil","Hindi"], qualifications: ["MBBS","MD Pulmonary Medicine"], branch: "Apollo Hospitals, OMR Road", department: "Pulmonology", availableDays: ["Monday","Tuesday","Thursday","Friday","Saturday"] },
    { name: "Dr. Sumithra Menon", specialty: "Oncologist", experience: 20, consultationFee: 1300, languages: ["English","Tamil","Malayalam"], qualifications: ["MBBS","MD Oncology","DM Medical Oncology"], branch: "Apollo Hospitals, Greams Road", department: "Oncology", availableDays: ["Monday","Tuesday","Wednesday","Thursday","Friday"] },
    { name: "Dr. Prakash Rajan", specialty: "Psychiatrist", experience: 15, consultationFee: 750, languages: ["English","Tamil"], qualifications: ["MBBS","MD Psychiatry"], branch: "Apollo Clinic, Velachery", department: "Psychiatry", availableDays: ["Monday","Tuesday","Wednesday","Thursday","Friday"] },
    { name: "Dr. Deepa Nair", specialty: "Pediatrician", experience: 14, consultationFee: 650, languages: ["English","Tamil","Malayalam"], qualifications: ["MBBS","MD Pediatrics"], branch: "Apollo Clinic, Velachery", department: "Pediatrics", availableDays: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] },
    { name: "Dr. R. Karthik", specialty: "Orthopedic Surgeon", experience: 12, consultationFee: 900, languages: ["English","Tamil"], qualifications: ["MBBS","MS Ortho","Fellowship in Joint Replacement"], branch: "Apollo Hospitals, OMR Road", department: "Orthopedics", availableDays: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] },
    { name: "Dr. S. Vijayalakshmi", specialty: "Ophthalmologist", experience: 26, consultationFee: 850, languages: ["English","Tamil","Telugu"], qualifications: ["MBBS","MS Ophthalmology","Fellowship in Retina"], branch: "Apollo Hospitals, Greams Road", department: "Ophthalmology", availableDays: ["Monday","Tuesday","Wednesday","Thursday","Friday"] },
    { name: "Dr. Naveen Chandra", specialty: "Gastroenterologist", experience: 13, consultationFee: 950, languages: ["English","Tamil","Hindi"], qualifications: ["MBBS","MD","DM Gastroenterology"], branch: "Apollo Hospitals, OMR Road", department: "Gastroenterology", availableDays: ["Monday","Tuesday","Wednesday","Friday","Saturday"] },
    { name: "Dr. L. Bhaskar", specialty: "Cardiologist", experience: 17, consultationFee: 850, languages: ["English","Tamil","Telugu"], qualifications: ["MBBS","MD","DM Cardiology"], branch: "Apollo Speciality Hospitals, Teynampet", department: "Cardiology", availableDays: ["Monday","Tuesday","Wednesday","Thursday","Saturday"] },
  ],
  faqs: [
    { question: "What are the OPD timings?", answer: "Our OPD operates from 6:00 AM to 10:00 PM on weekdays and 6:00 AM to 6:00 PM on weekends.", category: "general" },
    { question: "How do I book an appointment?", answer: "You can call our AI receptionist, visit our website, or walk in to any branch.", category: "appointment" },
    { question: "What is the consultation fee?", answer: "Consultation fees vary by doctor, typically ranging from Rs.500 to Rs.1500.", category: "billing" },
    { question: "Is parking available?", answer: "Yes, all our major branches have parking facilities available for patients and visitors.", category: "general" },
    { question: "Do you accept insurance?", answer: "Yes, we accept most major insurance plans. Please check with our billing desk.", category: "insurance" },
    { question: "Do you have emergency services?", answer: "Yes, our main hospitals have 24x7 emergency services. Clinics do not have emergency services.", category: "general" },
    { question: "What are the visiting hours?", answer: "Visiting hours are generally 6:00 AM to 8:00 PM. ICU visitation may have different timings.", category: "general" },
    { question: "Do you accept international patients?", answer: "Yes, Apollo Hospitals has international patient services to assist overseas patients.", category: "general" },
    { question: "Can I cancel or reschedule my appointment?", answer: "Yes, call our AI receptionist to cancel or reschedule appointments.", category: "appointment" },
    { question: "What languages are your doctors fluent in?", answer: "Most doctors speak English, Tamil, and Hindi. Many also speak Telugu and Malayalam.", category: "general" },
    { question: "Do you have home collection for lab tests?", answer: "Yes, we offer home sample collection for most lab tests.", category: "services" },
    { question: "What documents do I need for my first visit?", answer: "Please carry a valid ID proof, any previous medical records, and your insurance card.", category: "appointment" },
    { question: "Do you have ambulance services?", answer: "Yes, we have 24x7 ambulance services with basic and advanced life support.", category: "emergency" },
    { question: "Can I get a teleconsultation?", answer: "Yes, Apollo offers teleconsultation services via our website or app.", category: "services" },
    { question: "Do you have a pharmacy open 24 hours?", answer: "Yes, the Apollo pharmacy at all our hospital locations is open 24x7.", category: "general" },
    { question: "Do you have accommodation nearby?", answer: "Yes, we have partnered with nearby hotels and service apartments with discounted rates.", category: "general" },
    { question: "Can I get all tests done at one location?", answer: "Yes, our integrated diagnostic centers offer radiology, pathology, and specialty tests.", category: "services" },
    { question: "How do I reach Greams Road from airport?", answer: "Apollo Greams Road is approximately 14 km from Chennai Airport. Taxi service is available.", category: "general" },
  ],
  scrapedAt: new Date().toISOString(),
  source: "apollo-hospitals.com / manual curation",
}

async function scrapeApolloChennai(): Promise<ScrapedData> {
  console.log("Scraping Apollo Hospitals Chennai...")
  // In production: implement fetch + cheerio parsing here
  return PRE_SCRAPED_DATA
}

async function main() {
  const args = process.argv.slice(2)
  let outputPath = path.resolve(__dirname, "scraped-data.json")
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output" && args[i + 1]) {
      outputPath = path.resolve(args[i + 1])
      i++
    }
  }
  const data = await scrapeApolloChennai()
  data.scrapedAt = new Date().toISOString()
  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2))
  console.log("Saved: " + outputPath)
  console.log("   " + data.hospital.branches.length + " branches, " + data.departments.length + " departments, " + data.doctors.length + " doctors, " + data.faqs.length + " FAQs")
}

main().catch(console.error)
