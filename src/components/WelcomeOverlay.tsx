import { useState, useEffect } from 'react'
import {
  MousePointer2, MoveRight, Type, Highlighter, Grid3x3,
  Square, Circle, Minus, Pencil, PaintBucket, Hash,
  Image, ClipboardPaste, Download, Undo2, ZoomIn, Move,
  X, Keyboard, Layers, ShieldCheck, Lock, Wifi, WifiOff, Code,
  TextCursorInput, Ruler, Link, Copy, Stamp, Pipette, Search,
} from 'lucide-react'
import { useProjectStore } from '../stores/projectStore'
import { examples } from '../lib/examples'

const STORAGE_KEY = 'stift-onboarding-seen'

export function WelcomeOverlay() {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)
  const loadProject = useProjectStore((s) => s.loadProject)
  const pushHistory = useProjectStore((s) => s.pushHistory)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true)
    }
  }, [])

  if (!visible) return null

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  const loadExample = async (id: string) => {
    const ex = examples.find((e) => e.id === id)
    if (!ex) return
    const project = await ex.load()
    loadProject(project)
    pushHistory()
    dismiss()
  }

  const allSteps = [...steps, {
    title: 'Try an Example',
    content: <ExamplesStepContent onLoadExample={loadExample} onSkip={dismiss} />,
  }]

  const next = () => {
    if (step < allSteps.length - 1) setStep(step + 1)
    else dismiss()
  }

  const prev = () => {
    if (step > 0) setStep(step - 1)
  }

  const current = allSteps[step]
  const isLastStep = step === allSteps.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-raised border border-border rounded-xl shadow-2xl w-[560px] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <img src="/stift.svg" alt="" className="w-8 h-8" />
            <div>
              <h1 className="text-lg font-semibold text-gray-100">Welcome to Stift</h1>
              <p className="text-xs text-gray-500">Image Annotation &amp; Compositing</p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            title="Skip onboarding"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1.5 px-6 pb-3">
          {allSteps.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full flex-1 transition-colors cursor-pointer ${
                i === step ? 'bg-accent' : i < step ? 'bg-accent/40' : 'bg-border'
              }`}
              onClick={() => setStep(i)}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-6 pb-4 flex-1 overflow-y-auto">
          <h2 className="text-base font-medium text-gray-200 mb-3">{current.title}</h2>
          <div className="text-sm text-gray-400 leading-relaxed">{current.content}</div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <span className="text-xs text-gray-600">{step + 1} / {allSteps.length}</span>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={prev}
                className="px-4 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Back
              </button>
            )}
            {!isLastStep && (
              <button
                onClick={next}
                className="px-5 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded-md font-medium transition-colors"
              >
                Next
              </button>
            )}
            {isLastStep && (
              <button
                onClick={dismiss}
                className="px-5 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Skip and start empty
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const ShortcutBadge = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-block px-1.5 py-0.5 rounded bg-surface-overlay border border-border text-[11px] font-mono text-gray-300">
    {children}
  </kbd>
)

const ToolRow = ({ icon: Icon, shortcut, label }: { icon: React.ElementType; shortcut: string; label: string }) => (
  <div className="flex items-center gap-2 py-1">
    <Icon size={14} className="text-accent shrink-0" />
    <ShortcutBadge>{shortcut}</ShortcutBadge>
    <span className="text-gray-300 text-[13px]">{label}</span>
  </div>
)

function ExamplesStepContent({ onLoadExample, onSkip }: { onLoadExample: (id: string) => void; onSkip: () => void }) {
  return (
    <div className="space-y-3">
      <p>Load an example to see what Stift can do:</p>
      <div className="space-y-2">
        {examples.map((ex) => (
          <button
            key={ex.id}
            onClick={() => onLoadExample(ex.id)}
            className="w-full text-left bg-surface/50 hover:bg-surface-overlay border border-border hover:border-accent/50 rounded-lg p-3 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div>
                <strong className="text-gray-200 group-hover:text-white text-[13px]">{ex.name}</strong>
                <p className="text-gray-500 text-xs mt-0.5">{ex.description}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                ex.complexity === 'Simple' ? 'bg-emerald-900/50 text-emerald-400' :
                ex.complexity === 'Intermediate' ? 'bg-amber-900/50 text-amber-400' :
                'bg-purple-900/50 text-purple-400'
              }`}>
                {ex.complexity}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function PrivacyStepContent() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 bg-emerald-950/40 border border-emerald-800/50 rounded-lg p-4">
        <ShieldCheck size={28} className="text-emerald-400 shrink-0" />
        <div>
          <p className="text-emerald-300 font-medium text-[15px]">Your images never leave your browser.</p>
          <p className="text-emerald-400/70 text-xs mt-1">Stift is free, open source, and designed for confidential technical work.</p>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-start gap-3 bg-surface/50 rounded-lg p-3">
          <WifiOff size={16} className="text-gray-400 mt-0.5 shrink-0" />
          <div>
            <strong className="text-gray-200">100% client-side processing</strong>
            <p className="text-gray-500 text-xs mt-1">All image editing, annotation, compositing, and export happens entirely in your browser. No image data is ever sent to any server or external service.</p>
          </div>
        </div>
        <div className="flex items-start gap-3 bg-surface/50 rounded-lg p-3">
          <Lock size={16} className="text-gray-400 mt-0.5 shrink-0" />
          <div>
            <strong className="text-gray-200">No telemetry, no tracking, no analytics</strong>
            <p className="text-gray-500 text-xs mt-1">Stift makes zero external network requests. Your work is yours alone.</p>
          </div>
        </div>
        <div className="flex items-start gap-3 bg-surface/50 rounded-lg p-3">
          <Code size={16} className="text-gray-400 mt-0.5 shrink-0" />
          <div>
            <strong className="text-gray-200">100% free and open source</strong>
            <p className="text-gray-500 text-xs mt-1">All annotation, compositing, and export features are free. Inspect, modify, and self-host the code yourself. No feature is locked behind a paywall.</p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-lg p-3 bg-surface/50">
          <Wifi size={16} className="mt-0.5 shrink-0 text-gray-400" />
          <div>
            <strong className="text-gray-200">Optional server save</strong>
            <p className="text-gray-500 text-xs mt-1">If you choose to save a project to the server, data is stored on the host machine's disk only. You will be warned before any data leaves the browser. You can always export locally instead.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

