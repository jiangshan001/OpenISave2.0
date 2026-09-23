import type { FormInstance } from 'antd';

/**
 * Validate a form and return its values, or `null` when validation failed.
 *
 * antd's `validateFields()` rejects on invalid input. Modal `onOk` handlers do
 * not await that promise, so an unguarded call surfaces as an unhandled
 * rejection while the user simply sees the field errors. Callers use this and
 * bail out quietly instead.
 */
export async function validateOrNull<T>(form: FormInstance<T>): Promise<T | null> {
  try {
    return await form.validateFields();
  } catch {
    // The form already shows the per-field messages.
    return null;
  }
}
