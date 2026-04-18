let eventBusWorker = null
let fetchWorker = null
let subscribers = new Set()
let sourceStatusSubscribers = new Set()
let sourceStatuses = {}

/**
 * Dev-only breadcrumbs: log the first N events per source so it is obvious at a
 * glance whether data is actually flowing. Disabled in production builds.
 */
const BREADCRUMB_LIMIT = 5
const DEV_BREADCRUMBS = Boolean(import.meta?.env?.DEV)
const breadcrumbCounts = new Map()

function logBreadcrumb(event) {
  if (!DEV_BREADCRUMBS || !event) return
  const src = event.source || 'unknown'
  const count = breadcrumbCounts.get(src) || 0
  if (count >= BREADCRUMB_LIMIT) return
  breadcrumbCounts.set(src, count + 1)
  // eslint-disable-next-line no-console
  console.info(
    `[eventBus] first-${count + 1}/${BREADCRUMB_LIMIT} from ${src}:`,
    {
      title: event.title,
      dimension: event.dimension,
      priority: event.priority,
      lat: event.lat,
      lng: event.lng,
      ts: event.timestamp,
    },
  )
}

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
      const events = msg.data.events || []
      // #region agent log
      try { fetch('http://127.0.0.1:7897/ingest/4068bc9a-6323-4a56-a79a-75d6b868c769',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'894d50'},body:JSON.stringify({sessionId:'894d50',location:'eventBus.js:EVENTS',message:'L3 fetchWorker EVENTS received',data:{sourceId:msg.data.sourceId,count:events.length,firstSource:events[0]?.source||null,firstDim:events[0]?.dimension||null},hypothesisId:'H3',timestamp:Date.now()})}).catch(()=>{}) } catch(e){}
      // #endregion
      if (DEV_BREADCRUMBS && events.length) {
        for (const evt of events) logBreadcrumb(evt)
      }
      eventBusWorker.postMessage({
        type: 'INGEST',
        payload: { events },
      })
    }

    if (type === 'SOURCE_STATUS') {
      sourceStatuses[msg.data.sourceId] = {
        status: msg.data.status,
        lastFetch: msg.data.lastFetch,
        eventCount: msg.data.eventCount,
        warning: msg.data.warning,
      }
      if (DEV_BREADCRUMBS) {
        // eslint-disable-next-line no-console
        console.info(
          `[eventBus] ${msg.data.sourceId} → ${msg.data.status}`,
          { events: msg.data.eventCount, warning: msg.data.warning || null },
        )
      }
      for (const fn of sourceStatusSubscribers) fn({ ...sourceStatuses })
    }

    if (type === 'SOURCE_ERROR') {
      sourceStatuses[msg.data.sourceId] = {
        status: 'error',
        error: msg.data.error,
        nextRetry: msg.data.nextRetry,
      }
      if (DEV_BREADCRUMBS) {
        // eslint-disable-next-line no-console
        console.warn(
          `[eventBus] ${msg.data.sourceId} → error`,
          { error: msg.data.error, nextRetry: msg.data.nextRetry },
        )
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
