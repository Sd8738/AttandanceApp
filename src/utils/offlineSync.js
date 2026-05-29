/**
 * Offline Attendance Queue using localStorage.
 * Records are saved when offline -> synced when online.
 */

const QUEUE_KEY = 'authentrack_offline_queue';

export function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function addToOfflineQueue(record) {
  const queue = getOfflineQueue();
  queue.push({ ...record, _offlineId: Date.now() + Math.random() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearOfflineQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

export function removeFromOfflineQueue(offlineId) {
  const queue = getOfflineQueue().filter((r) => r._offlineId !== offlineId);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function getOfflineQueueCount() {
  return getOfflineQueue().length;
}
