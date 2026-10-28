export {}

declare global {
  interface Window {
    __dashboardReady?: boolean
    __dashboardHydration?: {
      serverRendered: boolean
      mismatches: unknown[]
    }
    __dashboardRequests?: string[]
  }
}
