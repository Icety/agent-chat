import { rmSync } from 'node:fs'
import type { Exec } from './sessions'

export interface TranscriberConfig {
  whisperBin: string
  model: string
  lang: string
  exec: Exec
}

// Voice note -> text with whisper.cpp. Null when whisper is not set up (e.g. on a dev Mac).
export const createTranscriber = (config: TranscriberConfig) => async (audioPath: string): Promise<string | null> => {
  if (!config.whisperBin || !config.model) return null
  const wav = `${audioPath}.16k.wav`
  try {
    const convert = await config.exec(['ffmpeg', '-loglevel', 'error', '-y', '-i', audioPath, '-ar', '16000', '-ac', '1', wav])
    if (convert.code !== 0) throw new Error(`ffmpeg failed: ${convert.stderr.trim()}`)
    const run = await config.exec([config.whisperBin, '-m', config.model, '-f', wav, '-l', config.lang, '-nt', '-np'])
    if (run.code !== 0) throw new Error(`whisper failed: ${run.stderr.trim()}`)
    return run.stdout.replace(/\s+/g, ' ').trim()
  }
  finally {
    rmSync(wav, { force: true })
  }
}
