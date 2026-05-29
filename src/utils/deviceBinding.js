/**
 * Device Binding utilities.
 * Generates a persistent unique device ID and stores/validates it per user.
 */

const DEVICE_ID_KEY = 'authentrack_device_id';

/**
 * Get the current device's ID (creates one if it doesn't exist).
 */
export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    // Use crypto.randomUUID if available, otherwise fall back to a manual UUID v4
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      id = crypto.randomUUID();
    } else {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/**
 * Store a new device ID (used when user approves a new device via OTP).
 */
export function bindDevice(newId) {
  localStorage.setItem(DEVICE_ID_KEY, newId);
}

