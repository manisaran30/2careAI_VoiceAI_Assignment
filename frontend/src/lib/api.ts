const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  doctors: {
    list: (params?: { specialty?: string; branch?: string }) => {
      const q = new URLSearchParams()
      if (params?.specialty) q.set("specialty", params.specialty)
      if (params?.branch) q.set("branch", params.branch)
      const qs = q.toString()
      return fetchApi<{ success: boolean; data: any[] }>(`/api/doctors${qs ? `?${qs}` : ""}`)
    },
    get: (id: string) => fetchApi<{ success: boolean; data: any }>(`/api/doctors/${id}`),
  },
  departments: {
    list: () => fetchApi<{ success: boolean; data: any[] }>("/api/departments"),
    get: (id: string) => fetchApi<{ success: boolean; data: any }>(`/api/departments/${id}`),
  },
  patients: {
    search: (phone: string) =>
      fetchApi<{ success: boolean; data: any | null }>(`/api/patients/search?phone=${encodeURIComponent(phone)}`),
    create: (data: { name: string; phone: string; email?: string }) =>
      fetchApi<{ success: boolean; data: any }>("/api/patients", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
  appointments: {
    list: (params?: { phone?: string; date?: string; status?: string }) => {
      const q = new URLSearchParams()
      if (params?.phone) q.set("phone", params.phone)
      if (params?.date) q.set("date", params.date)
      if (params?.status) q.set("status", params.status)
      const qs = q.toString()
      return fetchApi<{ success: boolean; data: any[] }>(`/api/appointments${qs ? `?${qs}` : ""}`)
    },
    create: (data: any) =>
      fetchApi<{ success: boolean; data: any }>("/api/appointments", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    reschedule: (id: string, data: { date: string; time: string }) =>
      fetchApi<{ success: boolean; data: any }>(`/api/appointments/${id}/reschedule`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    cancel: (id: string) =>
      fetchApi<{ success: boolean; data: any }>(`/api/appointments/${id}/cancel`, { method: "PATCH" }),
    slots: (doctorId: string, date: string) =>
      fetchApi<{ success: boolean; data: string[] }>(
        `/api/appointments/slots?doctorId=${doctorId}&date=${date}`
      ),
  },
  dashboard: {
    stats: () => fetchApi<{ success: boolean; data: any }>("/api/dashboard/stats"),
    recent: () => fetchApi<{ success: boolean; data: any }>("/api/dashboard/recent"),
  },
  callbacks: {
    list: (status?: string) =>
      fetchApi<{ success: boolean; data: any[] }>(`/api/callbacks${status ? `?status=${status}` : ""}`),
    create: (data: { patientId: string; reason: string; notes?: string }) =>
      fetchApi<{ success: boolean; data: any }>("/api/callbacks", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
  evaluations: {
    scenarios: () => fetchApi<{ success: boolean; data: any[] }>("/api/evaluations/scenarios"),
    results: () => fetchApi<{ success: boolean; data: any[] }>("/api/evaluations/results"),
    run: (scenario: string) =>
      fetchApi<{ success: boolean; data: any }>("/api/evaluations/run", {
        method: "POST",
        body: JSON.stringify({ scenario }),
      }),
  },
  calls: {
    initiate: (phone: string) =>
      fetchApi<{ success: boolean; data: { message: string; status: string; execution_id: string } }>("/api/calls/initiate", {
        method: "POST",
        body: JSON.stringify({ recipient_phone_number: phone }),
      }),
  },
  voiceCall: {
    initiate: (phone: string) =>
      fetchApi<{ success: boolean; data: { sessionId: string; callLogId: string; executionId?: string; status: string; error?: string } }>("/api/voice-call/initiate", {
        method: "POST",
        body: JSON.stringify({ phone }),
      }),
    end: (sessionId: string) =>
      fetchApi<{ success: boolean; data: { sessionId: string; status: string } }>(`/api/voice-call/${sessionId}/end`, {
        method: "POST",
      }),
    get: (sessionId: string) =>
      fetchApi<{ success: boolean; data: any }>(`/api/voice-call/${sessionId}`),
    list: () =>
      fetchApi<{ success: boolean; data: any[] }>("/api/voice-call"),
    requestCallback: (data: { phone: string; name?: string; reason: string }) =>
      fetchApi<{ success: boolean; data: any }>("/api/voice-call/callback-request", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
}
