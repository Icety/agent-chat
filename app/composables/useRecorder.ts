// Voice notes. Safari records audio/mp4, Chrome and Firefox audio/webm.
const pickMime = (): string => {
  const options = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']
  return options.find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? ''
}

export const useRecorder = () => {
  const recording = ref(false)
  const seconds = ref(0)
  let recorder: MediaRecorder | undefined
  let chunks: Blob[] = []
  let timer: ReturnType<typeof setInterval> | undefined

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mimeType = pickMime()
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    chunks = []
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
    recorder.start()
    recording.value = true
    seconds.value = 0
    timer = setInterval(() => { seconds.value++ }, 1000)
  }

  const finish = (keep: boolean): Promise<Blob | null> => new Promise(resolve => {
    if (!recorder) return resolve(null)
    const current = recorder
    current.onstop = () => {
      current.stream.getTracks().forEach(t => t.stop())
      resolve(keep && chunks.length > 0 ? new Blob(chunks, { type: current.mimeType || 'audio/webm' }) : null)
    }
    current.stop()
    clearInterval(timer)
    recording.value = false
    recorder = undefined
  })

  return { recording, seconds, start, stop: () => finish(true), cancel: () => finish(false) }
}
