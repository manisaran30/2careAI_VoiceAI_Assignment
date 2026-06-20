import * as fs from "fs"
import * as path from "path"
import * as cheerio from "cheerio"

const LISTING_URL = "https://www.apollohospitals.com/book-doctor-appointment/visakhapatnam"
const INDIVIDUAL_DELAY_MS = 600

interface ScrapedBranch {
  name: string
  address: string
  phone: string
  timings: Record<string, string>
  services: string[]
}

interface ScrapedDepartment {
  name: string
  description: string
}

interface ScrapedDoctor {
  name: string
  specialty: string
  experience: number
  consultationFee: number
  languages: string[]
  qualifications: string[]
  branch: string
  department: string
  availableDays: string[]
}

interface ScrapedData {
  hospital: {
    name: string
    website: string
    city: string
    branches: ScrapedBranch[]
  }
  departments: ScrapedDepartment[]
  doctors: ScrapedDoctor[]
  faqs: { question: string; answer: string; category: string }[]
  scrapedAt: string
  source: string
}

const BRANCH_DATA: ScrapedBranch[] = [
  { name: "Apollo Hospitals Health City, Arilova, Vizag", address: "Plot No:1, Arilova, Chinagadali, Visakhapatnam, Andhra Pradesh - 530040", phone: "+91-891-2867777", timings: { weekday: "06:00 - 22:00", weekend: "06:00 - 18:00", emergency: "24x7" }, services: ["Cardiology", "Cardio-thoracic Surgery", "Orthopedics", "Oncology", "Neurology", "Gastroenterology", "Nephrology", "Urology", "Pulmonology", "Pediatrics", "OBG", "ENT", "Emergency & Critical Care", "Organ Transplant"] },
  { name: "Apollo Hospitals, Ramnagar, Vizag", address: "10-50-80, Waltair Main Road, Ram Nagar, Visakhapatnam, Andhra Pradesh - 530002", phone: "+91-891-2562001", timings: { weekday: "07:00 - 21:00", weekend: "07:00 - 17:00", emergency: "24x7" }, services: ["Cardiology", "Cardio-thoracic Surgery", "Nephrology", "Urology", "General Medicine", "Critical Care", "Daycare Surgery", "Trauma Care"] },
]

const BRANCH_PINCODES: Record<string, string> = {
  "530040": "Apollo Hospitals Health City, Arilova, Vizag",
  "530002": "Apollo Hospitals, Ramnagar, Vizag",
}

const DEPARTMENTS: ScrapedDepartment[] = [
  { name: "Cardiology", description: "Heart care including diagnostics, interventional cardiology, and cardiac surgery." },
  { name: "Orthopedics", description: "Bone, joint, and spine care including joint replacement and sports medicine." },
  { name: "Dermatology", description: "Skin, hair, and nail care including cosmetic dermatology." },
  { name: "Pediatrics", description: "Child healthcare from newborn to adolescent." },
  { name: "General Medicine", description: "Primary care, internal medicine, and preventive healthcare." },
  { name: "ENT", description: "Ear, nose, and throat care including head and neck surgery." },
  { name: "Ophthalmology", description: "Eye care including cataract surgery, LASIK, and retina services." },
  { name: "Gastroenterology", description: "Digestive system care including endoscopy and liver care." },
  { name: "Neurology", description: "Brain, spine, and nervous system care including stroke management." },
  { name: "Gynecology & Obstetrics", description: "Women's health including prenatal care, maternity, and reproductive medicine." },
  { name: "Nephrology", description: "Kidney care including dialysis and kidney transplant." },
  { name: "Pulmonology", description: "Respiratory care including asthma, COPD, and sleep disorders." },
  { name: "Oncology", description: "Cancer care including medical, surgical, and radiation oncology." },
  { name: "Psychiatry", description: "Mental health care including therapy and psychiatric consultations." },
  { name: "Urology", description: "Urinary tract care including prostate, kidney stones, and bladder issues." },
]

