import { toast } from 'svelte-sonner';

export const notificationDuration = 5_000;
export function notifySuccess(message: string, id = 'form-feedback') {
  return toast.success(message, { id, duration: notificationDuration });
}
export function notifyError(message: string, id = 'form-feedback') {
  return toast.error(message, { id, duration: notificationDuration });
}
