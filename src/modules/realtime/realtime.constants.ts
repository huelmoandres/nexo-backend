export const REALTIME_PUSH_EVENT = 'realtime.push';
export const REALTIME_NAMESPACE = '/realtime';

export interface RealtimePushPayload {
  userId: string;
  event: string;
  data: unknown;
}