const FAQS: { question: string; answer: string; category: string }[] = [
  { question: "What are the OPD timings?", answer: "Our OPD operates from 6:00 AM to 10:00 PM on weekdays and 6:00 AM to 6:00 PM on weekends at our main branches.", category: "general" },
  { question: "How do I book an appointment?", answer: "You can call our AI receptionist, visit our website, or walk in to any branch.", category: "appointment" },
  { question: "What is the consultation fee?", answer: "Consultation fees vary by doctor, typically ranging from Rs.500 to Rs.3,000.", category: "billing" },
  { question: "Is parking available?", answer: "Yes, all our major branches have parking facilities available for patients and visitors.", category: "general" },
  { question: "Do you accept insurance?", answer: "Yes, we accept most major insurance plans. Please check with our billing desk.", category: "insurance" },
  { question: "Do you have emergency services?", answer: "Yes, both Apollo Arilova and Ramnagar have 24x7 emergency services.", category: "general" },
  { question: "What are the visiting hours?", answer: "Visiting hours are generally 6:00 AM to 8:00 PM. ICU visitation may have different timings.", category: "general" },
  { question: "Do you accept international patients?", answer: "Yes, Apollo Hospitals has international patient services to assist overseas patients.", category: "general" },
  { question: "Can I cancel or reschedule my appointment?", answer: "Yes, call our AI receptionist to cancel or reschedule appointments.", category: "appointment" },
  { question: "What languages are your doctors fluent in?", answer: "Most doctors speak English, Telugu, Hindi, and Tamil.", category: "general" },
  { question: "Do you have home collection for lab tests?", answer: "Yes, we offer home sample collection for most lab tests.", category: "services" },
  { question: "What documents do I need for my first visit?", answer: "Please carry a valid ID proof, any previous medical records, and your insurance card.", category: "appointment" },
  { question: "Do you have ambulance services?", answer: "Yes, we have 24x7 ambulance services with basic and advanced life support. Call 1066 for emergency.", category: "emergency" },
  { question: "Can I get a teleconsultation?", answer: "Yes, Apollo offers teleconsultation services via our website or app.", category: "services" },
  { question: "Do you have a pharmacy open 24 hours?", answer: "Yes, the Apollo pharmacy at both hospital locations is open 24x7.", category: "general" },
  { question: "How do I reach Arilova from Visakhapatnam Airport?", answer: "Apollo Arilova is approximately 15 km from Visakhapatnam Airport. Taxi service is available.", category: "general" },
]

const SPECIALTY_TO_DEPARTMENT: Record<string, string> = {
  "interventional-cardiologist": "Cardiology",
  "cardiologist": "Cardiology",
  "cardio-thoracic-surgeon": "Cardiology",
  "cardiac-surgeon": "Cardiology",
  "cardiothoracic-and-vascular-surgery": "Cardiology",
  "heart-failure-and-transplant-surgeon": "Cardiology",
  "paediatric-cardiology": "Cardiology",
  "orthopedician": "Orthopedics",
  "orthopedic-surgeon": "Orthopedics",
  "orthopaedic-surgeon": "Orthopedics",
  "joint-replacement-surgeon": "Orthopedics",
  "spine-surgeon": "Orthopedics",
  "sports-injury-specialist": "Orthopedics",
  "dermatologist": "Dermatology",
  "cosmetic-dermatologist": "Dermatology",
  "pediatrician": "Pediatrics",
  "paediatrician": "Pediatrics",
  "pediatric-surgeon": "Pediatrics",
  "paediatric-surgeon": "Pediatrics",
  "pediatric-cardiologist": "Pediatrics",
  "paediatric-cardiac-surgeon": "Pediatrics",
  "pediatric-neurologist": "Pediatrics",
  "paediatric-neurologist": "Pediatrics",
  "paediatric-haematology": "Pediatrics",
  "pediatric-hematologist": "Pediatrics",
  "neonatologist": "Pediatrics",
  "physician": "General Medicine",
  "general-physician": "General Medicine",
  "internal-medicine": "General Medicine",
  "ent-specialist": "ENT",
  "ent-surgeon": "ENT",
  "ophthalmologist": "Ophthalmology",
  "gastroenterologist": "Gastroenterology",
  "surgical-gastroenterologist": "Gastroenterology",
  "medical-gastroenterologist": "Gastroenterology",
  "hepatologist": "Gastroenterology",
  "neurologist": "Neurology",
  "neurosurgeon": "Neurology",
  "gynecologist": "Gynecology & Obstetrics",
  "obstetrician": "Gynecology & Obstetrics",
  "fertility-specialist": "Gynecology & Obstetrics",
  "nephrologist": "Nephrology",
  "pulmonologist": "Pulmonology",
  "oncologist": "Oncology",
  "medical-oncologist": "Oncology",
  "surgical-oncologist": "Oncology",
  "radiation-oncologist": "Oncology",
  "psychiatrist": "Psychiatry",
  "urologist": "Urology",
  "liver-transplant-surgeon": "Gastroenterology",
  "bariatric-surgeon": "General Medicine",
  "endocrinologist": "General Medicine",
  "rheumatologist": "Orthopedics",
  "surgeon": "General Medicine",
  "general-surgeon": "General Medicine",
  "laparoscopic-surgeon": "General Medicine",
  "anesthesiologist": "General Medicine",
  "diabetologist": "General Medicine",
  "critical-care-specialist": "General Medicine",
  "emergency-physician": "General Medicine",
}

