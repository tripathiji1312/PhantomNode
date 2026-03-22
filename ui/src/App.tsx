import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUpRight, ArrowDownLeft, Play, Pause, Sparkles, UploadCloud, UserCircle2, Mic, Activity } from 'lucide-react'
import { cn } from './lib/utils'

type LinkStatus = 'idle' | 'sending' | 'listening' | 'error'
type Page = 'home' | 'sender' | 'receiver'

type EventEntry = {
  id: string
  message: string
  time: string
}

const seedEvents: EventEntry[] = [
  { id: 's-1', message: 'Packet_Alpha_99', time: '12:04:11 UTC' },
  { id: 's-2', message: 'Vault_Handshake_Secure', time: '12:03:55 UTC' },
  { id: 's-3', message: 'System_Sync_01', time: '12:03:12 UTC' },
]

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [status, setStatus] = useState<LinkStatus>('idle')
  const [events, setEvents] = useState<EventEntry[]>(seedEvents)
  const [connected, setConnected] = useState(false)
  const [textMessage, setTextMessage] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const pushEvent = (message: string) => {
    const now = new Date()
    const time = `${now.toLocaleTimeString('en-GB', { hour12: false })} UTC`
    setEvents((prev) => [{ id: crypto.randomUUID(), message, time }, ...prev].slice(0, 20))
  }

  useEffect(() => {
    const ws = new WebSocket('ws://127.0.0.1:8000/ws')

    ws.onopen = () => {
      setConnected(true)
      pushEvent('Link_Online')
    }

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload?.type === 'status') {
          pushEvent(payload.message ?? 'Status_Update')
        } else if (payload?.type === 'file_received') {
          const filename = payload.filename || 'decoded_payload.txt'
          pushEvent(`Received_${filename}`)
          const blob = new Blob([payload.content ?? ''], { type: 'text/plain' })
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = filename
          anchor.click()
          URL.revokeObjectURL(url)
        } else {
          pushEvent(String(event.data))
        }
      } catch {
        pushEvent(String(event.data))
      }
      setStatus('idle')
    }

    ws.onclose = () => {
      setConnected(false)
      pushEvent('Link_Offline')
    }

    ws.onerror = () => {
      setConnected(false)
      setStatus('error')
      pushEvent('WebSocket_Error')
    }

    return () => ws.close()
  }, [])

  const sendFile = async (file: File) => {
    setStatus('sending')
    pushEvent(`Preparing_${file.name}`)

    const form = new FormData()
    form.append('file', file)

    const res = await fetch('http://127.0.0.1:8000/tx', {
      method: 'POST',
      body: form,
    }).catch(() => null)

    if (!res || !res.ok) {
      setStatus('error')
      pushEvent('Transmit_Failed')
      return
    }

    pushEvent(`Broadcasting_${file.name}`)
    setStatus('idle')
  }

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await sendFile(file)
    e.target.value = ''
  }

  const processText = async () => {
    if (!textMessage.trim()) return
    const file = new File([textMessage], 'message.txt', { type: 'text/plain' })
    await sendFile(file)
  }

  const startListening = async () => {
    setStatus('listening')
    pushEvent('Capture_Armed')

    const res = await fetch('http://127.0.0.1:8000/rx/start', {
      method: 'POST',
    }).catch(() => null)

    if (!res || !res.ok) {
      setStatus('error')
      pushEvent('Capture_Start_Failed')
      return
    }

    pushEvent('Capture_Started')
  }

  const stopListening = async () => {
    setStatus('idle')
    pushEvent('Capture_Stopped')

    await fetch('http://127.0.0.1:8000/rx/stop', {
      method: 'POST',
    }).catch(() => null)
  }

  const statusLabel = useMemo(() => {
    if (status === 'error') return 'ERROR'
    if (status === 'sending') return 'BROADCASTING'
    if (status === 'listening') return 'LISTENING'
    return connected ? 'READY' : 'OFFLINE'
  }, [connected, status])

  return (
    <div className="min-h-screen">
      {/* Playful Floating Shapes */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden flex justify-center items-center opacity-30">
        <motion.div
          animate={{ rotate: 360, scale: [1, 1.1, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="w-[800px] h-[800px] bg-primary-container rounded-[40%] absolute top-[-20%] left-[-10%] blur-3xl opacity-50"
        />
        <motion.div
          animate={{ rotate: -360, scale: [1, 1.2, 1] }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
          className="w-[600px] h-[600px] bg-secondary-container rounded-[40%] absolute bottom-[-10%] right-[-10%] blur-3xl opacity-50"
        />
      </div>

      <header className="fixed top-0 left-0 w-full z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between bg-surface-container/80 backdrop-blur-xl border-4 border-on-surface rounded-full px-6 py-3 shadow-neo">
          <button 
            type="button" 
            onClick={() => setPage('home')}
            className="text-2xl font-black tracking-tighter text-on-surface hover:text-funky-pink transition-colors"
          >
            PHANTOM<span className="text-funky-pink">NODE</span>
          </button>
          
          <nav className="hidden md:flex items-center gap-4 bg-surface-dim rounded-full p-2 border-2 border-on-surface">
            {['home', 'receiver', 'sender'].map((tab) => (
              <motion.button
                key={tab}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setPage(tab as Page)}
                className={cn(
                  "px-6 py-2 rounded-full font-bold text-sm tracking-wide transition-colors relative uppercase",
                  page === tab ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                {page === tab && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 bg-funky-lime border-2 border-on-surface rounded-full -z-10"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                {tab === 'receiver' ? 'Nodes' : tab === 'sender' ? 'Wallet' : 'Home'}
              </motion.button>
            ))}
          </nav>

          <button type="button" className="p-2 bg-funky-purple text-white rounded-full border-2 border-on-surface shadow-neo-sm hover:-translate-y-1 transition-transform">
            <UserCircle2 size={32} />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto pt-40 pb-24 px-6 relative z-10">
        <AnimatePresence mode="wait">
          {page === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="flex flex-col items-center flex-1"
            >
              <section className="text-center mb-16 flex flex-col items-center">
                <motion.div
                  animate={{ 
                    scale: [1, 1.05, 1],
                    rotate: [0, 5, -5, 0]
                  }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-48 h-48 bg-funky-pink rounded-[3rem] border-8 border-on-surface shadow-neo flex items-center justify-center mb-8 relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.4)_0%,transparent_50%)]" />
                  <Sparkles size={80} className="text-white drop-shadow-lg" />
                </motion.div>
                
                <h1 className="text-7xl md:text-9xl font-black tracking-tighter text-on-surface mb-6 leading-none">
                  LIVING<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-funky-pink to-funky-purple">SYSTEM.</span>
                </h1>
                <p className="text-2xl font-bold text-on-surface-variant max-w-2xl bg-surface-container border-4 border-on-surface px-8 py-4 rounded-3xl shadow-neo-sm">
                  Experience the pulse of the decentralized harmonic network. The easiest way to transmit and receive physical node data.
                </p>
              </section>

              <section className="grid md:grid-cols-2 gap-8 w-full max-w-5xl mb-24">
                <motion.button
                  whileHover={{ scale: 1.02, y: -5 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setPage('sender')}
                  className="bg-funky-cyan rounded-[3rem] border-8 border-on-surface shadow-neo p-8 flex flex-col items-start text-left group overflow-hidden relative"
                >
                  <div className="w-24 h-24 bg-white border-4 border-on-surface rounded-full flex items-center justify-center mb-12 shadow-neo-sm group-hover:bg-funky-pink transition-colors">
                    <ArrowUpRight size={48} className="text-on-surface group-hover:text-white transition-colors" />
                  </div>
                  <h2 className="text-5xl font-black mb-4">SEND</h2>
                  <p className="text-xl font-bold opacity-90">Transmit your data instantly into the acoustic void.</p>
                  
                  <div className="absolute -bottom-10 -right-10 w-64 h-64 bg-white/20 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02, y: -5 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setPage('receiver')}
                  className="bg-funky-lime rounded-[3rem] border-8 border-on-surface shadow-neo p-8 flex flex-col items-start text-left group overflow-hidden relative"
                >
                  <div className="w-24 h-24 bg-white border-4 border-on-surface rounded-full flex items-center justify-center mb-12 shadow-neo-sm group-hover:bg-funky-purple transition-colors">
                    <ArrowDownLeft size={48} className="text-on-surface group-hover:text-white transition-colors" />
                  </div>
                  <h2 className="text-5xl font-black mb-4">RECEIVE</h2>
                  <p className="text-xl font-bold opacity-90">Listen and decode incoming node pulses seamlessly.</p>
                  
                  <div className="absolute -top-10 -right-10 w-64 h-64 bg-white/30 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
                </motion.button>
              </section>

              <section className="flex flex-wrap justify-center gap-6 max-w-4xl">
                {[
                  { label: "STATUS", value: statusLabel, color: "bg-funky-lime" },
                  { label: "NODES", value: "24K+", color: "bg-funky-pink" },
                  { label: "SYNC", value: "0.02s", color: "bg-funky-cyan" }
                ].map((stat, i) => (
                  <motion.div 
                    key={stat.label}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className={cn(stat.color, "px-8 py-4 rounded-full border-4 border-on-surface shadow-neo-sm flex items-center gap-4")}
                  >
                    <span className="text-sm font-black tracking-widest bg-white/50 px-3 py-1 rounded-full uppercase">{stat.label}</span>
                    <span className="text-3xl font-black">{stat.value}</span>
                  </motion.div>
                ))}
              </section>
            </motion.div>
          )}

          {page === 'sender' && (
            <motion.div
              key="sender"
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="max-w-4xl mx-auto flex flex-col gap-12"
            >
              <div className="text-center">
                <h2 className="text-6xl font-black mb-4"><span className="text-funky-pink">TRANSMIT</span> DATA</h2>
                <p className="text-2xl font-bold text-on-surface-variant bg-white border-4 border-on-surface rounded-full inline-block px-8 py-3 shadow-neo-sm">
                  Convert text or files to acoustic waves.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                <div className="bg-funky-cyan border-8 border-on-surface rounded-[2.5rem] p-6 shadow-neo flex flex-col relative overflow-hidden">
                  <div className="absolute top-4 right-4 bg-white rounded-full p-2 border-2 border-on-surface">
                    <Activity size={24} className="text-funky-pink" />
                  </div>
                  <h3 className="text-3xl font-black mb-6 uppercase">Whisper Text</h3>
                  <textarea
                    value={textMessage}
                    onChange={(e) => setTextMessage(e.target.value)}
                    placeholder="Enter payload..."
                    className="w-full flex-1 min-h-[200px] bg-white border-4 border-on-surface rounded-2xl p-6 text-xl font-bold resize-none mb-6 shadow-inset focus:outline-none focus:ring-4 focus:ring-funky-purple"
                  />
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={processText}
                    className="w-full bg-funky-pink text-white border-4 border-on-surface rounded-full py-4 text-2xl font-black shadow-neo hover:shadow-neo-hover transition-shadow uppercase tracking-wide"
                  >
                    Send Text
                  </motion.button>
                </div>

                <div className="flex flex-col gap-8">
                  <motion.button
                    whileHover={{ scale: 1.02, rotate: -1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-funky-purple text-white border-8 border-on-surface rounded-[2.5rem] p-12 shadow-neo flex flex-col items-center justify-center flex-1"
                  >
                    <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mb-6">
                      <UploadCloud size={48} className="text-white" />
                    </div>
                    <h3 className="text-4xl font-black mb-2 uppercase">Drop File</h3>
                    <p className="text-lg font-bold opacity-80 uppercase tracking-widest">Max 50MB Payload</p>
                  </motion.button>

                  <div className="bg-surface-container border-4 border-on-surface rounded-3xl p-6 shadow-neo-sm">
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-bold uppercase tracking-widest text-on-surface-variant text-sm">Status / Node_Alpha_7</span>
                      <span className="font-black bg-funky-lime px-3 py-1 rounded-full text-sm border-2 border-on-surface uppercase">
                        {status === 'sending' ? 'Broadcasting...' : 'Ready'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="w-16 h-16 bg-funky-orange flex items-center justify-center rounded-full border-4 border-on-surface shadow-neo-sm text-white shrink-0"
                      >
                        {isPlaying || status === 'sending' ? <Pause size={32} /> : <Play size={32} />}
                      </motion.button>
                      <div className="flex-1 h-12 bg-surface-dim rounded-full border-2 border-on-surface overflow-hidden flex items-center px-4 gap-1">
                        {Array.from({ length: 15 }).map((_, i) => (
                          <motion.div
                            key={i}
                            animate={{
                              scaleY: (isPlaying || status === 'sending') ? [1, Math.random() * 3 + 1, 1] : 1
                            }}
                            transition={{
                              duration: 0.5,
                              repeat: Infinity,
                              delay: i * 0.05
                            }}
                            className="flex-1 h-2 bg-on-surface rounded-full origin-center"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {page === 'receiver' && (
            <motion.div
              key="receiver"
              initial={{ opacity: 0, x: -100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="max-w-5xl mx-auto flex flex-col gap-12"
            >
              <div className="text-center">
                <h2 className="text-6xl font-black mb-4"><span className="text-funky-purple">LISTEN</span> MODE</h2>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={status === 'listening' ? stopListening : startListening}
                  className={cn(
                    "text-3xl font-black border-8 border-on-surface rounded-full inline-flex items-center gap-6 px-12 py-6 shadow-neo mt-8 uppercase tracking-widest",
                    status === 'listening' ? "bg-funky-pink text-white" : "bg-funky-lime text-on-surface"
                  )}
                >
                  {status === 'listening' ? 'STOP RECORDING' : 'START RECORDING'}
                  <div className="bg-white text-on-surface p-3 rounded-full border-4 border-on-surface">
                    {status === 'listening' ? <Pause size={32} /> : <Mic size={32} />}
                  </div>
                </motion.button>
              </div>

              <div className="bg-surface-container border-8 border-on-surface rounded-[3rem] p-12 shadow-neo min-h-[400px] flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-funky-cyan/5 border-b-8 border-on-surface" />
                
                <div className="flex items-end justify-center gap-3 h-64 mb-12 z-10 w-full px-8">
                  {Array.from({ length: 32 }).map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{
                        height: status === 'listening' ? Math.random() * 200 + 20 : 20
                      }}
                      transition={{
                        duration: 0.3,
                        repeat: status === 'listening' ? Infinity : 0,
                        repeatType: "reverse",
                        delay: i * 0.02
                      }}
                      className={cn(
                        "w-full rounded-t-full border-x-4 border-t-4 border-on-surface border-b-0",
                        ["bg-funky-pink", "bg-funky-lime", "bg-funky-cyan", "bg-funky-purple"][i % 4]
                      )}
                    />
                  ))}
                </div>

                <div className="w-full flex justify-between items-center z-10 bg-white border-4 border-on-surface rounded-2xl p-6 shadow-neo-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-4 h-4 rounded-full bg-funky-pink animate-pulse border-2 border-on-surface" />
                    <span className="text-xl font-bold uppercase tracking-widest">Live Log</span>
                  </div>
                  <span className="font-black text-2xl bg-funky-lime px-4 py-2 rounded-xl border-2 border-on-surface">
                    {events.length} LOGS
                  </span>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <AnimatePresence>
                  {events.slice(0, 4).map((ev, i) => (
                    <motion.div
                      key={ev.id}
                      initial={{ opacity: 0, y: 20, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className={cn(
                        "border-4 border-on-surface rounded-3xl p-6 shadow-neo-sm flex flex-col gap-2",
                        i === 0 ? "bg-funky-cyan" : "bg-white"
                      )}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-black text-xs uppercase tracking-widest bg-on-surface text-white px-3 py-1 rounded-full">
                          Packet ID {ev.id.slice(0,4)}
                        </span>
                        <span className="font-bold text-sm text-on-surface-variant bg-surface-dim px-3 py-1 rounded-full border-2 border-on-surface">
                          {ev.time}
                        </span>
                      </div>
                      <p className="text-xl font-bold break-all">{ev.message}</p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <input ref={fileInputRef} type="file" className="hidden" onChange={onUpload} />
    </div>
  )
}