const steps = [
  {
    title: 'Privacy First',
    content: <PrivacyStepContent />,
  },
  {
    title: 'Quick Overview',
    content: (
      <div className="space-y-3">
        <p>
          Stift is a tool for two workflows:
        </p>
        <div className="bg-surface/50 rounded-lg p-3 space-y-2">
          <div className="flex gap-2">
            <span className="text-accent font-medium">1.</span>
            <span><strong className="text-gray-200">Annotate screenshots</strong> -- add arrows, text, highlights, blur regions, numbered steps, and shapes to any image.</span>
          </div>
          <div className="flex gap-2">
            <span className="text-accent font-medium">2.</span>
            <span><strong className="text-gray-200">Compose technical figures</strong> -- combine an overview image with detail/magnification images, connected by labeled callouts.</span>
          </div>
        </div>
        <p>
          Output is a static image (PNG, JPG, PDF) or a LaTeX-ready figure for technical reports.
        </p>
      </div>
    ),
  },
  {
    title: 'Getting Images In',
    content: (
      <div className="space-y-3">
        <p>Three ways to add images:</p>
        <div className="space-y-2">
          <div className="flex items-start gap-3 bg-surface/50 rounded-lg p-3">
            <ClipboardPaste size={18} className="text-accent mt-0.5 shrink-0" />
            <div>
              <strong className="text-gray-200">Paste from clipboard</strong>
              <span className="text-gray-500 ml-2"><ShortcutBadge>Ctrl+V</ShortcutBadge></span>
              <p className="text-gray-500 text-xs mt-1">Take a screenshot, then paste it directly into Stift.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-surface/50 rounded-lg p-3">
            <Image size={18} className="text-accent mt-0.5 shrink-0" />
            <div>
              <strong className="text-gray-200">Drag &amp; drop</strong>
              <p className="text-gray-500 text-xs mt-1">Drag image files from your file manager onto the canvas.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-surface/50 rounded-lg p-3">
            <Download size={18} className="text-accent mt-0.5 shrink-0" />
            <div>
              <strong className="text-gray-200">File picker</strong>
              <p className="text-gray-500 text-xs mt-1">Click the image icon in the top bar to browse for files. You can also drop <code className="text-accent text-xs">.stift</code> project files to open them.</p>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: 'Annotation Tools',
    content: (
      <div className="space-y-2">
        <p className="mb-2">Every tool has a single-key shortcut. Press it to activate:</p>
        <div className="grid grid-cols-2 gap-x-4">
          <ToolRow icon={MousePointer2} shortcut="V" label="Select / Move" />
          <ToolRow icon={MoveRight} shortcut="A" label="Arrow" />
          <ToolRow icon={Type} shortcut="T" label="Text" />
          <ToolRow icon={TextCursorInput} shortcut="G" label="Text Box" />
          <ToolRow icon={Highlighter} shortcut="H" label="Highlight" />
          <ToolRow icon={Grid3x3} shortcut="B" label="Blur / Pixelate" />
          <ToolRow icon={Square} shortcut="R" label="Rectangle" />
          <ToolRow icon={Circle} shortcut="E" label="Ellipse" />
          <ToolRow icon={Minus} shortcut="L" label="Line" />
          <ToolRow icon={Pencil} shortcut="D" label="Freehand Draw" />
          <ToolRow icon={PaintBucket} shortcut="X" label="Color Box (redact)" />
          <ToolRow icon={Hash} shortcut="N" label="Counter" />
          <ToolRow icon={Ruler} shortcut="M" label="Dimension / Measure" />
          <ToolRow icon={Stamp} shortcut="W" label="Stamp / Watermark" />
          <ToolRow icon={Link} shortcut="K" label="Connector" />
          <ToolRow icon={Pipette} shortcut="I" label="Eyedropper" />
          <ToolRow icon={Search} shortcut="Z" label="Magnifier (zoom inset)" />
        </div>
        <p className="text-xs text-gray-600 pt-2">Hold <ShortcutBadge>Shift</ShortcutBadge> while drawing for angle snap / square / proportional resize. Scroll the mouse wheel while drawing to adjust stroke width. <ShortcutBadge>Ctrl+G</ShortcutBadge> groups selected annotations.</p>
      </div>
    ),
  },
  {
    title: 'Essential Shortcuts',
    content: (
      <div className="space-y-2">
        <div className="grid grid-cols-1 gap-1.5">
          <div className="flex items-center gap-3 bg-surface/50 rounded-lg px-3 py-2">
            <Undo2 size={14} className="text-accent shrink-0" />
            <div className="flex flex-wrap gap-2">
              <ShortcutBadge>Ctrl+Z</ShortcutBadge> <span className="text-gray-400">Undo</span>
              <span className="mx-1 text-gray-600">|</span>
              <ShortcutBadge>Ctrl+Y</ShortcutBadge> <span className="text-gray-400">Redo</span>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-surface/50 rounded-lg px-3 py-2">
            <Copy size={14} className="text-accent shrink-0" />
            <div className="flex flex-wrap gap-2">
              <ShortcutBadge>Ctrl+C</ShortcutBadge> <span className="text-gray-400">Copy</span>
              <span className="mx-1 text-gray-600">|</span>
              <ShortcutBadge>Ctrl+V</ShortcutBadge> <span className="text-gray-400">Paste</span>
              <span className="mx-1 text-gray-600">|</span>
              <ShortcutBadge>Ctrl+D</ShortcutBadge> <span className="text-gray-400">Duplicate</span>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-surface/50 rounded-lg px-3 py-2">
            <ZoomIn size={14} className="text-accent shrink-0" />
            <div className="flex flex-wrap gap-2">
              <ShortcutBadge>Scroll</ShortcutBadge> <span className="text-gray-400">Zoom</span>
              <span className="mx-1 text-gray-600">|</span>
              <ShortcutBadge>Space+drag</ShortcutBadge> <span className="text-gray-400">Pan canvas</span>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-surface/50 rounded-lg px-3 py-2">
            <Move size={14} className="text-accent shrink-0" />
            <div className="flex flex-wrap gap-2">
              <ShortcutBadge>Arrow keys</ShortcutBadge> <span className="text-gray-400">Nudge (1px)</span>
              <span className="mx-1 text-gray-600">|</span>
              <ShortcutBadge>Shift+Arrow</ShortcutBadge> <span className="text-gray-400">Nudge (10px)</span>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-surface/50 rounded-lg px-3 py-2">
            <Layers size={14} className="text-accent shrink-0" />
            <div className="flex flex-wrap gap-2">
              <ShortcutBadge>Delete</ShortcutBadge> <span className="text-gray-400">Remove</span>
              <span className="mx-1 text-gray-600">|</span>
              <ShortcutBadge>Ctrl+A</ShortcutBadge> <span className="text-gray-400">Select all</span>
              <span className="mx-1 text-gray-600">|</span>
              <ShortcutBadge>Esc</ShortcutBadge> <span className="text-gray-400">Deselect</span>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-surface/50 rounded-lg px-3 py-2">
            <Keyboard size={14} className="text-accent shrink-0" />
            <div className="flex flex-wrap gap-2">
              <ShortcutBadge>Ctrl+S</ShortcutBadge> <span className="text-gray-400">Save locally</span>
              <span className="mx-1 text-gray-600">|</span>
              <ShortcutBadge>Shift+click</ShortcutBadge> <span className="text-gray-400">Multi-select</span>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: 'Saving & Exporting',
    content: (
      <div className="space-y-3">
        <div className="bg-surface/50 rounded-lg p-3 space-y-2">
          <p><strong className="text-gray-200">Export for reports</strong> -- open <strong className="text-accent">File</strong> menu:</p>
          <ul className="space-y-1 ml-4 text-[13px]">
            <li><strong className="text-gray-300">PNG</strong> -- 2x or 1x resolution, with transparent background option</li>
            <li><strong className="text-gray-300">JPG</strong> -- 2x (high quality) or 1x (medium quality)</li>
            <li><strong className="text-gray-300">PDF</strong> -- single-page document, generated in-browser</li>
            <li><strong className="text-gray-300">LaTeX</strong> -- <code className="text-accent text-xs">.png</code> + <code className="text-accent text-xs">.tex</code> with tikz overlays using your document's native font</li>
          </ul>
          <p className="text-emerald-400/80 text-xs mt-2 flex items-center gap-1.5">
            <ShieldCheck size={12} />
            All exports are generated entirely in your browser. Nothing is uploaded.
          </p>
        </div>
        <div className="bg-amber-950/30 border border-amber-800/40 rounded-lg p-3 space-y-1">
          <p className="text-amber-300/90 text-sm font-medium">Server save (optional)</p>
          <p className="text-amber-400/60 text-xs">If you use Save to store projects for later editing, your project data (including images) will be sent to and stored on the server's disk. Use this only if you trust the server operator. You can always use Export instead to keep everything local.</p>
        </div>
        <p className="text-xs text-gray-600">
          LaTeX: use <code className="text-accent">\input&#123;figure.tex&#125;</code>. Requires <code className="text-accent">\usepackage&#123;tikz&#125;</code> and <code className="text-accent">\usepackage&#123;graphicx&#125;</code>.
        </p>
      </div>
    ),
  },
]

export function ResetOnboarding() {
  return (
    <button
      onClick={() => {
        localStorage.removeItem(STORAGE_KEY)
        window.location.reload()
      }}
      className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
      title="Show onboarding again"
    >
      ?
    </button>
  )
}