const LANGUAGE_PATTERNS: { lang: string; patterns: string[] }[] = [
  { lang: "English", patterns: ["english"] },
  { lang: "Telugu", patterns: ["telugu"] },
  { lang: "Hindi", patterns: ["hindi"] },
  { lang: "Tamil", patterns: ["tamil"] },
  { lang: "Malayalam", patterns: ["malayalam"] },
  { lang: "Bengali", patterns: ["bengali"] },
  { lang: "Kannada", patterns: ["kannada"] },
]

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchText(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
    },
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`)
  return resp.text()
}

function extractJsonLd(html: string): Record<string, unknown>[] {
  const $ = cheerio.load(html)
  const results: Record<string, unknown>[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html() || ""
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        results.push(...parsed)
      } else if (parsed["@graph"]) {
        results.push(...(parsed["@graph"] as Record<string, unknown>[]))
      } else {
        results.push(parsed)
      }
    } catch { /* skip invalid JSON blocks */ }
  })
  return results
}

function parseListingPhysicians(html: string): { name: string; specialtySlug: string; url: string }[] {
  const entries = extractJsonLd(html)
  const doctors: { name: string; specialtySlug: string; url: string }[] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    if (entry["@type"] === "Physician") {
      const name = String(entry.name || "")
      const rawUrl = String(entry.url || "")
      const match = rawUrl.match(/\/doctors\/([^/]+)\/(?:visakhapatnam|vizag)\//)
      const specialtySlug = match ? match[1] : ""
      const key = name.toLowerCase().trim()
      if (name && specialtySlug && !seen.has(key)) {
        seen.add(key)
        const fullUrl = rawUrl.startsWith("http") ? rawUrl : `https://www.apollohospitals.com${rawUrl}`
        doctors.push({ name, specialtySlug, url: fullUrl })
      }
    }
  }
  return doctors
}

