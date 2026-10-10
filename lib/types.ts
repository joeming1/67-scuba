export type Status = "new" | "assigned" | "scheduled" | "in_progress" | "verification_pending" | "follow_up" | "unassigned" | "closed";
export type Category = "lighting" | "air_conditioning" | "student_portal" | "other";
export type Priority = "low" | "medium" | "high";
export type Source = "sensor" | "student_report";

export interface Assignment {
  department_id: string;
  department_name: string;
  technician_id: string;
  technician_name: string;
  response?: "pending" | "accepted" | "declined";
}

export interface Verification {
  type: string;
  state: "pending" | "passed" | "failed";
  last_value: number;
  unit: string;
}

export interface CompletionVerification {
  state: "passed" | "failed" | "unavailable";
  fixed?: boolean;
  confidence?: number;
  reason?: string;
  model?: string;
  photo_url?: string;
  checked_at?: string;
}

export interface TimelineEvent {
  id: string;
  type: string;
  message: string;
  created_at: string;
}

export interface Notification {
  channel: string;
  recipient?: string | null;
  status: string;
  updated_at?: string;
  provider_id?: string;
  error?: string;
}

export interface Ticket {
  id: string;
  source: Source;
  summary: string;
  description: string;
  category: Category;
  priority: Priority;
  location: string;
  status: Status;
  assignment: Assignment | null;
  declined_technician_ids: string[];
  scheduled_at: string | null;
  notification: Notification | null;
  technician_action_token: string | null;
  student_tracking_token: string;
  completion_verification: CompletionVerification | null;
  sensor_id?: string | null;
  verification?: Verification | null;
  student_email?: string | null;
  timeline: TimelineEvent[];
  created_at: string;
  updated_at: string;
  rationale?: string;
}

export interface SensorState {
  low_count: number;
  recovery_count: number;
  value: number | null;
  location: string;
  observed_at?: string;
  received_at?: string;
}

export interface PublicTicket extends Omit<Ticket, "technician_action_token" | "student_tracking_token" | "student_email"> {
  notification: { channel: string; status: string } | null;
}
