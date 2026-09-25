import { useEffect, useRef, useState } from 'react'
import { Film, Download, Trash2, X } from 'lucide-react'
import { ToolbarControl } from '@purescience/platform-ui/components/common/containers/AppChrome'
import { Modal } from '@purescience/platform-ui/components/common/overlays/Modal'
import { Button } from '@purescience/platform-ui/components/common/buttons/Button'
import { useSceneState } from '../hooks/useSceneState'
import type { SceneStore } from '../lib/SceneStore'
import { exportCameraVideo } from '../lib/cameraVideo'
import { download } from '../bridge/platformBridge'

type VideoEntry = { id: string; url: string; blob?: Blob; name: string; createdAt: string; height: number; fps: number }

export function VideoExport({ store }: { store: SceneStore }) {
  const state = useSceneState(store, ['scene'])
  const [open, setOpen] = useState(false), [height, setHeight] = useState<720 | 1080>(720)
  const [fps, setFps] = useState(30), [progress, setProgress] = useState<number | null>(null)
  const [message, setMessage] = useState(''), [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)
  const [exports, setExports] = useState<VideoEntry[]>([])
  const [selectedId, setSelectedId] = useState('')
  const urls = useRef(new Set<string>())
  const mounted = useRef(true)
  const selected = exports.find(entry => entry.id === selectedId)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      abort.current?.abort()
      // Fast Refresh and Strict Mode immediately re-run setup with retained history.
      queueMicrotask(() => {
        if (mounted.current) return
        urls.current.forEach(url => URL.revokeObjectURL(url))
        urls.current.clear()
      })
    }
  }, [])
  const remove = (entry: VideoEntry) => {
    URL.revokeObjectURL(entry.url); urls.current.delete(entry.url)
    const remaining = exports.filter(item => item.id !== entry.id)
    setExports(remaining)
    if (selectedId === entry.id) setSelectedId(remaining[0]?.id ?? '')
  }
  const start = async () => {
    if (abort.current) return
    const controller = new AbortController(); abort.current = controller
    setProgress(0); setError(''); setMessage('')
    try {
      const snapshot = structuredClone(store.getDocument())
      const blob = await exportCameraVideo(snapshot, controller.signal, setProgress, { height, fps })
      if (!mounted.current || controller.signal.aborted) return
      const createdAt = new Date().toISOString()
      const name = `${snapshot.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')}-${createdAt.replace(/[:.]/g, '-')}.webm`
      const entry = { id: crypto.randomUUID(), url: URL.createObjectURL(blob), blob, name, createdAt, height, fps }
      urls.current.add(entry.url)
      setExports(previous => [entry, ...previous]); setSelectedId(entry.id)
      download(blob, name, blob.type); setMessage('Video exported.')
    } catch (cause) {
      if (controller.signal.aborted) setMessage('Export cancelled.')
      else setError(cause instanceof Error ? cause.message : String(cause))
    } finally { abort.current = null; setProgress(null) }
  }
  const available = !!state.scene.cameraKeys?.length && state.scene.settings.duration <= 120
  return <>
    <ToolbarControl className="video-export-trigger" title="Export video" aria-label="Export video" onClick={() => setOpen(true)}>
      <Film size={18} /><Download size={14} />{progress !== null && <span>{Math.round(progress * 100)}%</span>}
    </ToolbarControl>
    <Modal open={open} onClose={() => setOpen(false)} title="Video export & review" size="fullscreen">
      <div className="video-export-settings" onKeyDown={e => e.stopPropagation()}>
        <div className="video-export-tabs" role="group" aria-label="Export views" key={exports.length}>
          <label><input type="radio" name="video-export-view" value="settings" defaultChecked={!exports.length} />Export</label>
          <label><input type="radio" name="video-export-view" value="history" defaultChecked={!!exports.length} />History ({exports.length})</label>
          <div className="video-export-action">
            {progress !== null
              ? <Button onClick={() => abort.current?.abort()}><X size={16} />Cancel export</Button>
              : <Button variant="primary" disabled={!available} onClick={() => void start()}><Film size={16} /><Download size={16} />Export video</Button>}
          </div>
        </div>
        <div className="video-export-options">
        <dl><dt>Format</dt><dd>WebM · Silent · 16:9</dd><dt>Duration</dt><dd>{state.scene.settings.duration} seconds</dd></dl>
        <label>Resolution<select disabled={progress !== null} value={height} onChange={e => setHeight(Number(e.target.value) as 720 | 1080)}><option value={720}>HD · 1280 × 720</option><option value={1080}>Full HD · 1920 × 1080</option></select></label>
        <label>Frame rate<select disabled={progress !== null} value={fps} onChange={e => setFps(Number(e.target.value))}>{[24, 30, 60].map(n => <option key={n} value={n}>{n} fps</option>)}</select></label>
        {!state.scene.cameraKeys?.length && <p role="status">Add a camera keyframe before exporting.</p>}
        {state.scene.settings.duration > 120 && <p role="alert">Video export supports journeys up to 120 seconds.</p>}
        <p className="muted">Recording runs in real time. Keep Pure3D visible until it finishes.</p>
        </div>
        {progress !== null && <div role="status"><progress value={progress} max={1} /> Recording {Math.round(progress * 100)}%</div>}
        {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
        <div className="video-export-results">
        {!exports.length && <p role="status">No exports in this session yet.</p>}
        {selected && <section className="video-export-preview" aria-label="Export playback">
          <video key={selected.url} src={selected.url} controls playsInline preload="metadata" aria-label={selected.name} onError={() => setError('This video could not be loaded. Select it again to retry, or create a new export.')} />
          <a href={selected.url} download={selected.name} title={selected.name}><Download size={16} />Download video</a>
        </section>}
        {exports.length > 0 && <section aria-label="Session exports">
          <h3>Session exports</h3>
          <ul className="video-export-history">{exports.map(entry => <li key={entry.id}>
            <button type="button" aria-pressed={entry.id === selectedId} onClick={() => {
              setError('')
              if (entry.blob) {
                const url = URL.createObjectURL(entry.blob)
                urls.current.add(url)
                setExports(previous => previous.map(item => item.id === entry.id ? { ...item, url } : item))
                URL.revokeObjectURL(entry.url); urls.current.delete(entry.url)
              } else {
                setError('This older session video is no longer available. Please create a new export.')
              }
              setSelectedId(entry.id)
            }}>
              <span title={entry.name}>{entry.name.replace(/-\d{4}-\d{2}-\d{2}T.*\.webm$/, '')}</span><small>{new Date(entry.createdAt).toLocaleString()} · {entry.height}p · {entry.fps} fps</small>
            </button>
            <ToolbarControl aria-label={`Remove ${entry.name} from history`} title="Remove from history" onClick={() => remove(entry)}><Trash2 size={15} /></ToolbarControl>
          </li>)}</ul>
        </section>}
        </div>
      </div>
    </Modal>
  </>
}
