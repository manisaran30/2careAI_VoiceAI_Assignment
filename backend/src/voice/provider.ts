export interface CallParams {
  recipientPhone: string;
  fromPhone?: string;
  userData?: Record<string, string>;
}

export interface CallResult {
  executionId: string;
  status: string;
  message: string;
}

export interface CallStatus {
  status: string;
  duration?: number;
  transcript?: string;
  summary?: string;
  error?: string;
}

export interface VoiceProvider {
  initiateCall(params: CallParams): Promise<CallResult>;
  endCall(executionId: string): Promise<void>;
  getCallStatus(executionId: string): Promise<CallStatus>;
}
