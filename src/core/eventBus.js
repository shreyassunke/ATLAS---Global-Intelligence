let eventBusWorker = null
let fetchWorker = null
let subscribers = new Set()
let sourceStatusSubscribers = new Set()
let sourceStatuses = {}

export function initEventBus() {
  if (eventBusWorker) return

  eventBusWorker = new Worker(
    new URL('../workers/eventBus.worker.js', import.meta.url),
    { type: 'module' }
  )

  fetchWorker = new Worker(
    new URL('../workers/fetchManager.worker.js', import.meta.url),
    { type: 'module' }
  )

  eventBusWorker.onmessage = (msg) => {
    const { type } = msg.data
    if (type === 'BATCH_UPDATE') {
      for (const fn of subscribers) fn(msg.data.diff)
    }
    if (type === 'SNAPSHOT') {
      for (const fn of subscribers) fn({ snapshot: msg.data.events })
    }
    if (type === 'PRIORITY_COUNTS') {
      for (const fn of subscribers) fn({ priorityCounts: msg.data.counts })
    }
  }

  fetchWorker.onmessage = (msg) => {
    const { type } = msg.data

    if (type === 'EVENTS') {
      eventBusWorker.postMessage({
        type: 'INGEST',
        payload: { events: msg.data.events },
      })
    }

    if (type === 'SOURCE_STATUS') {
      sourceStatuses[msg.data.sourceId] = {
        status: msg.data.status,
        lastFetch: msg.data.lastFetch,
        eventCount: msg.data.eventCount,
      }
      for (const fn of sourceStatusSubscribers) fn({ ...sourceStatuses })
    }

    if (type === 'SOURCE_ERROR') {
      sourceStatuses[msg.data.sourceId] = {
        status: 'error',
        error: msg.data.error,
        nextRetry: msg.data.nextRetry,
      }
      for (const fn of sourceStatusSubscribers) fn({ ...sourceStatuses })
    }
  }

  eventBusWorker.postMessage({ type: 'START' })
}

export function startFetching(sourceIds) {
  if (!fetchWorker) return

  const envKeys = {}
  const envEntries = import.meta.env || {}
  for (const [key, val] of Object.entries(envEntries)) {
    if (key.startsWith('VITE_') && val) {
      envKeys[key.replace('VITE_', '')] = val
    }
  }

  fetchWorker.postMessage({ type: 'SET_ENV', payload: { envKeys } })
  fetchWorker.postMessage({ type: 'START_ALL', payload: { sourceIds } })
}

export function stopFetching() {
  if (fetchWorker) fetchWorker.postMessage({ type: 'STOP_ALL' })
}

export function subscribeToBatchUpdates(fn) {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function subscribeToSourceStatus(fn) {
  sourceStatusSubscribers.add(fn)
  return () => sourceStatusSubscribers.delete(fn)
}

export function requestSnapshot() {
  if (eventBusWorker) eventBusWorker.postMessage({ type: 'GET_SNAPSHOT' })
}

export function requestPriorityCounts() {
  if (eventBusWorker) eventBusWorker.postMessage({ type: 'GET_PRIORITY_COUNTS' })
}

export function getSourceStatuses() {
  return { ...sourceStatuses }
}

export function destroyEventBus() {
  if (eventBusWorker) { eventBusWorker.terminate(); eventBusWorker = null }
  if (fetchWorker) { fetchWorker.terminate(); fetchWorker = null }
  subscribers.clear()
  sourceStatusSubscribers.clear()
  sourceStatuses = {}
}
