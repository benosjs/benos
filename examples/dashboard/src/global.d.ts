export {}

declare global {
  interface Window {
    __dashboardReady?: boolean
    __dashboardRequests?: string[]
  }
}
