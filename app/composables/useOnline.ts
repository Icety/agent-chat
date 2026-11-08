import { readonly, ref } from 'vue'

// Whether the device has a network connection (navigator.onLine, kept current by its events).
const online = ref(true)
let listening = false

export const useOnline = () => {
  if (import.meta.client && !listening) {
    listening = true
    online.value = navigator.onLine
    window.addEventListener('online', () => { online.value = true })
    window.addEventListener('offline', () => { online.value = false })
  }
  return readonly(online)
}
