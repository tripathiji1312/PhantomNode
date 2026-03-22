import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowUpRight, ArrowDownLeft, Play, Pause, Sparkles,
  UploadCloud, Mic, Activity, Wifi, WifiOff,
  CheckCircle2, XCircle, FileDown, Send, Radio, Zap,
  Volume2, Download, Square
} from 'lucide-react'
import { cn } from './lib/utils'

/* ——————————————————————————————————————————————————
   Types
—————————————————————————————————————————————————— */
type LinkStatus = 'idle' | 'sending' | 'listening' | 'error'
type Page = 'home' | 'sender' | 'receiver'

type EventEntry = {
  id: string
  message: string
  time: string
  type?: 'info' | 'success' | 'error' | 'file'
}

type Toast = {
  id: string
  message: string
  type: 'success' | 'error' | 'info' | 'file'
}

/* ——————————————————————————————————————————————————
   Constants
—————————————————————————————————————————————————— */
const RAW_API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const API_BASE = RAW_API_BASE.replace(/\/$/, '')
const MAX_EVENTS = 50

/* ——————————————————————————————————————————————————
   App
—————————————————————————————————————————————————— */
export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [status, setStatus] = useState<LinkStatus>('idle')
  const [events, setEvents] = useState<EventEntry[]>([])
  const [connected, setConnected] = useState(false)
  const [textMessage, setTextMessage] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [sendProgress, setSendProgress] = useState('')
  const [rxProgress, setRxProgress] = useState('')
  const [receivedContent, setReceivedContent] = useState<string | null>(null)
  const [receivedFilename, setReceivedFilename] = useState('decoded_payload.txt')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pcmChunksRef = useRef<Float32Array[]>([])

  /* ———— Toast System ———— */
  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = crypto.randomUUID()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }, [])

  /* ———— Event Log ———— */
  const pushEvent = useCallback((message: string, type: EventEntry['type'] = 'info') => {
    const now = new Date()
    const time = now.toLocaleTimeString('en-GB', { hour12: false })
    setEvents(prev => [{ id: crypto.randomUUID(), message, time, type }, ...prev].slice(0, MAX_EVENTS))
  }, [])

  /* ———— Health Check (replaces WebSocket for connectivity) ———— */
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`)
        if (res.ok) {
          if (!connected) {
            setConnected(true)
            setStatus('idle')
            pushEvent('Backend connected', 'success')
          }
        } else {
          setConnected(false)
        }
      } catch {
        setConnected(false)
      }
    }
    checkHealth()
    const interval = setInterval(checkHealth, 10000)
    return () => clearInterval(interval)
  }, [connected, pushEvent])

  /* ———— WAV Encoder (raw PCM → WAV blob) ———— */
  const encodeWAV = useCallback((samples: Float32Array, sampleRate: number): Blob => {
    const buffer = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(buffer)

    // WAV header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
    }
    writeString(0, 'RIFF')
    view.setUint32(4, 36 + samples.length * 2, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)         // chunk size
    view.setUint16(20, 1, true)          // PCM format
    view.setUint16(22, 1, true)          // mono
    view.setUint32(24, sampleRate, true) // sample rate
    view.setUint32(28, sampleRate * 2, true) // byte rate
    view.setUint16(32, 2, true)          // block align
    view.setUint16(34, 16, true)         // bits per sample
    writeString(36, 'data')
    view.setUint32(40, samples.length * 2, true)

    // Convert float32 to int16
    let offset = 44
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
      offset += 2
    }

    return new Blob([buffer], { type: 'audio/wav' })
  }, [])

  /* ———— TX: Send file → get WAV back → play it ———— */
  const sendFile = useCallback(async (file: File) => {
    setStatus('sending')
    setIsPlaying(false)
    setSendProgress('Uploading to server...')
    pushEvent(`Uploading ${file.name}`, 'info')

    const form = new FormData()
    form.append('file', file)

    try {
      setSendProgress('Encoding & generating audio...')
      const res = await fetch(`${API_BASE}/tx`, { method: 'POST', body: form })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      const wavBlob = await res.blob()
      const wavUrl = URL.createObjectURL(wavBlob)

      if (audioRef.current) {
        audioRef.current.src = wavUrl
        audioRef.current.load()
        await audioRef.current.play()
        setIsPlaying(true)
      }

      setSendProgress('')
      setStatus('idle')
      pushEvent('Audio generated — playing through speakers!', 'success')
      addToast('Audio playing! Point speakers at the receiving device.', 'success')
    } catch (err) {
      setStatus('error')
      setIsPlaying(false)
      setSendProgress('')
      const msg = err instanceof Error ? err.message : 'Unknown error'
      pushEvent(`TX failed: ${msg}`, 'error')
      addToast(`Failed: ${msg}`, 'error')
    }
  }, [pushEvent, addToast])

  const onUpload = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await sendFile(file)
    e.target.value = ''
  }, [sendFile])

  const processText = useCallback(async () => {
    if (!textMessage.trim()) {
      addToast('Type something first!', 'error')
      return
    }
    const file = new File([textMessage], 'message.txt', { type: 'text/plain' })
    await sendFile(file)
    setTextMessage('')
  }, [textMessage, sendFile, addToast])

  /* ———— Drag & Drop ———— */
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])
  const handleDragLeave = useCallback(() => setIsDragging(false), [])
  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) await sendFile(file)
  }, [sendFile])

  /* ———— RX: Raw PCM recording via Web Audio API ———— */
  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 44100,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      })

      const audioCtx = new AudioContext({ sampleRate: 44100 })
      const source = audioCtx.createMediaStreamSource(stream)
      const processor = audioCtx.createScriptProcessor(4096, 1, 1)

      pcmChunksRef.current = []

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0)
        pcmChunksRef.current.push(new Float32Array(input))
      }

      source.connect(processor)
      processor.connect(audioCtx.destination)

      audioContextRef.current = audioCtx
      processorRef.current = processor
      streamRef.current = stream

      setStatus('listening')
      setRxProgress('Recording raw PCM from microphone...')
      pushEvent('Microphone armed — capturing raw PCM at 44.1kHz', 'success')
      addToast('Recording started — play the PhantomNode audio into the mic', 'info')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied'
      setStatus('error')
      pushEvent(`Mic error: ${msg}`, 'error')
      addToast(`Mic error: ${msg}`, 'error')
    }
  }, [pushEvent, addToast])

  const stopListening = useCallback(async () => {
    // Stop the audio pipeline
    processorRef.current?.disconnect()
    audioContextRef.current?.close()
    streamRef.current?.getTracks().forEach(t => t.stop())

    setRxProgress('Encoding WAV...')
    pushEvent('Recording stopped — encoding as WAV...', 'info')

    // Merge PCM chunks into a single Float32Array
    const totalLength = pcmChunksRef.current.reduce((acc, c) => acc + c.length, 0)
    const merged = new Float32Array(totalLength)
    let offset = 0
    for (const chunk of pcmChunksRef.current) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    pcmChunksRef.current = []

    // Encode as WAV
    const sampleRate = audioContextRef.current?.sampleRate || 44100
    const wavBlob = encodeWAV(merged, sampleRate)

    pushEvent(`WAV encoded: ${(wavBlob.size / 1024).toFixed(0)}KB, ${(merged.length / sampleRate).toFixed(1)}s`, 'info')

    // Send to backend for decoding
    setRxProgress('Decoding audio on server...')
    setStatus('sending')

    try {
      const form = new FormData()
      form.append('file', wavBlob, 'recording.wav')
      const res = await fetch(`${API_BASE}/rx`, { method: 'POST', body: form })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Decode failed' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      setReceivedContent(data.decoded_text ?? '')
      setReceivedFilename(data.filename ?? 'decoded_payload.txt')
      pushEvent(`Decoded: ${data.decoded_text?.slice(0, 50)}`, 'file')
      addToast('Audio decoded successfully!', 'file')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      pushEvent(`Decode failed: ${msg}`, 'error')
      addToast(`Decode failed: ${msg}`, 'error')
    }

    setRxProgress('')
    setStatus('idle')
  }, [pushEvent, addToast])

  /* ———— Derived State ———— */
  const statusLabel = useMemo(() => {
    if (status === 'error') return 'ERROR'
    if (status === 'sending') return 'PROCESSING'
    if (status === 'listening') return 'RECORDING'
    return connected ? 'ONLINE' : 'OFFLINE'
  }, [connected, status])

  const statusColor = useMemo(() => {
    if (status === 'error') return 'bg-red-500'
    if (status === 'sending') return 'bg-funky-orange'
    if (status === 'listening') return 'bg-funky-pink'
    return connected ? 'bg-funky-lime' : 'bg-surface-dim'
  }, [connected, status])

  const isBusy = status === 'sending' || status === 'listening'

  return (
    <div className="min-h-screen">
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-20">
        <motion.div
          animate={{ rotate: 360, scale: [1, 1.1, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="w-[800px] h-[800px] bg-funky-pink rounded-[40%] absolute top-[-20%] left-[-10%] blur-3xl"
        />
        <motion.div
          animate={{ rotate: -360, scale: [1, 1.2, 1] }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
          className="w-[600px] h-[600px] bg-funky-cyan rounded-[40%] absolute bottom-[-10%] right-[-10%] blur-3xl"
        />
      </div>

      {/* Toast Notifications */}
      <div className="fixed top-28 right-6 z-[100] flex flex-col gap-3 max-w-sm w-full">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 80, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.9 }}
              className={cn(
                "px-5 py-4 border-4 border-on-surface rounded-2xl shadow-neo-sm font-bold flex items-center gap-3",
                toast.type === 'success' && "bg-funky-lime",
                toast.type === 'error' && "bg-red-400 text-white",
                toast.type === 'info' && "bg-funky-cyan",
                toast.type === 'file' && "bg-funky-orange"
              )}
            >
              {toast.type === 'success' && <CheckCircle2 size={20} />}
              {toast.type === 'error' && <XCircle size={20} />}
              {toast.type === 'file' && <FileDown size={20} />}
              {toast.type === 'info' && <Zap size={20} />}
              <span className="text-sm">{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 w-full z-50 px-4 md:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between bg-surface-container/90 backdrop-blur-xl border-4 border-on-surface rounded-full px-4 md:px-6 py-3 shadow-neo">
          <button type="button" onClick={() => setPage('home')}
            className="text-xl md:text-2xl font-black tracking-tighter text-on-surface hover:text-funky-pink transition-colors">
            PHANTOM<span className="text-funky-pink">NODE</span>
          </button>

          <nav className="hidden md:flex items-center gap-2 bg-surface-dim rounded-full p-1.5 border-2 border-on-surface">
            {(['home', 'receiver', 'sender'] as const).map((tab) => (
              <motion.button key={tab} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={() => setPage(tab)}
                className={cn(
                  "px-5 py-2 rounded-full font-bold text-sm tracking-wide transition-colors relative uppercase",
                  page === tab ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface"
                )}>
                {page === tab && (
                  <motion.div layoutId="nav-pill"
                    className="absolute inset-0 bg-funky-lime border-2 border-on-surface rounded-full -z-10"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                )}
                {tab === 'receiver' ? 'Listen' : tab === 'sender' ? 'Send' : 'Home'}
              </motion.button>
            ))}
          </nav>

          <motion.div animate={{ scale: connected ? [1, 1.2, 1] : 1 }}
            transition={{ duration: 2, repeat: Infinity }}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-full border-2 border-on-surface font-black text-xs uppercase tracking-widest", statusColor)}>
            {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
            {statusLabel}
          </motion.div>
        </div>
      </header>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden px-4 pb-4">
        <div className="bg-surface-container/95 backdrop-blur-xl border-4 border-on-surface rounded-full p-2 shadow-neo flex justify-around">
          {(['home', 'sender', 'receiver'] as const).map((tab) => (
            <button key={tab} onClick={() => setPage(tab)}
              className={cn("px-4 py-2 rounded-full font-black text-xs uppercase tracking-wider transition-colors",
                page === tab ? "bg-funky-lime border-2 border-on-surface" : "text-on-surface-variant")}>
              {tab === 'sender' ? 'Send' : tab === 'receiver' ? 'Listen' : 'Home'}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto pt-32 md:pt-36 pb-32 md:pb-24 px-4 md:px-6 relative z-10">
        <AnimatePresence mode="wait">

          {/* ═══════════ HOME ═══════════ */}
          {page === 'home' && (
            <motion.div key="home"
              initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -40 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="flex flex-col items-center">

              <section className="text-center mb-12 md:mb-16 flex flex-col items-center">
                <motion.div
                  animate={{ scale: [1, 1.05, 1], rotate: [0, 3, -3, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-36 h-36 md:w-48 md:h-48 bg-funky-pink rounded-[3rem] border-8 border-on-surface shadow-neo flex items-center justify-center mb-8 relative overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.4)_0%,transparent_50%)]" />
                  <Sparkles size={72} className="text-white drop-shadow-lg" />
                </motion.div>

                <h1 className="text-5xl md:text-8xl lg:text-9xl font-black tracking-tighter text-on-surface mb-6 leading-none">
                  PHANTOM<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-funky-pink to-funky-purple">NODE.</span>
                </h1>
                <p className="text-lg md:text-2xl font-bold text-on-surface-variant max-w-2xl bg-surface-container border-4 border-on-surface px-6 md:px-8 py-4 rounded-3xl shadow-neo-sm">
                  Transmit data through ultrasonic audio waves. Send files from one device, receive on another — entirely through sound.
                </p>
              </section>

              <section className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 w-full max-w-5xl mb-16 md:mb-24">
                <motion.button whileHover={{ scale: 1.02, y: -5 }} whileTap={{ scale: 0.98 }}
                  onClick={() => setPage('sender')}
                  className="bg-funky-cyan rounded-[2rem] md:rounded-[3rem] border-8 border-on-surface shadow-neo p-6 md:p-8 flex flex-col items-start text-left group overflow-hidden relative min-h-[200px] md:min-h-[280px]">
                  <div className="w-20 h-20 md:w-24 md:h-24 bg-white border-4 border-on-surface rounded-full flex items-center justify-center mb-8 md:mb-12 shadow-neo-sm group-hover:bg-funky-pink transition-colors">
                    <ArrowUpRight size={40} className="text-on-surface group-hover:text-white transition-colors" />
                  </div>
                  <h2 className="text-4xl md:text-5xl font-black mb-2 md:mb-4">SEND</h2>
                  <p className="text-base md:text-xl font-bold opacity-90">Convert text or files into acoustic waveforms and play them through your speakers.</p>
                  <div className="absolute -bottom-10 -right-10 w-64 h-64 bg-white/20 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
                </motion.button>

                <motion.button whileHover={{ scale: 1.02, y: -5 }} whileTap={{ scale: 0.98 }}
                  onClick={() => setPage('receiver')}
                  className="bg-funky-lime rounded-[2rem] md:rounded-[3rem] border-8 border-on-surface shadow-neo p-6 md:p-8 flex flex-col items-start text-left group overflow-hidden relative min-h-[200px] md:min-h-[280px]">
                  <div className="w-20 h-20 md:w-24 md:h-24 bg-white border-4 border-on-surface rounded-full flex items-center justify-center mb-8 md:mb-12 shadow-neo-sm group-hover:bg-funky-purple transition-colors">
                    <ArrowDownLeft size={40} className="text-on-surface group-hover:text-white transition-colors" />
                  </div>
                  <h2 className="text-4xl md:text-5xl font-black mb-2 md:mb-4">RECEIVE</h2>
                  <p className="text-base md:text-xl font-bold opacity-90">Record audio via your microphone, send it for decoding, and extract the hidden data.</p>
                  <div className="absolute -top-10 -right-10 w-64 h-64 bg-white/30 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
                </motion.button>
              </section>

              {/* Stats */}
              <section className="flex flex-wrap justify-center gap-4 md:gap-6 max-w-4xl mb-16">
                {[
                  { label: "LINK", value: statusLabel, color: statusColor },
                  { label: "EVENTS", value: String(events.length), color: "bg-funky-pink" },
                  { label: "PROTOCOL", value: "FSK", color: "bg-funky-cyan" }
                ].map((stat, i) => (
                  <motion.div key={stat.label}
                    initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className={cn(stat.color, "px-6 md:px-8 py-3 md:py-4 rounded-full border-4 border-on-surface shadow-neo-sm flex items-center gap-3 md:gap-4")}>
                    <span className="text-xs font-black tracking-widest bg-white/50 px-3 py-1 rounded-full uppercase">{stat.label}</span>
                    <span className="text-xl md:text-3xl font-black">{stat.value}</span>
                  </motion.div>
                ))}
              </section>

              {/* Activity Feed */}
              {events.length > 0 && (
                <section className="w-full max-w-3xl">
                  <h3 className="text-2xl font-black mb-4 uppercase tracking-wider flex items-center gap-3">
                    <Radio size={24} className="text-funky-pink" /> Live Activity
                  </h3>
                  <div className="bg-surface-container border-4 border-on-surface rounded-3xl shadow-neo-sm overflow-hidden">
                    {events.slice(0, 6).map((ev, i) => (
                      <motion.div key={ev.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={cn("px-6 py-4 flex items-center justify-between gap-4 border-b-2 border-on-surface/10 last:border-b-0",
                          ev.type === 'error' && 'bg-red-50', ev.type === 'success' && 'bg-green-50', ev.type === 'file' && 'bg-orange-50')}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn("w-3 h-3 rounded-full shrink-0 border-2 border-on-surface",
                            ev.type === 'error' ? 'bg-red-500' : ev.type === 'success' ? 'bg-funky-lime' :
                            ev.type === 'file' ? 'bg-funky-orange' : 'bg-funky-cyan')} />
                          <span className="font-bold text-sm truncate">{ev.message}</span>
                        </div>
                        <span className="text-xs font-bold text-on-surface-variant bg-surface-dim px-3 py-1 rounded-full shrink-0 font-mono">{ev.time}</span>
                      </motion.div>
                    ))}
                  </div>
                </section>
              )}
            </motion.div>
          )}

          {/* ═══════════ SENDER ═══════════ */}
          {page === 'sender' && (
            <motion.div key="sender"
              initial={{ opacity: 0, x: 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -100 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="max-w-4xl mx-auto flex flex-col gap-8 md:gap-12">

              <div className="text-center">
                <h2 className="text-4xl md:text-6xl font-black mb-4"><span className="text-funky-pink">TRANSMIT</span> DATA</h2>
                <p className="text-lg md:text-2xl font-bold text-on-surface-variant bg-white border-4 border-on-surface rounded-full inline-block px-6 md:px-8 py-3 shadow-neo-sm">
                  Enter text or upload a file → server encodes → your browser plays the audio
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                {/* Text Input */}
                <div className="bg-funky-cyan border-8 border-on-surface rounded-[2rem] md:rounded-[2.5rem] p-6 shadow-neo flex flex-col relative overflow-hidden">
                  <div className="absolute top-4 right-4 bg-white rounded-full p-2 border-2 border-on-surface">
                    <Activity size={24} className="text-funky-pink" />
                  </div>
                  <h3 className="text-2xl md:text-3xl font-black mb-4 md:mb-6 uppercase">Write Message</h3>
                  <textarea value={textMessage} onChange={(e) => setTextMessage(e.target.value)}
                    placeholder="Type your message..." disabled={isBusy}
                    className="w-full flex-1 min-h-[180px] md:min-h-[200px] bg-white border-4 border-on-surface rounded-2xl p-4 md:p-6 text-lg md:text-xl font-bold resize-none mb-4 md:mb-6 focus:outline-none focus:ring-4 focus:ring-funky-purple disabled:opacity-50 disabled:cursor-not-allowed" />
                  <motion.button whileHover={!isBusy ? { scale: 1.02 } : {}} whileTap={!isBusy ? { scale: 0.95 } : {}}
                    onClick={processText} disabled={isBusy || !textMessage.trim()}
                    className="w-full bg-funky-pink text-on-surface border-4 border-on-surface rounded-full py-4 text-xl md:text-2xl font-black shadow-neo hover:shadow-neo-hover transition-shadow uppercase tracking-wide flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed">
                    <Send size={24} /> {status === 'sending' ? 'Processing...' : 'Send Text'}
                  </motion.button>
                </div>

                <div className="flex flex-col gap-6 md:gap-8">
                  {/* File Upload */}
                  <motion.div whileHover={!isBusy ? { scale: 1.02, rotate: -0.5 } : {}}
                    whileTap={!isBusy ? { scale: 0.95 } : {}}
                    onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                    onClick={() => !isBusy && fileInputRef.current?.click()}
                    className={cn("cursor-pointer text-white border-8 border-on-surface rounded-[2rem] md:rounded-[2.5rem] p-8 md:p-12 shadow-neo flex flex-col items-center justify-center flex-1 transition-colors min-h-[200px]",
                      isDragging ? "bg-funky-orange scale-105" : "bg-funky-purple",
                      isBusy && "opacity-50 cursor-not-allowed")}>
                    <motion.div animate={isDragging ? { scale: [1, 1.2, 1] } : {}}
                      transition={{ duration: 0.5, repeat: Infinity }}
                      className="w-20 h-20 md:w-24 md:h-24 bg-white/20 rounded-full flex items-center justify-center mb-4 md:mb-6">
                      <UploadCloud size={40} className="text-white" />
                    </motion.div>
                    <h3 className="text-3xl md:text-4xl font-black mb-2 uppercase">
                      {isDragging ? 'DROP IT!' : 'Upload File'}
                    </h3>
                    <p className="text-base md:text-lg font-bold opacity-80 uppercase tracking-widest">
                      {isDragging ? 'Release to transmit' : 'Click or drag & drop'}
                    </p>
                  </motion.div>

                  {/* Player Card */}
                  <div className="bg-surface-container border-4 border-on-surface rounded-2xl md:rounded-3xl p-5 md:p-6 shadow-neo-sm">
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-bold uppercase tracking-widest text-on-surface-variant text-xs md:text-sm">Audio Player</span>
                      <span className={cn("font-black px-3 py-1 rounded-full text-xs md:text-sm border-2 border-on-surface uppercase",
                        status === 'sending' ? 'bg-funky-orange animate-pulse' : status === 'error' ? 'bg-red-400 text-white' : 'bg-funky-lime')}>
                        {status === 'sending' ? 'Processing...' : isPlaying ? 'Playing' : 'Ready'}
                      </span>
                    </div>

                    {sendProgress && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="text-sm font-bold text-on-surface-variant mb-3 bg-funky-lime/30 px-3 py-2 rounded-xl border-2 border-on-surface/20">
                        ⚡ {sendProgress}
                      </motion.p>
                    )}

                    <div className="flex items-center gap-4">
                      <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                        onClick={() => {
                          if (audioRef.current?.src) {
                            if (isPlaying) { audioRef.current.pause(); setIsPlaying(false) }
                            else { audioRef.current.play().then(() => setIsPlaying(true)).catch(() => addToast('No audio yet', 'info')) }
                          }
                        }}
                        className="w-14 h-14 md:w-16 md:h-16 bg-funky-orange flex items-center justify-center rounded-full border-4 border-on-surface shadow-neo-sm text-white shrink-0">
                        {isPlaying ? <Pause size={28} /> : <Play size={28} />}
                      </motion.button>
                      <div className="flex-1 h-10 md:h-12 bg-surface-dim rounded-full border-2 border-on-surface overflow-hidden flex items-center px-3 md:px-4 gap-0.5 md:gap-1">
                        {Array.from({ length: 20 }).map((_, i) => (
                          <motion.div key={i}
                            animate={{ scaleY: isPlaying ? [1, Math.random() * 3 + 1, 1] : 1 }}
                            transition={{ duration: 0.4, repeat: Infinity, delay: i * 0.04 }}
                            className={cn("flex-1 h-1.5 md:h-2 rounded-full origin-center",
                              isPlaying ? "bg-funky-pink" : "bg-on-surface/30")} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Event Log */}
              {events.length > 0 && (
                <div className="bg-surface-container border-4 border-on-surface rounded-2xl md:rounded-3xl shadow-neo-sm overflow-hidden">
                  <div className="px-6 py-4 border-b-4 border-on-surface bg-funky-cyan/20 flex items-center justify-between">
                    <span className="font-black uppercase tracking-widest text-sm flex items-center gap-2"><Radio size={16} /> Log</span>
                    <span className="font-bold text-sm bg-funky-lime px-3 py-1 rounded-full border-2 border-on-surface">{events.length}</span>
                  </div>
                  {events.slice(0, 5).map(ev => (
                    <div key={ev.id} className="px-6 py-3 flex items-center justify-between border-b border-on-surface/10 last:border-b-0">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-2.5 h-2.5 rounded-full",
                          ev.type === 'error' ? 'bg-red-500' : ev.type === 'success' ? 'bg-funky-lime' : 'bg-funky-cyan')} />
                        <span className="font-bold text-sm">{ev.message}</span>
                      </div>
                      <span className="text-xs font-mono text-on-surface-variant">{ev.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ═══════════ RECEIVER ═══════════ */}
          {page === 'receiver' && (
            <motion.div key="receiver"
              initial={{ opacity: 0, x: -100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 100 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="max-w-5xl mx-auto flex flex-col gap-8 md:gap-12">

              <div className="text-center">
                <h2 className="text-4xl md:text-6xl font-black mb-4"><span className="text-funky-purple">LISTEN</span> MODE</h2>

                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={status === 'listening' ? stopListening : startListening}
                  disabled={status === 'sending'}
                  className={cn(
                    "text-xl md:text-3xl font-black border-8 border-on-surface rounded-full inline-flex items-center gap-4 md:gap-6 px-8 md:px-12 py-4 md:py-6 shadow-neo mt-6 md:mt-8 uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed",
                    status === 'listening' ? "bg-funky-pink text-white" : "bg-funky-lime text-on-surface")}>
                  {status === 'listening' ? 'STOP & DECODE' : 'START RECORDING'}
                  <div className="bg-white text-on-surface p-2 md:p-3 rounded-full border-4 border-on-surface">
                    {status === 'listening' ? <Square size={28} /> : <Mic size={28} />}
                  </div>
                </motion.button>

                {rxProgress && (
                  <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="mt-6 font-bold text-lg bg-funky-cyan border-4 border-on-surface px-6 py-3 rounded-2xl inline-block shadow-neo-sm">
                    🎙️ {rxProgress}
                  </motion.p>
                )}
              </div>

              {/* Equalizer Visualizer */}
              <div className="bg-surface-container border-8 border-on-surface rounded-[2rem] md:rounded-[3rem] p-8 md:p-12 shadow-neo min-h-[300px] md:min-h-[400px] flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-funky-cyan/5" />
                <div className="flex items-end justify-center gap-1 md:gap-2 h-48 md:h-64 mb-8 md:mb-12 z-10 w-full px-4 md:px-8">
                  {Array.from({ length: 40 }).map((_, i) => (
                    <motion.div key={i}
                      animate={{ height: status === 'listening' ? [20, Math.random() * 180 + 30, 20] : 12 }}
                      transition={{
                        duration: 0.4 + Math.random() * 0.3,
                        repeat: status === 'listening' ? Infinity : 0,
                        repeatType: "reverse", delay: i * 0.015
                      }}
                      className={cn("w-full rounded-t-lg border-2 border-on-surface border-b-0 transition-colors",
                        status === 'listening'
                          ? ["bg-funky-pink", "bg-funky-lime", "bg-funky-cyan", "bg-funky-purple", "bg-funky-orange"][i % 5]
                          : "bg-surface-dim")} />
                  ))}
                </div>

                <div className="w-full flex flex-col md:flex-row justify-between items-center z-10 bg-white border-4 border-on-surface rounded-2xl p-4 md:p-6 shadow-neo-sm gap-4">
                  <div className="flex items-center gap-4">
                    <div className={cn("w-4 h-4 rounded-full border-2 border-on-surface",
                      status === 'listening' ? 'bg-red-500 animate-pulse' : 'bg-surface-dim')} />
                    <span className="text-lg md:text-xl font-bold uppercase tracking-widest">
                      {status === 'listening' ? 'RECORDING...' : status === 'sending' ? 'DECODING...' : 'Standby'}
                    </span>
                  </div>
                  <span className="font-black text-xl md:text-2xl bg-funky-lime px-4 py-2 rounded-xl border-2 border-on-surface">
                    {events.length} EVENTS
                  </span>
                </div>
              </div>

              {/* Decoded Output */}
              <AnimatePresence>
                {receivedContent !== null && (
                  <motion.div initial={{ opacity: 0, y: 30, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-funky-orange border-8 border-on-surface rounded-[2rem] md:rounded-[3rem] shadow-neo overflow-hidden">
                    <div className="px-6 md:px-8 py-4 border-b-4 border-on-surface flex items-center justify-between bg-white/20">
                      <div className="flex items-center gap-3">
                        <Volume2 size={24} />
                        <span className="font-black text-lg md:text-xl uppercase tracking-wider">Decoded Output</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-sm bg-white/40 px-3 py-1 rounded-full border-2 border-on-surface">{receivedFilename}</span>
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                          onClick={() => {
                            const blob = new Blob([receivedContent], { type: 'text/plain' })
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url; a.download = receivedFilename; a.click()
                            URL.revokeObjectURL(url)
                            addToast('Downloaded!', 'success')
                          }}
                          className="w-10 h-10 md:w-12 md:h-12 bg-white border-4 border-on-surface rounded-full flex items-center justify-center shadow-neo-sm">
                          <Download size={20} />
                        </motion.button>
                      </div>
                    </div>
                    <div className="h-64 md:h-80 overflow-y-auto p-6 md:p-8">
                      <pre className="whitespace-pre-wrap break-all font-mono text-sm md:text-base font-bold text-on-surface leading-relaxed">
                        {receivedContent}
                      </pre>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Event Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <AnimatePresence>
                  {events.slice(0, 6).map((ev, i) => (
                    <motion.div key={ev.id}
                      initial={{ opacity: 0, y: 20, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      className={cn("border-4 border-on-surface rounded-2xl md:rounded-3xl p-5 md:p-6 shadow-neo-sm flex flex-col gap-2",
                        ev.type === 'file' ? "bg-funky-orange" :
                        ev.type === 'success' ? "bg-funky-lime" :
                        ev.type === 'error' ? "bg-red-300" :
                        i === 0 ? "bg-funky-cyan" : "bg-white")}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-black text-xs uppercase tracking-widest bg-on-surface text-white px-3 py-1 rounded-full">
                          {ev.type === 'file' ? '📁 FILE' : ev.type === 'success' ? '✅ OK' : ev.type === 'error' ? '❌ ERR' : '📡 LOG'}
                        </span>
                        <span className="font-bold text-xs text-on-surface-variant bg-surface-dim px-3 py-1 rounded-full border-2 border-on-surface font-mono">{ev.time}</span>
                      </div>
                      <p className="text-base md:text-lg font-bold break-all">{ev.message}</p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      <input ref={fileInputRef} type="file" className="hidden" onChange={onUpload} />
      <audio ref={audioRef} className="hidden"
        onEnded={() => setIsPlaying(false)}
        onError={() => setIsPlaying(false)} />
    </div>
  )
}