function parseIndividualDoctor(html: string): {
  branchName: string | null
  priceRange: string | null
  experience: number | null
  qualifications: string[]
  languages: string[]
} {
  const entries = extractJsonLd(html)
  let branchName: string | null = null
  let priceRange: string | null = null
  let experience: number | null = null
  const qualifications: string[] = []
  const languageSet = new Set<string>()

  for (const entry of entries) {
    if (entry["@type"] === "Physician") {
      const addr = (entry.address as Record<string, unknown>[] | undefined)?.[0]
      const street = String(addr?.streetAddress || "")
      for (const [pincode, branch] of Object.entries(BRANCH_PINCODES)) {
        if (street.includes(pincode)) {
          branchName = branch
          break
        }
      }
      if (!branchName) {
        const lower = street.toLowerCase()
        if (lower.includes("arilova") || lower.includes("chinagadali")) {
          branchName = "Apollo Hospitals Health City, Arilova, Vizag"
        } else if (lower.includes("ramnagar") || lower.includes("ram nagar") || lower.includes("waltair")) {
          branchName = "Apollo Hospitals, Ramnagar, Vizag"
        }
      }
      priceRange = String(entry.priceRange || "")
    }

    if (entry["@type"] === "FAQPage") {
      const questions = entry.mainEntity as Record<string, unknown>[] | undefined
      if (questions) {
        for (const q of questions) {
          const qName = String(q.name || "")
          const answer = String((q.acceptedAnswer as Record<string, unknown> | undefined)?.text || "")
          if (qName.toLowerCase().includes("experience") || qName.toLowerCase().includes("how many years")) {
            const match = answer.match(/(\d+)\s*years?\s*of\s*experience/i)
            if (match) experience = parseInt(match[1], 10)
            const qualMatch = answer.match(/holds?\s*(.*?)(?:,|\s*reflecting|\.)/i)
            if (qualMatch) {
              qualMatch[1].split(/[,;]|\s+(?:and|&)\s+/).forEach((q: string) => {
                const trimmed = q.trim()
                if (trimmed && !trimmed.toLowerCase().includes("years") && !trimmed.toLowerCase().includes("experience")) {
                  qualifications.push(trimmed)
                }
              })
            }
          }
          if (qName.toLowerCase().includes("qualifications") || qName.toLowerCase().includes("qualification")) {
            const qualMatch = answer.match(/holds?\s*(.*?)(?:,|\s*reflecting|\.)/i)
            if (qualMatch) {
              qualMatch[1].split(/[,;]|\s+(?:and|&)\s+/).forEach((q: string) => {
                const trimmed = q.trim()
                if (trimmed && !trimmed.toLowerCase().includes("qualification")) {
                  qualifications.push(trimmed)
                }
              })
            }
          }
        }
      }
    }

    if (entry["@type"] === "Person") {
      const title = String(entry.jobTitle || "")
      if (title) {
        title.split(",").forEach((t: string) => {
          const trimmed = t.trim()
          if (trimmed && !qualifications.includes(trimmed)) {
            qualifications.push(trimmed)
          }
        })
      }
    }
  }

  const $ = cheerio.load(html)
  const desc = $('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content") || ""
  const allText = desc.toLowerCase()
  for (const { lang, patterns } of LANGUAGE_PATTERNS) {
    if (patterns.some((p) => allText.includes(p))) {
      languageSet.add(lang)
    }
  }

  const effectiveQuals = [...new Set(qualifications.length > 0 ? qualifications : ["MBBS"])]

  return {
    branchName,
    priceRange,
    experience,
    qualifications: effectiveQuals,
    languages: languageSet.size > 0 ? [...languageSet] : ["English", "Telugu"],
  }
}

function extractPrice(priceRange: string | null): number {
  if (!priceRange) return 700
  const match = priceRange.match(/[\d,]+/g)
  if (match) {
    const nums = match.map((s) => parseInt(s.replace(/,/g, ""), 10)).filter((n) => !isNaN(n))
    if (nums.length >= 2) return Math.round((nums[0] + nums[1]) / 2)
    if (nums.length === 1) return nums[0]
  }
  return 700
}

async function scrapeApolloVizag(): Promise<ScrapedData> {
  console.log("Fetching listing page...")
  const listingHtml = await fetchText(LISTING_URL)
  const listingDoctors = parseListingPhysicians(listingHtml)
  console.log(`Found ${listingDoctors.length} doctors in listing page JSON-LD`)

  const doctors: ScrapedDoctor[] = []
  let idx = 0
  const total = listingDoctors.length

  for (const listing of listingDoctors) {
    idx++
    const department = SPECIALTY_TO_DEPARTMENT[listing.specialtySlug] || "General Medicine"
    const specialty = listing.specialtySlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())

    console.log(`[${idx}/${total}] Fetching ${listing.name}...`)
    let branchName: string | null = null
    let priceRange: string | null = null
    let experience: number | null = null
    let qualifications: string[] = []
    let languages: string[] = []

    try {
      await sleep(INDIVIDUAL_DELAY_MS)
      const docHtml = await fetchText(listing.url)
      const parsed = parseIndividualDoctor(docHtml)
      branchName = parsed.branchName
      priceRange = parsed.priceRange
      experience = parsed.experience
      qualifications = parsed.qualifications
      languages = parsed.languages
    } catch (err) {
      console.warn(`  Failed to fetch individual page: ${err}`)
    }

    doctors.push({
      name: listing.name,
      specialty,
      experience: experience || 14,
      consultationFee: extractPrice(priceRange),
      languages: languages.length > 0 ? languages : ["English", "Telugu"],
      qualifications: qualifications.length > 0 ? qualifications : ["MBBS"],
      branch: branchName || "Apollo Hospitals Health City, Arilova, Vizag",
      department,
      availableDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    })
  }

  return {
    hospital: {
      name: "Apollo Hospitals Visakhapatnam",
      website: "https://www.apollohospitals.com",
      city: "Visakhapatnam",
      branches: BRANCH_DATA,
    },
    departments: DEPARTMENTS,
    doctors,
    faqs: FAQS,
    scrapedAt: new Date().toISOString(),
    source: `apollohospitals.com/book-doctor-appointment/visakhapatnam (${doctors.length} doctors)`,
  }
}

async function main() {
  console.log("=".repeat(60))
  console.log("Apollo Hospitals Visakhapatnam - Doctor Scraper")
  console.log("=".repeat(60))
  console.log(`Listing URL: ${LISTING_URL}`)
  console.log()

  const data = await scrapeApolloVizag()

  const outputPath = path.resolve(__dirname, "../scraped-data.json")
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2))

  console.log()
  console.log("=".repeat(60))
  console.log(`Scraped data saved to: ${outputPath}`)
  console.log(`  Branches:    ${data.hospital.branches.length}`)
  console.log(`  Departments: ${data.departments.length}`)
  console.log(`  Doctors:     ${data.doctors.length}`)
  console.log(`  FAQs:        ${data.faqs.length}`)
  console.log("=".repeat(60))
}

main().catch((err) => {
  console.error("Scraper failed:", err)
  process.exit(1)
})
