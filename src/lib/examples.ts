import { Project } from '../types'

// Helper: create an SVG data URL (URL-encoded to avoid btoa charset issues)
function svg(width: number, height: number, content: string): string {
  const raw = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${content}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(raw)}`
}

// Load a photo from public/ as a data URL
async function loadPhoto(path: string): Promise<string> {
  const resp = await fetch(path)
  const blob = await resp.blob()
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}

// Rasterize all SVG data URLs in a project to PNG so blur/toDataURL works (SVGs can taint canvas)
function rasterizeProject(project: Project): Promise<Project> {
  const svgImages = project.images.filter((img) => img.data.startsWith('data:image/svg'))
  if (svgImages.length === 0) return Promise.resolve(project)

  return Promise.all(
    svgImages.map(
      (img) =>
        new Promise<{ id: string; data: string }>((resolve) => {
          const el = new Image()
          el.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = img.naturalWidth
            canvas.height = img.naturalHeight
            const ctx = canvas.getContext('2d')!
            ctx.drawImage(el, 0, 0)
            resolve({ id: img.id, data: canvas.toDataURL('image/png') })
          }
          el.onerror = () => resolve({ id: img.id, data: img.data }) // fallback to SVG
          el.src = img.data
        }),
    ),
  ).then((rasterized) => {
    const map = new Map(rasterized.map((r) => [r.id, r.data]))
    return {
      ...project,
      images: project.images.map((img) => ({
        ...img,
        data: map.get(img.id) ?? img.data,
      })),
    }
  })
}

// ------------------------------------------------------------
// Example 1: Annotated Bug Report Screenshot
// A fake dashboard UI with annotations showing a bug
// ------------------------------------------------------------
function makeDashboardSVG(): string {
  return svg(1200, 800, `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1a1a2e"/>
        <stop offset="100%" stop-color="#16213e"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="800" fill="url(#bg)"/>
    <!-- Top nav -->
    <rect x="0" y="0" width="1200" height="52" fill="#0f3460" opacity="0.8"/>
    <circle cx="28" cy="26" r="12" fill="#e94560"/>
    <rect x="52" y="18" width="80" height="16" rx="3" fill="#ffffff" opacity="0.2"/>
    <rect x="148" y="18" width="60" height="16" rx="3" fill="#ffffff" opacity="0.15"/>
    <rect x="224" y="18" width="70" height="16" rx="3" fill="#ffffff" opacity="0.15"/>
    <rect x="900" y="14" width="120" height="24" rx="12" fill="#e94560" opacity="0.8"/>
    <text x="960" y="30" font-family="sans-serif" font-size="11" fill="white" text-anchor="middle">admin@corp.io</text>
    <circle cx="1060" cy="26" r="14" fill="#533483"/>
    <text x="1060" y="31" font-family="sans-serif" font-size="12" fill="white" text-anchor="middle">JD</text>
    <!-- Sidebar -->
    <rect x="0" y="52" width="220" height="748" fill="#0a1628"/>
    <rect x="16" y="72" width="188" height="36" rx="6" fill="#e94560" opacity="0.3"/>
    <text x="40" y="95" font-family="sans-serif" font-size="13" fill="#e94560">Dashboard</text>
    <text x="40" y="132" font-family="sans-serif" font-size="13" fill="#8899aa">Analytics</text>
    <text x="40" y="164" font-family="sans-serif" font-size="13" fill="#8899aa">Users</text>
    <text x="40" y="196" font-family="sans-serif" font-size="13" fill="#8899aa">Settings</text>
    <text x="40" y="228" font-family="sans-serif" font-size="13" fill="#8899aa">Reports</text>
    <!-- Main content area -->
    <text x="252" y="92" font-family="sans-serif" font-size="22" fill="white" font-weight="bold">Revenue Dashboard</text>
    <text x="252" y="114" font-family="sans-serif" font-size="13" fill="#8899aa">Last updated: March 2026</text>
    <!-- Stat cards -->
    <rect x="252" y="132" width="220" height="100" rx="10" fill="#162447"/>
    <text x="276" y="162" font-family="sans-serif" font-size="12" fill="#8899aa">Total Revenue</text>
    <text x="276" y="196" font-family="sans-serif" font-size="28" fill="#4ecca3" font-weight="bold">$2.4M</text>
    <text x="276" y="218" font-family="sans-serif" font-size="11" fill="#4ecca3">+12.5%</text>
    <rect x="492" y="132" width="220" height="100" rx="10" fill="#162447"/>
    <text x="516" y="162" font-family="sans-serif" font-size="12" fill="#8899aa">Active Users</text>
    <text x="516" y="196" font-family="sans-serif" font-size="28" fill="#4ecca3" font-weight="bold">84,291</text>
    <text x="516" y="218" font-family="sans-serif" font-size="11" fill="#4ecca3">+8.3%</text>
    <rect x="732" y="132" width="220" height="100" rx="10" fill="#162447"/>
    <text x="756" y="162" font-family="sans-serif" font-size="12" fill="#8899aa">Conversion Rate</text>
    <text x="756" y="196" font-family="sans-serif" font-size="28" fill="#e94560" font-weight="bold">-3.2%</text>
    <text x="756" y="218" font-family="sans-serif" font-size="11" fill="#e94560">Down from 4.1%</text>
    <rect x="972" y="132" width="200" height="100" rx="10" fill="#162447"/>
    <text x="996" y="162" font-family="sans-serif" font-size="12" fill="#8899aa">Avg. Order Value</text>
    <text x="996" y="196" font-family="sans-serif" font-size="28" fill="white" font-weight="bold">$127</text>
    <text x="996" y="218" font-family="sans-serif" font-size="11" fill="#8899aa">Stable</text>
    <!-- Chart area -->
    <rect x="252" y="256" width="700" height="320" rx="10" fill="#162447"/>
    <text x="276" y="288" font-family="sans-serif" font-size="14" fill="white" font-weight="bold">Monthly Revenue</text>
    <!-- Chart axes -->
    <line x1="300" y1="310" x2="300" y2="540" stroke="#2a3a5c" stroke-width="1"/>
    <line x1="300" y1="540" x2="920" y2="540" stroke="#2a3a5c" stroke-width="1"/>
    <!-- Chart bars -->
    <rect x="330" y="410" width="40" height="130" rx="3" fill="#4ecca3" opacity="0.8"/>
    <rect x="390" y="380" width="40" height="160" rx="3" fill="#4ecca3" opacity="0.8"/>
    <rect x="450" y="350" width="40" height="190" rx="3" fill="#4ecca3" opacity="0.8"/>
    <rect x="510" y="370" width="40" height="170" rx="3" fill="#4ecca3" opacity="0.8"/>
    <rect x="570" y="340" width="40" height="200" rx="3" fill="#4ecca3" opacity="0.8"/>
    <rect x="630" y="310" width="40" height="230" rx="3" fill="#4ecca3" opacity="0.8"/>
    <rect x="690" y="320" width="40" height="220" rx="3" fill="#4ecca3" opacity="0.8"/>
    <rect x="750" y="460" width="40" height="80" rx="3" fill="#e94560" opacity="0.8"/>
    <rect x="810" y="480" width="40" height="60" rx="3" fill="#e94560" opacity="0.8"/>
    <rect x="870" y="500" width="40" height="40" rx="3" fill="#e94560" opacity="0.8"/>
    <!-- Y-axis labels -->
    <text x="290" y="420" font-family="sans-serif" font-size="10" fill="#556677" text-anchor="end">200k</text>
    <text x="290" y="370" font-family="sans-serif" font-size="10" fill="#556677" text-anchor="end">300k</text>
    <text x="290" y="320" font-family="sans-serif" font-size="10" fill="#556677" text-anchor="end">400k</text>
    <!-- X-axis labels -->
    <text x="350" y="558" font-family="sans-serif" font-size="10" fill="#556677" text-anchor="middle">Jan</text>
    <text x="410" y="558" font-family="sans-serif" font-size="10" fill="#556677" text-anchor="middle">Feb</text>
    <text x="470" y="558" font-family="sans-serif" font-size="10" fill="#556677" text-anchor="middle">Mar</text>
    <text x="530" y="558" font-family="sans-serif" font-size="10" fill="#556677" text-anchor="middle">Apr</text>
    <text x="590" y="558" font-family="sans-serif" font-size="10" fill="#556677" text-anchor="middle">May</text>
    <text x="650" y="558" font-family="sans-serif" font-size="10" fill="#556677" text-anchor="middle">Jun</text>
    <text x="710" y="558" font-family="sans-serif" font-size="10" fill="#556677" text-anchor="middle">Jul</text>
    <text x="770" y="558" font-family="sans-serif" font-size="10" fill="#556677" text-anchor="middle">Aug</text>
    <text x="830" y="558" font-family="sans-serif" font-size="10" fill="#556677" text-anchor="middle">Sep</text>
    <text x="890" y="558" font-family="sans-serif" font-size="10" fill="#556677" text-anchor="middle">Oct</text>
    <!-- Table panel -->
    <rect x="972" y="256" width="200" height="320" rx="10" fill="#162447"/>
    <text x="996" y="284" font-family="sans-serif" font-size="13" fill="white" font-weight="bold">Top Products</text>
    <text x="996" y="312" font-family="sans-serif" font-size="11" fill="#8899aa">Widget Pro</text>
    <text x="1148" y="312" font-family="sans-serif" font-size="11" fill="#4ecca3" text-anchor="end">$892k</text>
    <line x1="996" y1="322" x2="1148" y2="322" stroke="#2a3a5c" stroke-width="0.5"/>
    <text x="996" y="342" font-family="sans-serif" font-size="11" fill="#8899aa">DataSync</text>
    <text x="1148" y="342" font-family="sans-serif" font-size="11" fill="#4ecca3" text-anchor="end">$645k</text>
    <line x1="996" y1="352" x2="1148" y2="352" stroke="#2a3a5c" stroke-width="0.5"/>
    <text x="996" y="372" font-family="sans-serif" font-size="11" fill="#8899aa">CloudBase</text>
    <text x="1148" y="372" font-family="sans-serif" font-size="11" fill="#4ecca3" text-anchor="end">$534k</text>
    <!-- Bottom section -->
    <rect x="252" y="596" width="920" height="180" rx="10" fill="#162447"/>
    <text x="276" y="628" font-family="sans-serif" font-size="14" fill="white" font-weight="bold">Recent Transactions</text>
    <text x="276" y="660" font-family="sans-serif" font-size="11" fill="#8899aa">Order #4892 -- Widget Pro -- john.doe@example.com -- $1,249.00 -- Completed</text>
    <text x="276" y="684" font-family="sans-serif" font-size="11" fill="#8899aa">Order #4891 -- DataSync -- jane.smith@corp.net -- $899.00 -- Processing</text>
    <text x="276" y="708" font-family="sans-serif" font-size="11" fill="#e94560">Order #4890 -- CloudBase -- ERROR: null reference -- $0.00 -- Failed</text>
    <text x="276" y="732" font-family="sans-serif" font-size="11" fill="#8899aa">Order #4889 -- Widget Pro -- mike.r@startup.io -- $2,100.00 -- Completed</text>
    <text x="276" y="756" font-family="sans-serif" font-size="11" fill="#8899aa">Order #4888 -- DataSync -- lisa.k@agency.com -- $449.00 -- Completed</text>
  `)
}

function makeExample1(): Project {
  const imgData = makeDashboardSVG()
  return {
    version: 1,
    name: 'Bug Report -- Dashboard Error',
    canvasWidth: 1280,
    canvasHeight: 880,
    images: [
      {
        id: 'img-dashboard',
        data: imgData,
        name: 'dashboard-screenshot.svg',
        x: 40, y: 50,
        width: 1200, height: 800,
        naturalWidth: 1200, naturalHeight: 800,
        role: 'standalone',
      },
    ],
    annotations: [
      // Image at (40, 50), size 1200x800. SVG (sx,sy) -> canvas (sx+40, sy+50).
      // Title
      { id: 'title', type: 'textbox', x: 40, y: 4, width: 700, height: 34, text: 'BUG-4890: Order processing null reference causing revenue drop', fontSize: 16, fontFamily: 'sans-serif', fill: '#ffffff', backgroundColor: '#e74c3c', borderColor: '#c0392b', borderWidth: 0, borderRadius: 6, padding: 8, bold: true },

      // Step 1: Conversion rate card showing -3.2%
      // SVG card: (732,132) 220x100 -> canvas: (772,182) to (992,282)
      { id: 'c1', type: 'counter', x: 900, y: 192, number: 1, fill: '#e74c3c', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'arr1', type: 'arrow', x: 0, y: 0, points: [888, 206, 860, 230], stroke: '#e74c3c', strokeWidth: 3, headSize: 10 },
      { id: 'txt1', type: 'text', x: 770, y: 140, text: 'Dropping since Aug!', fontSize: 13, fontFamily: 'sans-serif', fill: '#e74c3c', backgroundColor: 'rgba(30,30,46,0.9)', padding: 6 },

      // Step 2: Red bars in chart
      // SVG red bars: (750,460)-(910,540) -> canvas: (790,510)-(950,590)
      { id: 'c2', type: 'counter', x: 955, y: 518, number: 2, fill: '#e74c3c', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'rect1', type: 'rectangle', x: 788, y: 508, width: 164, height: 84, stroke: '#e74c3c', strokeWidth: 2, cornerRadius: 6 },
      { id: 'txt2', type: 'text', x: 660, y: 598, text: 'Q3 revenue collapse -- v3.8 deploy', fontSize: 12, fontFamily: 'sans-serif', fill: '#ff6b6b', backgroundColor: 'rgba(30,30,46,0.9)', padding: 6 },

      // Step 3: Error line in Recent Transactions
      // SVG error text baseline at y=708 -> canvas y=758
      { id: 'c3', type: 'counter', x: 290, y: 730, number: 3, fill: '#e74c3c', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'highlight1', type: 'highlight', x: 316, y: 748, width: 580, height: 16, fill: 'rgba(233, 69, 96, 0.25)', opacity: 1 },
      { id: 'arr2', type: 'arrow', x: 0, y: 0, points: [900, 756, 840, 756], stroke: '#e74c3c', strokeWidth: 2.5, headSize: 10 },
      { id: 'txt3', type: 'text', x: 905, y: 746, text: 'Null ref error!', fontSize: 13, fontFamily: 'sans-serif', fill: '#ff6b6b', backgroundColor: 'rgba(30,30,46,0.9)', padding: 6 },

      // Blur: email in top nav bar (SVG pill at (900,14) -> canvas (940,64))
      { id: 'blur-nav', type: 'blur', x: 938, y: 62, width: 124, height: 26, pixelSize: 6 },

      // Blur: email in transaction line 1 (SVG ~(455,660) -> canvas (495,710))
      { id: 'blur-email1', type: 'blur', x: 495, y: 702, width: 155, height: 16, pixelSize: 5 },

      // Redact: email in transaction line 2 with solid color box (to showcase both tools)
      { id: 'cbox2', type: 'colorbox', x: 480, y: 726, width: 140, height: 16, fill: '#162447' },

      // Showcase: DRAFT stamp
      { id: 'stamp1', type: 'stamp', x: 950, y: 800, text: 'DRAFT', fontSize: 20, fill: '#e74c3c', borderColor: '#e74c3c' },

      // Showcase: dashed arrow pointing to the chart
      { id: 'arr-dashed', type: 'arrow', x: 0, y: 0, points: [700, 500, 785, 540], stroke: '#f39c12', strokeWidth: 2, headSize: 8, dash: 'dashed' },
    ],
    rois: [],
    connectors: [],
  }
}

// ------------------------------------------------------------
// Example 2: PCB Inspection Report
// ------------------------------------------------------------
function makePCBSvg(): string {
  return svg(1000, 700, `
    <rect width="1000" height="700" fill="#1a472a"/>
    <!-- PCB substrate -->
    <rect x="40" y="40" width="920" height="620" rx="8" fill="#2d6a4f" stroke="#52b788" stroke-width="2"/>
    <!-- Traces -->
    <path d="M 100 200 H 300 V 350 H 500" stroke="#b7e4c7" stroke-width="3" fill="none"/>
    <path d="M 100 250 H 250 V 400 H 450 V 300 H 600" stroke="#b7e4c7" stroke-width="2" fill="none"/>
    <path d="M 500 350 H 700 V 200 H 850" stroke="#b7e4c7" stroke-width="3" fill="none"/>
    <path d="M 600 300 H 750 V 450 H 900" stroke="#b7e4c7" stroke-width="2" fill="none"/>
    <path d="M 200 500 H 400 V 550 H 600 V 480 H 800" stroke="#b7e4c7" stroke-width="2.5" fill="none"/>
    <path d="M 100 400 H 200 V 550 H 350" stroke="#b7e4c7" stroke-width="2" fill="none"/>
    <path d="M 700 400 V 550 H 850 V 500" stroke="#b7e4c7" stroke-width="2" fill="none"/>
    <!-- ICs / Chips -->
    <rect x="120" y="160" width="80" height="60" rx="4" fill="#1b4332" stroke="#95d5b2" stroke-width="1.5"/>
    <text x="160" y="196" font-family="monospace" font-size="10" fill="#95d5b2" text-anchor="middle">U1</text>
    <!-- IC pins -->
    <rect x="128" y="152" width="8" height="10" fill="#d4a373"/>
    <rect x="144" y="152" width="8" height="10" fill="#d4a373"/>
    <rect x="160" y="152" width="8" height="10" fill="#d4a373"/>
    <rect x="176" y="152" width="8" height="10" fill="#d4a373"/>
    <rect x="128" y="218" width="8" height="10" fill="#d4a373"/>
    <rect x="144" y="218" width="8" height="10" fill="#d4a373"/>
    <rect x="160" y="218" width="8" height="10" fill="#d4a373"/>
    <rect x="176" y="218" width="8" height="10" fill="#d4a373"/>
    <!-- Main processor -->
    <rect x="400" y="240" width="120" height="100" rx="4" fill="#1b4332" stroke="#95d5b2" stroke-width="2"/>
    <text x="460" y="280" font-family="monospace" font-size="11" fill="#95d5b2" text-anchor="middle">MCU</text>
    <text x="460" y="296" font-family="monospace" font-size="8" fill="#74c69d" text-anchor="middle">STM32F4</text>
    <text x="460" y="324" font-family="monospace" font-size="7" fill="#52b788" text-anchor="middle">SN:X9F2-04A1</text>
    <!-- MCU pins -->
    <rect x="392" y="252" width="10" height="6" fill="#d4a373"/>
    <rect x="392" y="268" width="10" height="6" fill="#d4a373"/>
    <rect x="392" y="284" width="10" height="6" fill="#d4a373"/>
    <rect x="392" y="300" width="10" height="6" fill="#d4a373"/>
    <rect x="392" y="316" width="10" height="6" fill="#d4a373"/>
    <rect x="518" y="252" width="10" height="6" fill="#d4a373"/>
    <rect x="518" y="268" width="10" height="6" fill="#d4a373"/>
    <rect x="518" y="284" width="10" height="6" fill="#d4a373"/>
    <rect x="518" y="300" width="10" height="6" fill="#d4a373"/>
    <rect x="518" y="316" width="10" height="6" fill="#d4a373"/>
    <!-- Power regulator -->
    <rect x="780" y="150" width="100" height="70" rx="4" fill="#1b4332" stroke="#95d5b2" stroke-width="1.5"/>
    <text x="830" y="185" font-family="monospace" font-size="10" fill="#95d5b2" text-anchor="middle">VREG</text>
    <text x="830" y="200" font-family="monospace" font-size="8" fill="#74c69d" text-anchor="middle">LM7805</text>
    <!-- Capacitors -->
    <rect x="300" y="380" width="20" height="40" rx="2" fill="#40916c" stroke="#95d5b2" stroke-width="1"/>
    <text x="310" y="435" font-family="monospace" font-size="8" fill="#74c69d" text-anchor="middle">C1</text>
    <rect x="350" y="380" width="20" height="40" rx="2" fill="#40916c" stroke="#95d5b2" stroke-width="1"/>
    <text x="360" y="435" font-family="monospace" font-size="8" fill="#74c69d" text-anchor="middle">C2</text>
    <rect x="680" y="160" width="20" height="40" rx="2" fill="#40916c" stroke="#95d5b2" stroke-width="1"/>
    <text x="690" y="215" font-family="monospace" font-size="8" fill="#74c69d" text-anchor="middle">C3</text>
    <!-- Resistors -->
    <rect x="580" y="260" width="40" height="12" rx="2" fill="#774936" stroke="#dda15e" stroke-width="1"/>
    <rect x="580" y="290" width="40" height="12" rx="2" fill="#774936" stroke="#dda15e" stroke-width="1"/>
    <rect x="580" y="320" width="40" height="12" rx="2" fill="#774936" stroke="#dda15e" stroke-width="1"/>
    <text x="600" y="355" font-family="monospace" font-size="8" fill="#dda15e" text-anchor="middle">R1-R3</text>
    <!-- Connector -->
    <rect x="100" y="480" width="60" height="100" rx="3" fill="#343a40" stroke="#adb5bd" stroke-width="1.5"/>
    <rect x="110" y="492" width="8" height="8" rx="1" fill="#d4a373"/>
    <rect x="130" y="492" width="8" height="8" rx="1" fill="#d4a373"/>
    <rect x="110" y="512" width="8" height="8" rx="1" fill="#d4a373"/>
    <rect x="130" y="512" width="8" height="8" rx="1" fill="#d4a373"/>
    <rect x="110" y="532" width="8" height="8" rx="1" fill="#d4a373"/>
    <rect x="130" y="532" width="8" height="8" rx="1" fill="#d4a373"/>
    <rect x="110" y="552" width="8" height="8" rx="1" fill="#d4a373"/>
    <rect x="130" y="552" width="8" height="8" rx="1" fill="#d4a373"/>
    <text x="130" y="600" font-family="monospace" font-size="9" fill="#adb5bd" text-anchor="middle">J1</text>
    <!-- LEDs -->
    <circle cx="850" cy="400" r="8" fill="#ff6b6b" stroke="#ffa07a" stroke-width="1"/>
    <circle cx="850" cy="430" r="8" fill="#51cf66" stroke="#8ce99a" stroke-width="1"/>
    <circle cx="850" cy="460" r="8" fill="#339af0" stroke="#74c0fc" stroke-width="1"/>
    <text x="870" y="403" font-family="monospace" font-size="8" fill="#ffa07a">ERR</text>
    <text x="870" y="433" font-family="monospace" font-size="8" fill="#8ce99a">PWR</text>
    <text x="870" y="463" font-family="monospace" font-size="8" fill="#74c0fc">ACT</text>
    <!-- Mounting holes -->
    <circle cx="70" cy="70" r="12" fill="none" stroke="#52b788" stroke-width="1.5"/>
    <circle cx="70" cy="70" r="4" fill="#1a472a"/>
    <circle cx="930" cy="70" r="12" fill="none" stroke="#52b788" stroke-width="1.5"/>
    <circle cx="930" cy="70" r="4" fill="#1a472a"/>
    <circle cx="70" cy="630" r="12" fill="none" stroke="#52b788" stroke-width="1.5"/>
    <circle cx="70" cy="630" r="4" fill="#1a472a"/>
    <circle cx="930" cy="630" r="12" fill="none" stroke="#52b788" stroke-width="1.5"/>
    <circle cx="930" cy="630" r="4" fill="#1a472a"/>
    <!-- Board markings -->
    <text x="500" y="660" font-family="monospace" font-size="10" fill="#52b788" text-anchor="middle">REV 2.1 -- SENSOR-CTRL-v2 -- 2026-03</text>
    <!-- Damage/defect area -->
    <path d="M 680 370 Q 700 365 720 375 Q 735 380 740 395 Q 745 410 730 415 Q 715 420 700 410 Q 685 400 680 385 Z" fill="#8B4513" opacity="0.6" stroke="#cd853f" stroke-width="1"/>
  `)
}

function makeExample2(): Project {
  const imgData = makePCBSvg()
  return {
    version: 1,
    name: 'PCB Inspection -- Sensor Controller Rev 2.1',
    canvasWidth: 1300,
    canvasHeight: 900,
    images: [
      {
        id: 'img-pcb',
        data: imgData,
        name: 'pcb-top-view.svg',
        x: 150, y: 80,
        width: 1000, height: 700,
        naturalWidth: 1000, naturalHeight: 700,
        role: 'standalone',
      },
    ],
    annotations: [
      // Image at (150,80). SVG coord (sx,sy) -> canvas (sx+150, sy+80).
      // ox=150, oy=80
      // Title
      { id: 'title', type: 'text', x: 150, y: 20, text: 'Inspection Report: SENSOR-CTRL-v2 Rev 2.1 -- Lot #2026-0341', fontSize: 18, fontFamily: 'sans-serif', fill: '#ffffff', backgroundColor: '#2d6a4f', padding: 10, bold: true },
      // 1: Burn mark near traces (SVG defect ~680,370 -> canvas 830,450)
      { id: 'c1', type: 'counter', x: 920, y: 438, number: 1, fill: '#e74c3c', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'rect-defect', type: 'rectangle', x: 820, y: 445, width: 100, height: 60, stroke: '#e74c3c', strokeWidth: 3, cornerRadius: 6 },
      { id: 'txt-defect', type: 'text', x: 820, y: 512, text: 'Corrosion -- moisture ingress', fontSize: 11, fontFamily: 'sans-serif', fill: '#ff6b6b', backgroundColor: 'rgba(30,30,30,0.9)', padding: 5 },
      // 2: MCU (SVG: 400,240,120x100 -> canvas: 550,320)
      { id: 'c2', type: 'counter', x: 620, y: 310, number: 2, fill: '#3498db', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'rect-mcu', type: 'rectangle', x: 548, y: 318, width: 125, height: 105, stroke: '#3498db', strokeWidth: 2, cornerRadius: 6 },
      { id: 'txt-mcu', type: 'text', x: 548, y: 428, text: 'MCU: STM32F4 -- fw v3.1.2', fontSize: 11, fontFamily: 'sans-serif', fill: '#74b9ff', backgroundColor: 'rgba(30,30,30,0.85)', padding: 5 },
      // 3: VREG (SVG: 780,150,100x70 -> canvas center: 980,265)
      { id: 'c3', type: 'counter', x: 1050, y: 225, number: 3, fill: '#2ecc71', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'ellipse-vreg', type: 'ellipse', x: 920, y: 220, radiusX: 60, radiusY: 45, stroke: '#2ecc71', strokeWidth: 2 },
      { id: 'txt-vreg', type: 'text', x: 1055, y: 242, text: 'VREG: 4.98V (OK)', fontSize: 11, fontFamily: 'sans-serif', fill: '#2ecc71', backgroundColor: 'rgba(30,30,30,0.85)', padding: 5 },
      // 4: Capacitors (SVG: C1 at 300,380, C2 at 350,380 -> canvas: 450,460 / 500,460)
      { id: 'c4', type: 'counter', x: 500, y: 445, number: 4, fill: '#f39c12', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'arr-cap', type: 'arrow', x: 0, y: 0, points: [490, 455, 478, 465], stroke: '#f39c12', strokeWidth: 2.5, headSize: 10 },
      { id: 'txt-cap', type: 'text', x: 370, y: 502, text: 'C1/C2: ESR elevated (12m vs 8m spec)', fontSize: 11, fontFamily: 'sans-serif', fill: '#f39c12', backgroundColor: 'rgba(30,30,30,0.85)', padding: 5 },
      // 5: Connector J1 (SVG: 100,480,60x100 -> canvas: 250,560)
      { id: 'c5', type: 'counter', x: 316, y: 570, number: 5, fill: '#9b59b6', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'arr-conn', type: 'arrow', x: 0, y: 0, points: [308, 580, 288, 600], stroke: '#9b59b6', strokeWidth: 2.5, headSize: 10 },
      { id: 'txt-conn', type: 'text', x: 220, y: 630, text: 'J1 pin 3: cold solder -- rework', fontSize: 11, fontFamily: 'sans-serif', fill: '#a29bfe', backgroundColor: 'rgba(30,30,30,0.85)', padding: 5 },
      // Redact serial number (SVG: text "SN:X9F2-04A1" at ~460,324, font 7px -> canvas: 610,404)
      { id: 'cbox-sn', type: 'colorbox', x: 605, y: 400, width: 60, height: 12, fill: '#1b4332' },
      { id: 'txt-redact', type: 'text', x: 608, y: 400, text: '[SN]', fontSize: 7, fontFamily: 'monospace', fill: '#52b788', padding: 1 },
      // Scale bar at bottom of image (canvas y = 80+700+10 = 790)
      { id: 'line-measure', type: 'line', x: 0, y: 0, points: [170, 795, 1130, 795], stroke: '#ffffff', strokeWidth: 1 },
      { id: 'txt-scale', type: 'text', x: 610, y: 798, text: '96mm', fontSize: 12, fontFamily: 'sans-serif', fill: '#ffffff', backgroundColor: 'rgba(30,30,30,0.8)', padding: 4 },

      // Showcase: dimension line for board width
      { id: 'dim-board', type: 'dimension', x: 0, y: 0, points: [150, 780, 1050, 780], stroke: '#ffffff', strokeWidth: 1, fontSize: 10, label: '96 mm', unit: 'mm', pixelsPerUnit: 9.375, capSize: 8 },

      // Showcase: monospace font for component label
      { id: 'txt-mono', type: 'text', x: 750, y: 350, text: 'U1: STM32F4', fontSize: 10, fontFamily: 'monospace', fill: '#2ecc71', backgroundColor: 'rgba(30,30,30,0.85)', padding: 4 },
    ],
    rois: [],
    connectors: [],
  }
}

// ------------------------------------------------------------
// Example 3: Materials Analysis -- Weld Cross-Section
// ------------------------------------------------------------
function makeWeldOverviewSVG(): string {
  return svg(800, 600, `
    <defs>
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" result="noise"/>
        <feColorMatrix type="saturate" values="0" in="noise" result="gray"/>
        <feBlend in="SourceGraphic" in2="gray" mode="overlay"/>
      </filter>
      <linearGradient id="metal1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#8d99ae"/>
        <stop offset="50%" stop-color="#a8b2c1"/>
        <stop offset="100%" stop-color="#6b7b8d"/>
      </linearGradient>
      <linearGradient id="weld" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#5c4033"/>
        <stop offset="30%" stop-color="#8b6f47"/>
        <stop offset="60%" stop-color="#6d5a3a"/>
        <stop offset="100%" stop-color="#4a3728"/>
      </linearGradient>
      <linearGradient id="haz" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#7c8da0"/>
        <stop offset="50%" stop-color="#9ba8b7"/>
        <stop offset="100%" stop-color="#7c8da0"/>
      </linearGradient>
    </defs>
    <!-- Background -->
    <rect width="800" height="600" fill="#2b2d42"/>
    <!-- Left base metal -->
    <rect x="20" y="120" width="280" height="360" fill="url(#metal1)" filter="url(#noise)"/>
    <!-- Right base metal -->
    <rect x="500" y="120" width="280" height="360" fill="url(#metal1)" filter="url(#noise)"/>
    <!-- HAZ left -->
    <rect x="300" y="120" width="60" height="360" fill="url(#haz)" opacity="0.9"/>
    <!-- HAZ right -->
    <rect x="440" y="120" width="60" height="360" fill="url(#haz)" opacity="0.9"/>
    <!-- Weld zone -->
    <path d="M 360 120 Q 400 100 440 120 L 440 480 Q 400 500 360 480 Z" fill="url(#weld)"/>
    <!-- Grain boundaries in weld (dendritic pattern) -->
    <path d="M 400 140 L 380 200 L 395 260 L 385 320 L 400 380 L 390 440 L 400 480" stroke="#a0845c" stroke-width="0.8" fill="none" opacity="0.6"/>
    <path d="M 400 160 L 420 220 L 405 280 L 415 340 L 400 400 L 410 460" stroke="#a0845c" stroke-width="0.8" fill="none" opacity="0.6"/>
    <path d="M 370 180 L 430 180" stroke="#a0845c" stroke-width="0.5" fill="none" opacity="0.4"/>
    <path d="M 365 250 L 435 250" stroke="#a0845c" stroke-width="0.5" fill="none" opacity="0.4"/>
    <path d="M 368 320 L 432 320" stroke="#a0845c" stroke-width="0.5" fill="none" opacity="0.4"/>
    <path d="M 370 390 L 430 390" stroke="#a0845c" stroke-width="0.5" fill="none" opacity="0.4"/>
    <!-- Crack in HAZ -->
    <path d="M 315 280 Q 320 290 318 305 Q 322 320 316 335 Q 320 345 318 358" stroke="#e74c3c" stroke-width="1.5" fill="none"/>
    <!-- Porosity in weld -->
    <circle cx="390" cy="210" r="4" fill="#2b2d42" opacity="0.7"/>
    <circle cx="410" cy="280" r="3" fill="#2b2d42" opacity="0.6"/>
    <circle cx="395" cy="350" r="5" fill="#2b2d42" opacity="0.7"/>
    <circle cx="405" cy="420" r="3.5" fill="#2b2d42" opacity="0.6"/>
    <!-- Labels on the cross-section -->
    <text x="150" y="310" font-family="sans-serif" font-size="14" fill="white" text-anchor="middle" opacity="0.7">Base Metal</text>
    <text x="150" y="328" font-family="sans-serif" font-size="10" fill="white" text-anchor="middle" opacity="0.5">ASTM A36</text>
    <text x="650" y="310" font-family="sans-serif" font-size="14" fill="white" text-anchor="middle" opacity="0.7">Base Metal</text>
    <text x="650" y="328" font-family="sans-serif" font-size="10" fill="white" text-anchor="middle" opacity="0.5">ASTM A36</text>
    <text x="400" y="555" font-family="sans-serif" font-size="12" fill="white" text-anchor="middle" opacity="0.7">Weld Zone (E7018)</text>
    <text x="330" y="505" font-family="sans-serif" font-size="10" fill="white" text-anchor="middle" opacity="0.5">HAZ</text>
    <text x="470" y="505" font-family="sans-serif" font-size="10" fill="white" text-anchor="middle" opacity="0.5">HAZ</text>
    <!-- Scale bar -->
    <line x1="50" y1="560" x2="250" y2="560" stroke="white" stroke-width="2"/>
    <line x1="50" y1="555" x2="50" y2="565" stroke="white" stroke-width="2"/>
    <line x1="250" y1="555" x2="250" y2="565" stroke="white" stroke-width="2"/>
    <text x="150" y="580" font-family="sans-serif" font-size="12" fill="white" text-anchor="middle">5 mm</text>
  `)
}

function makeDetailCrackSVG(): string {
  return svg(400, 300, `
    <rect width="400" height="300" fill="#7c8da0"/>
    <rect x="0" y="0" width="400" height="300" fill="#7c8da0" opacity="0.8"/>
    <!-- Grain structure -->
    <path d="M 0 50 Q 80 40 160 55 Q 240 45 320 60 Q 380 50 400 55" stroke="#6b7b8d" stroke-width="0.5" fill="none"/>
    <path d="M 0 100 Q 60 95 140 105 Q 220 95 300 110 Q 360 100 400 105" stroke="#6b7b8d" stroke-width="0.5" fill="none"/>
    <path d="M 0 150 Q 80 140 180 155 Q 260 145 340 160 Q 380 150 400 155" stroke="#6b7b8d" stroke-width="0.5" fill="none"/>
    <path d="M 0 200 Q 70 195 150 205 Q 240 195 320 210 Q 370 200 400 205" stroke="#6b7b8d" stroke-width="0.5" fill="none"/>
    <path d="M 0 250 Q 80 245 160 255 Q 250 245 340 260 Q 380 250 400 255" stroke="#6b7b8d" stroke-width="0.5" fill="none"/>
    <!-- Main crack -->
    <path d="M 180 20 Q 185 40 182 60 Q 190 80 185 100 Q 192 120 186 140 Q 193 160 188 180 Q 195 200 190 220 Q 198 240 192 260 Q 200 275 195 290" stroke="#1a1a2e" stroke-width="3" fill="none"/>
    <!-- Secondary cracks -->
    <path d="M 185 100 Q 200 105 215 100 Q 225 95 235 100" stroke="#1a1a2e" stroke-width="1.5" fill="none"/>
    <path d="M 186 140 Q 170 145 155 140" stroke="#1a1a2e" stroke-width="1" fill="none"/>
    <path d="M 190 220 Q 210 225 225 215" stroke="#1a1a2e" stroke-width="1.5" fill="none"/>
    <!-- Oxidation along crack -->
    <path d="M 180 20 Q 185 40 182 60 Q 190 80 185 100 Q 192 120 186 140 Q 193 160 188 180 Q 195 200 190 220 Q 198 240 192 260 Q 200 275 195 290" stroke="#8B4513" stroke-width="6" fill="none" opacity="0.3"/>
    <!-- Scale bar -->
    <line x1="20" y1="280" x2="120" y2="280" stroke="white" stroke-width="2"/>
    <line x1="20" y1="275" x2="20" y2="285" stroke="white" stroke-width="2"/>
    <line x1="120" y1="275" x2="120" y2="285" stroke="white" stroke-width="2"/>
    <text x="70" y="274" font-family="sans-serif" font-size="11" fill="white" text-anchor="middle">500 um</text>
  `)
}

function makeDetailPorositySVG(): string {
  return svg(400, 300, `
    <defs>
      <linearGradient id="weld2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6d5a3a"/>
        <stop offset="50%" stop-color="#8b6f47"/>
        <stop offset="100%" stop-color="#5c4033"/>
      </linearGradient>
    </defs>
    <rect width="400" height="300" fill="url(#weld2)"/>
    <!-- Dendritic grain pattern -->
    <path d="M 50 0 Q 55 50 48 100 Q 52 150 47 200 Q 53 250 50 300" stroke="#a0845c" stroke-width="1" fill="none" opacity="0.5"/>
    <path d="M 120 0 Q 125 40 118 90 Q 123 140 117 190 Q 124 240 120 300" stroke="#a0845c" stroke-width="1" fill="none" opacity="0.5"/>
    <path d="M 200 0 Q 205 50 198 100 Q 203 150 197 200 Q 204 250 200 300" stroke="#a0845c" stroke-width="1" fill="none" opacity="0.5"/>
    <path d="M 280 0 Q 285 40 278 90 Q 283 140 277 190 Q 284 240 280 300" stroke="#a0845c" stroke-width="1" fill="none" opacity="0.5"/>
    <path d="M 350 0 Q 355 50 348 100 Q 353 150 347 200 Q 354 250 350 300" stroke="#a0845c" stroke-width="1" fill="none" opacity="0.5"/>
    <!-- Pores -->
    <circle cx="100" cy="80" r="12" fill="#2b2d42" opacity="0.8"/>
    <circle cx="250" cy="120" r="8" fill="#2b2d42" opacity="0.7"/>
    <circle cx="180" cy="180" r="15" fill="#2b2d42" opacity="0.8"/>
    <circle cx="300" cy="200" r="10" fill="#2b2d42" opacity="0.7"/>
    <circle cx="140" cy="250" r="9" fill="#2b2d42" opacity="0.75"/>
    <circle cx="320" cy="60" r="6" fill="#2b2d42" opacity="0.6"/>
    <circle cx="70" cy="160" r="7" fill="#2b2d42" opacity="0.65"/>
    <!-- Scale bar -->
    <line x1="20" y1="280" x2="120" y2="280" stroke="white" stroke-width="2"/>
    <line x1="20" y1="275" x2="20" y2="285" stroke="white" stroke-width="2"/>
    <line x1="120" y1="275" x2="120" y2="285" stroke="white" stroke-width="2"/>
    <text x="70" y="274" font-family="sans-serif" font-size="11" fill="white" text-anchor="middle">500 um</text>
  `)
}

function makeDetailGrainSVG(): string {
  return svg(400, 300, `
    <rect width="400" height="300" fill="#a8b2c1"/>
    <!-- Grain boundaries - polygonal pattern -->
    <path d="M 0 40 L 60 20 L 130 45 L 190 15 L 270 40 L 340 25 L 400 50" stroke="#5c6b7a" stroke-width="1.5" fill="none"/>
    <path d="M 0 110 L 50 90 L 120 115 L 200 85 L 280 110 L 350 95 L 400 120" stroke="#5c6b7a" stroke-width="1.5" fill="none"/>
    <path d="M 0 170 L 70 155 L 140 180 L 210 150 L 290 175 L 360 160 L 400 185" stroke="#5c6b7a" stroke-width="1.5" fill="none"/>
    <path d="M 0 240 L 55 225 L 130 250 L 200 220 L 275 245 L 345 230 L 400 255" stroke="#5c6b7a" stroke-width="1.5" fill="none"/>
    <!-- Vertical boundaries -->
    <path d="M 60 20 L 50 90 L 70 155 L 55 225" stroke="#5c6b7a" stroke-width="1.5" fill="none"/>
    <path d="M 130 45 L 120 115 L 140 180 L 130 250" stroke="#5c6b7a" stroke-width="1.5" fill="none"/>
    <path d="M 190 15 L 200 85 L 210 150 L 200 220" stroke="#5c6b7a" stroke-width="1.5" fill="none"/>
    <path d="M 270 40 L 280 110 L 290 175 L 275 245" stroke="#5c6b7a" stroke-width="1.5" fill="none"/>
    <path d="M 340 25 L 350 95 L 360 160 L 345 230" stroke="#5c6b7a" stroke-width="1.5" fill="none"/>
    <!-- Twin boundaries -->
    <path d="M 140 115 L 200 85" stroke="#8899aa" stroke-width="0.8" fill="none" stroke-dasharray="4,3"/>
    <path d="M 280 110 L 290 175" stroke="#8899aa" stroke-width="0.8" fill="none" stroke-dasharray="4,3"/>
    <!-- Precipitates -->
    <circle cx="90" cy="60" r="2" fill="#5c6b7a"/>
    <circle cx="160" cy="100" r="1.5" fill="#5c6b7a"/>
    <circle cx="240" cy="130" r="2" fill="#5c6b7a"/>
    <circle cx="100" cy="200" r="1.5" fill="#5c6b7a"/>
    <circle cx="310" cy="70" r="2" fill="#5c6b7a"/>
    <circle cx="230" cy="200" r="1.5" fill="#5c6b7a"/>
    <!-- Scale bar -->
    <line x1="20" y1="280" x2="100" y2="280" stroke="#333" stroke-width="2"/>
    <line x1="20" y1="275" x2="20" y2="285" stroke="#333" stroke-width="2"/>
    <line x1="100" y1="275" x2="100" y2="285" stroke="#333" stroke-width="2"/>
    <text x="60" y="274" font-family="sans-serif" font-size="11" fill="#333" text-anchor="middle">200 um</text>
  `)
}

function makeExample3(): Project {
  return {
    version: 1,
    name: 'Weld Cross-Section Analysis -- Sample W-2026-017',
    canvasWidth: 1600,
    canvasHeight: 970,
    images: [
      {
        id: 'img-overview',
        data: makeWeldOverviewSVG(),
        name: 'weld-cross-section-overview.svg',
        x: 400, y: 180,
        width: 800, height: 600,
        naturalWidth: 800, naturalHeight: 600,
        role: 'overview',
      },
      {
        id: 'img-crack',
        data: makeDetailCrackSVG(),
        name: 'detail-haz-crack.svg',
        x: 20, y: 80,
        width: 340, height: 255,
        naturalWidth: 400, naturalHeight: 300,
        role: 'detail',
        linkedRoiId: 'roi-crack',
      },
      {
        id: 'img-porosity',
        data: makeDetailPorositySVG(),
        name: 'detail-weld-porosity.svg',
        x: 1240, y: 80,
        width: 340, height: 255,
        naturalWidth: 400, naturalHeight: 300,
        role: 'detail',
        linkedRoiId: 'roi-porosity',
      },
      {
        id: 'img-grain',
        data: makeDetailGrainSVG(),
        name: 'detail-base-metal-grain.svg',
        x: 1240, y: 556,
        width: 340, height: 255,
        naturalWidth: 400, naturalHeight: 300,
        role: 'detail',
        linkedRoiId: 'roi-grain',
      },
    ],
    annotations: [
      // Overview image at (400,180). SVG coord (sx,sy) -> canvas (sx+400, sy+180).
      // Detail images: crack at (20,80), porosity at (1240,80), grain at (1240,550)
      // Title
      { id: 'title', type: 'text', x: 20, y: 10, text: 'Fig. 3 -- Weld Analysis: W-2026-017', fontSize: 15, fontFamily: 'sans-serif', fill: '#ffffff', backgroundColor: '#2b2d42', padding: 8, bold: true },
      { id: 'title2', type: 'text', x: 310, y: 12, text: 'ASTM A36 / E7018', fontSize: 12, fontFamily: 'sans-serif', fill: '#8899aa', backgroundColor: '#2b2d42', padding: 6 },
      // Detail labels -- placed below each detail image
      { id: 'lbl-a', type: 'text', x: 20, y: 340, text: '(a) HAZ crack', fontSize: 11, fontFamily: 'sans-serif', fill: '#e74c3c', backgroundColor: 'rgba(43,45,66,0.9)', padding: 4 },
      { id: 'lbl-b', type: 'text', x: 1240, y: 340, text: '(b) Weld porosity', fontSize: 11, fontFamily: 'sans-serif', fill: '#3498db', backgroundColor: 'rgba(43,45,66,0.9)', padding: 4 },
      { id: 'lbl-c', type: 'text', x: 1240, y: 816, text: '(c) Base metal grains', fontSize: 11, fontFamily: 'sans-serif', fill: '#2ecc71', backgroundColor: 'rgba(43,45,66,0.9)', padding: 4 },
      { id: 'lbl-overview', type: 'text', x: 400, y: 788, text: '(d) Overview -- 2% Nital etch', fontSize: 11, fontFamily: 'sans-serif', fill: '#ffffff', backgroundColor: 'rgba(43,45,66,0.9)', padding: 4 },
      // ROI 1 -> detail (a): HAZ crack (SVG crack at ~315,280 -> canvas 715,460)
      // ROI 1 rendered by ConnectorRenderer
      // Detail border rendered by ConnectorRenderer
      { id: 'det-num-a', type: 'counter', x: 40, y: 100, number: 1, fill: '#e74c3c', textColor: '#ffffff', radius: 14, fontSize: 14 },
      // ROI 2 -> detail (b): weld porosity (SVG weld zone ~360-440, y=150-450 -> canvas 760-840, 330-630)
      // ROI 2 rendered by ConnectorRenderer
      // Detail border rendered by ConnectorRenderer
      { id: 'det-num-b', type: 'counter', x: 1260, y: 100, number: 2, fill: '#3498db', textColor: '#ffffff', radius: 14, fontSize: 14 },
      // ROI 3 -> detail (c): base metal grain (SVG right base ~550-700, y=200-400 -> canvas 950-1100, 380-580)
      // ROI 3 rendered by ConnectorRenderer
      // Detail border rendered by ConnectorRenderer
      { id: 'det-num-c', type: 'counter', x: 1260, y: 576, number: 3, fill: '#2ecc71', textColor: '#ffffff', radius: 14, fontSize: 14 },
      // Overview border
      { id: 'overview-border', type: 'rectangle', x: 400, y: 180, width: 800, height: 600, stroke: '#ffffff', strokeWidth: 1, cornerRadius: 6, opacity: 0.3 },
      // Arrow pointing to crack in overview
      { id: 'arr-crack', type: 'arrow', x: 0, y: 0, points: [690, 480, 715, 470], stroke: '#e74c3c', strokeWidth: 2.5, headSize: 10 },
      { id: 'txt-crack', type: 'text', x: 640, y: 482, text: 'Crack', fontSize: 12, fontFamily: 'sans-serif', fill: '#e74c3c', backgroundColor: 'rgba(43,45,66,0.9)', padding: 4 },
      // Arrow pointing to crack in detail image (a) -- crack at ~x=173 in canvas coords
      { id: 'arr-crack-detail', type: 'arrow', x: 0, y: 0, points: [120, 200, 168, 200], stroke: '#e74c3c', strokeWidth: 2.5, headSize: 10 },
      { id: 'txt-crack-detail', type: 'text', x: 70, y: 205, text: 'Crack', fontSize: 11, fontFamily: 'sans-serif', fill: '#e74c3c', backgroundColor: 'rgba(43,45,66,0.9)', padding: 4 },
      // Finding summary -- textbox with border
      { id: 'summary-box', type: 'textbox', x: 20, y: 856, width: 560, height: 100, text: 'Key Findings\n1: HAZ crack -- preheat review needed\n2: Weld porosity -- within D1.1 limits\n3: Base metal -- nominal', fontSize: 10, fontFamily: 'sans-serif', fill: '#e0e0e0', backgroundColor: 'rgba(43,45,66,0.95)', borderColor: '#555', borderWidth: 1, borderRadius: 6, padding: 10, bold: true },
    ],
    rois: [
      // ROI coords are relative to parent image (overview at 400,180)
      { id: 'roi-crack', imageId: 'img-overview', x: 290, y: 260, width: 55, height: 110, number: 1, color: '#e74c3c' },
      { id: 'roi-porosity', imageId: 'img-overview', x: 355, y: 160, width: 90, height: 200, number: 2, color: '#3498db' },
      { id: 'roi-grain', imageId: 'img-overview', x: 560, y: 220, width: 130, height: 120, number: 3, color: '#2ecc71' },
    ],
    connectors: [
      { id: 'conn-1', fromRoiId: 'roi-crack', toImageId: 'img-crack', color: '#e74c3c', strokeWidth: 2, style: 'straight' },
      { id: 'conn-2', fromRoiId: 'roi-porosity', toImageId: 'img-porosity', color: '#3498db', strokeWidth: 2, style: 'straight' },
      { id: 'conn-3', fromRoiId: 'roi-grain', toImageId: 'img-grain', color: '#2ecc71', strokeWidth: 2, style: 'straight' },
    ],
  }
}

// ------------------------------------------------------------
// Example 4: Server Room Audit
// ------------------------------------------------------------
// ------------------------------------------------------------
// Photo-based examples 4-7
// Photos are served from public/examples/ and loaded at runtime
// ------------------------------------------------------------

async function makeExample4(): Promise<Project> {
  const imgData = await loadPhoto('/examples/server-rack.jpg')
  const ox = 50, oy = 50
  return {
    version: 1,
    name: 'Server Room Audit -- Rack A07',
    canvasWidth: 1400,
    canvasHeight: 900,
    images: [
      {
        id: 'img-rack',
        data: imgData,
        name: 'rack-a07-front.jpg',
        x: ox, y: oy,
        width: 1200, height: 750,
        naturalWidth: 1300, naturalHeight: 800,
        // Crop: trim dark edges to focus on the racks
        cropX: 50, cropY: 25, cropWidth: 1200, cropHeight: 750,
        role: 'standalone' as const,
      },
    ],
    annotations: [
      // Title
      { id: 'e4-title', type: 'textbox' as const, x: 50, y: 4, width: 430, height: 34, text: 'AUDIT REPORT: RACK-A07 -- 5 Findings', fontSize: 16, fontFamily: 'sans-serif', fill: '#ffffff', backgroundColor: '#c0392b', borderColor: '#a93226', borderWidth: 0, borderRadius: 6, padding: 8, bold: true },

      // Finding 1: Tangled cables in upper section (~top third, center-left rack)
      { id: 'e4-c1', type: 'counter' as const, x: ox + 220, y: oy + 80, number: 1, fill: '#e74c3c', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'e4-rect-cables', type: 'rectangle' as const, x: ox + 60, y: oy + 40, width: 380, height: 200, stroke: '#ff4500', strokeWidth: 3, cornerRadius: 6 },
      { id: 'e4-txt1', type: 'textbox' as const, x: ox + 240, y: oy + 92, width: 310, height: 34, text: 'Cable spaghetti -- impedes airflow', fontSize: 12, fontFamily: 'sans-serif', fill: '#ff4500', backgroundColor: 'rgba(20,20,20,0.92)', borderColor: '#ff4500', borderWidth: 1, borderRadius: 4, padding: 6, bold: true },

      // Finding 2: Amber/warning LED visible on left rack (~upper-middle area)
      { id: 'e4-c2', type: 'counter' as const, x: ox + 550, y: oy + 200, number: 2, fill: '#e74c3c', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'e4-ellipse-led', type: 'ellipse' as const, x: ox + 480, y: oy + 270, radiusX: 50, radiusY: 40, stroke: '#e74c3c', strokeWidth: 2 },
      { id: 'e4-arr-led', type: 'arrow' as const, x: 0, y: 0, points: [ox + 540, oy + 220, ox + 500, oy + 255], stroke: '#e74c3c', strokeWidth: 2.5, headSize: 10 },
      { id: 'e4-txt2', type: 'textbox' as const, x: ox + 560, y: oy + 208, width: 250, height: 32, text: 'Amber LED -- check disk array', fontSize: 11, fontFamily: 'sans-serif', fill: '#ff6b6b', backgroundColor: 'rgba(20,20,20,0.9)', borderColor: '#e74c3c', borderWidth: 1, borderRadius: 4, padding: 5 },

      // Finding 3: Cable management panel (mid-section)
      { id: 'e4-c3', type: 'counter' as const, x: ox + 1100, y: oy + 380, number: 3, fill: '#f39c12', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'e4-rect-mgmt', type: 'rectangle' as const, x: ox + 800, y: oy + 350, width: 300, height: 120, stroke: '#f39c12', strokeWidth: 2, cornerRadius: 6 },
      { id: 'e4-txt3', type: 'textbox' as const, x: ox + 810, y: oy + 470, width: 230, height: 32, text: 'No cable management rings', fontSize: 11, fontFamily: 'sans-serif', fill: '#f39c12', backgroundColor: 'rgba(20,20,20,0.9)', borderColor: '#f39c12', borderWidth: 1, borderRadius: 4, padding: 5 },

      // Finding 4: Green LEDs indicating healthy servers (center rack, lower area)
      { id: 'e4-c4', type: 'counter' as const, x: ox + 750, y: oy + 520, number: 4, fill: '#2ecc71', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'e4-arr-ok', type: 'arrow' as const, x: 0, y: 0, points: [ox + 740, oy + 535, ox + 650, oy + 560], stroke: '#2ecc71', strokeWidth: 2.5, headSize: 10 },
      { id: 'e4-txt4', type: 'textbox' as const, x: ox + 760, y: oy + 540, width: 220, height: 32, text: 'OK -- green LEDs nominal', fontSize: 11, fontFamily: 'sans-serif', fill: '#2ecc71', backgroundColor: 'rgba(20,20,20,0.9)', borderColor: '#2ecc71', borderWidth: 1, borderRadius: 4, padding: 5 },

      // Finding 5: Capacity / rack utilization note
      { id: 'e4-c5', type: 'counter' as const, x: ox + 1100, y: oy + 700, number: 5, fill: '#3498db', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'e4-txt5', type: 'textbox' as const, x: ox + 1000, y: oy + 715, width: 192, height: 34, text: '~90% utilized', fontSize: 11, fontFamily: 'sans-serif', fill: '#74b9ff', backgroundColor: 'rgba(20,20,20,0.9)', borderColor: '#3498db', borderWidth: 1, borderRadius: 4, padding: 5 },

      // Photo credit
      { id: 'e4-credit', type: 'text' as const, x: ox + 900, y: oy + 780, text: 'Photo: Taylor Vick / Unsplash', fontSize: 9, fontFamily: 'sans-serif', fill: '#888888', backgroundColor: 'rgba(0,0,0,0.5)', padding: 3 },

      // Showcase: double-head arrow between racks
      { id: 'e4-darrow', type: 'arrow' as const, x: 0, y: 0, points: [ox + 420, oy + 650, ox + 700, oy + 650], stroke: '#9b59b6', strokeWidth: 2, headSize: 8, doubleHead: true },
      { id: 'e4-darrow-lbl', type: 'text' as const, x: ox + 500, y: oy + 630, text: 'Airflow path', fontSize: 10, fontFamily: 'sans-serif', fill: '#a29bfe', backgroundColor: 'rgba(20,20,20,0.9)', padding: 4 },

      // Showcase: dotted boundary rectangle
      { id: 'e4-dotted', type: 'rectangle' as const, x: ox + 50, y: oy + 580, width: 350, height: 150, stroke: '#3498db', strokeWidth: 1.5, cornerRadius: 6, dash: 'dotted' as const },
    ],
    rois: [],
    connectors: [],
  }
}


// ------------------------------------------------------------
// Example 5: Concrete Bridge Inspection (SVG)
// ------------------------------------------------------------
function makeBridgeSVG(): string {
  return svg(1300, 800, `
    <defs>
      <filter id="concrete-noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="5" seed="2" result="noise"/>
        <feColorMatrix type="saturate" values="0" in="noise" result="gray"/>
        <feBlend in="SourceGraphic" in2="gray" mode="overlay"/>
      </filter>
      <filter id="stain-blur">
        <feGaussianBlur stdDeviation="6"/>
      </filter>
      <linearGradient id="concrete-base" x1="0" y1="0" x2="0.1" y2="1">
        <stop offset="0%" stop-color="#8a8a82"/>
        <stop offset="30%" stop-color="#7d7d75"/>
        <stop offset="60%" stop-color="#929288"/>
        <stop offset="100%" stop-color="#7a7a72"/>
      </linearGradient>
      <linearGradient id="water-stain" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#5a5a4e" stop-opacity="0.7"/>
        <stop offset="50%" stop-color="#4a4a3e" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="#5a5a4e" stop-opacity="0.3"/>
      </linearGradient>
      <linearGradient id="rust-color" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#8B4513"/>
        <stop offset="50%" stop-color="#A0522D"/>
        <stop offset="100%" stop-color="#6B3410"/>
      </linearGradient>
      <pattern id="concrete-aggregate" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="5" cy="5" r="2" fill="#999" opacity="0.15"/>
        <circle cx="15" cy="12" r="1.5" fill="#888" opacity="0.12"/>
        <circle cx="10" cy="18" r="1" fill="#aaa" opacity="0.1"/>
      </pattern>
    </defs>
    <!-- Concrete surface background -->
    <rect width="1300" height="800" fill="url(#concrete-base)" filter="url(#concrete-noise)"/>
    <!-- Aggregate texture overlay -->
    <rect width="1300" height="800" fill="url(#concrete-aggregate)"/>

    <!-- Construction joints / form lines -->
    <line x1="0" y1="200" x2="1300" y2="200" stroke="#6e6e64" stroke-width="1.5" opacity="0.4"/>
    <line x1="0" y1="500" x2="1300" y2="500" stroke="#6e6e64" stroke-width="1.5" opacity="0.4"/>
    <line x1="430" y1="0" x2="430" y2="800" stroke="#6e6e64" stroke-width="1" opacity="0.3"/>
    <line x1="870" y1="0" x2="870" y2="800" stroke="#6e6e64" stroke-width="1" opacity="0.3"/>

    <!-- === MAJOR CRACK (running roughly vertically with branching) === -->
    <path d="M 340 20 Q 345 60 338 100 Q 350 140 342 180 Q 356 220 348 260 Q 360 300 350 340 Q 365 380 355 420 Q 370 460 358 500 Q 372 540 360 580 Q 375 620 365 660" stroke="#2a2a22" stroke-width="3" fill="none"/>
    <!-- Crack shadow/depth -->
    <path d="M 340 20 Q 345 60 338 100 Q 350 140 342 180 Q 356 220 348 260 Q 360 300 350 340 Q 365 380 355 420 Q 370 460 358 500 Q 372 540 360 580 Q 375 620 365 660" stroke="#1a1a12" stroke-width="5" fill="none" opacity="0.3"/>
    <!-- Crack branches -->
    <path d="M 348 260 Q 370 265 390 258 Q 405 250 420 255" stroke="#2a2a22" stroke-width="2" fill="none"/>
    <path d="M 355 420 Q 335 425 315 418 Q 300 410 285 415" stroke="#2a2a22" stroke-width="1.5" fill="none"/>
    <path d="M 360 580 Q 380 585 400 578 Q 420 572 435 580" stroke="#2a2a22" stroke-width="2" fill="none"/>
    <!-- Smaller secondary cracks -->
    <path d="M 342 180 Q 320 185 305 178" stroke="#3a3a32" stroke-width="1" fill="none"/>
    <path d="M 350 340 Q 375 345 395 338" stroke="#3a3a32" stroke-width="1" fill="none"/>

    <!-- === WATER STAINING === -->
    <ellipse cx="420" cy="350" rx="120" ry="180" fill="url(#water-stain)" filter="url(#stain-blur)" opacity="0.5"/>
    <!-- Efflorescence deposits (white streaks) -->
    <path d="M 355 300 Q 380 310 410 320 Q 440 340 460 370" stroke="#c8c8be" stroke-width="2" fill="none" opacity="0.4"/>
    <path d="M 350 350 Q 375 360 400 380 Q 420 400 430 430" stroke="#c8c8be" stroke-width="1.5" fill="none" opacity="0.35"/>
    <!-- Drip marks -->
    <path d="M 360 500 L 362 530 L 358 560 L 363 590" stroke="#5a5a4e" stroke-width="3" fill="none" opacity="0.4"/>
    <path d="M 375 480 L 378 520 L 373 555" stroke="#5a5a4e" stroke-width="2" fill="none" opacity="0.35"/>

    <!-- === REBAR EXPOSURE with corrosion === -->
    <path d="M 780 140 Q 810 120 860 125 Q 910 130 940 150 Q 960 170 950 200 Q 940 230 910 240 Q 870 250 830 240 Q 790 225 775 195 Q 765 165 780 140 Z" fill="#6a6a60" stroke="#5a5a52" stroke-width="1"/>
    <!-- Exposed rebar bars -->
    <line x1="790" y1="160" x2="940" y2="160" stroke="url(#rust-color)" stroke-width="8" stroke-linecap="round"/>
    <line x1="795" y1="185" x2="935" y2="185" stroke="url(#rust-color)" stroke-width="8" stroke-linecap="round"/>
    <line x1="800" y1="210" x2="930" y2="210" stroke="url(#rust-color)" stroke-width="7" stroke-linecap="round"/>
    <!-- Rust staining below rebar -->
    <path d="M 830 240 Q 835 270 830 300 Q 840 330 835 360" stroke="#8B4513" stroke-width="4" fill="none" opacity="0.35"/>
    <path d="M 870 245 Q 875 280 868 310" stroke="#8B4513" stroke-width="3" fill="none" opacity="0.3"/>
    <!-- Corrosion products on rebar -->
    <circle cx="820" cy="160" r="5" fill="#A0522D" opacity="0.6"/>
    <circle cx="860" cy="185" r="6" fill="#8B4513" opacity="0.5"/>
    <circle cx="900" cy="160" r="4" fill="#A0522D" opacity="0.55"/>
    <circle cx="850" cy="210" r="5" fill="#6B3410" opacity="0.5"/>

    <!-- === SPALLING AREA === -->
    <path d="M 950 520 Q 980 500 1040 505 Q 1100 510 1140 530 Q 1170 555 1160 590 Q 1150 625 1110 640 Q 1060 655 1010 645 Q 970 630 950 600 Q 935 570 950 520 Z" fill="#6e6e64" stroke="#5a5a52" stroke-width="1.5"/>
    <!-- Delamination layers visible -->
    <path d="M 970 540 Q 1000 525 1050 530 Q 1100 535 1120 550" stroke="#555" stroke-width="1" fill="none"/>
    <path d="M 960 570 Q 1000 558 1060 562 Q 1110 568 1140 580" stroke="#555" stroke-width="0.8" fill="none"/>
    <!-- Depth shadow -->
    <ellipse cx="1050" cy="575" rx="70" ry="45" fill="#555" opacity="0.3"/>
    <!-- Aggregate exposed at spall -->
    <circle cx="990" cy="550" r="4" fill="#999" opacity="0.4"/>
    <circle cx="1030" cy="570" r="5" fill="#aaa" opacity="0.35"/>
    <circle cx="1080" cy="555" r="3.5" fill="#999" opacity="0.4"/>
    <circle cx="1060" cy="600" r="4.5" fill="#aaa" opacity="0.35"/>
    <circle cx="1010" cy="615" r="3" fill="#999" opacity="0.3"/>

    <!-- === Minor surface defects === -->
    <circle cx="180" cy="650" r="3" fill="#6a6a60"/>
    <circle cx="190" cy="660" r="4" fill="#6a6a60"/>
    <circle cx="175" cy="670" r="3.5" fill="#6a6a60"/>
    <circle cx="195" cy="675" r="2.5" fill="#6a6a60"/>
    <circle cx="185" cy="685" r="3" fill="#6a6a60"/>
    <circle cx="170" cy="658" r="2" fill="#6a6a60"/>

    <!-- Photo reference markers -->
    <rect x="20" y="20" width="80" height="20" rx="3" fill="#333" opacity="0.7"/>
    <text x="60" y="34" font-family="monospace" font-size="10" fill="#ccc" text-anchor="middle">SPAN 3</text>
    <rect x="20" y="46" width="120" height="16" rx="3" fill="#333" opacity="0.6"/>
    <text x="80" y="57" font-family="monospace" font-size="8" fill="#aaa" text-anchor="middle">Bent Cap -- South Face</text>
    <text x="1280" y="790" font-family="monospace" font-size="9" fill="#666" text-anchor="end">Photo: BR-2026-0412-037</text>
  `)
}

function makeExample5(): Project {
  const imgData = makeBridgeSVG()
  const ox = 50, oy = 50
  return {
    version: 1,
    name: 'Bridge Inspection -- Span 3 Bent Cap',
    canvasWidth: 1400,
    canvasHeight: 900,
    images: [
      {
        id: 'img-bridge',
        data: imgData,
        name: 'bridge-span3-underside.svg',
        x: ox, y: oy,
        width: 1300, height: 800,
        naturalWidth: 1300, naturalHeight: 800,
        role: 'standalone',
      },
    ],
    annotations: [
      { id: 'e5-title', type: 'textbox', x: 50, y: 4, width: 530, height: 34, text: 'INSPECTION: Bridge #BR-4412 Span 3 -- 5 Findings', fontSize: 16, fontFamily: 'sans-serif', fill: '#ffffff', backgroundColor: '#c0392b', borderColor: '#a93226', borderWidth: 0, borderRadius: 6, padding: 8, bold: true },

      // Finding 1: Major crack -- using dimension line for measurement
      { id: 'e5-c1', type: 'counter', x: ox + 260, y: oy + 330, number: 1, fill: '#e74c3c', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'e5-dim-crack', type: 'dimension', x: 0, y: 0, points: [ox + 320, oy + 340, ox + 380, oy + 340], stroke: '#e74c3c', strokeWidth: 1.5, fontSize: 11, label: '2.3 mm', unit: 'mm', pixelsPerUnit: 26, capSize: 10 },
      { id: 'e5-txt1', type: 'textbox', x: ox + 100, y: oy + 318, width: 180, height: 48, text: 'Width: 2.3mm\n640mm long -- active', fontSize: 10, fontFamily: 'sans-serif', fill: '#ff6b6b', backgroundColor: 'rgba(30,30,30,0.9)', borderColor: '#e74c3c', borderWidth: 1, borderRadius: 4, padding: 6 },
      { id: 'e5-rect-crack', type: 'rectangle', x: ox + 310, y: oy + 15, width: 85, height: 650, stroke: '#e74c3c', strokeWidth: 2, cornerRadius: 6 },

      // Finding 2: Rebar exposure
      { id: 'e5-c2', type: 'counter', x: ox + 970, y: oy + 110, number: 2, fill: '#e67e22', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'e5-rect-rebar', type: 'rectangle', x: ox + 770, y: oy + 120, width: 195, height: 135, stroke: '#e67e22', strokeWidth: 3, cornerRadius: 6 },
      { id: 'e5-txt2', type: 'textbox', x: ox + 970, y: oy + 148, width: 340, height: 52, text: '3 bars exposed, 25% section loss\nCorrosion -- priority: HIGH', fontSize: 10, fontFamily: 'sans-serif', fill: '#e67e22', backgroundColor: 'rgba(30,30,30,0.9)', borderColor: '#e67e22', borderWidth: 1, borderRadius: 4, padding: 6, bold: true },

      // Finding 3: Water infiltration
      { id: 'e5-c3', type: 'counter', x: ox + 500, y: oy + 340, number: 3, fill: '#3498db', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'e5-ellipse-stain', type: 'ellipse', x: ox + 420, y: oy + 350, radiusX: 125, radiusY: 185, stroke: '#3498db', strokeWidth: 2 },
      { id: 'e5-txt3', type: 'textbox', x: ox + 460, y: oy + 534, width: 340, height: 30, text: 'Active water infiltration + efflorescence', fontSize: 11, fontFamily: 'sans-serif', fill: '#74b9ff', backgroundColor: 'rgba(30,30,30,0.9)', borderColor: '#3498db', borderWidth: 1, borderRadius: 4, padding: 5 },

      // Finding 4: Spalling
      { id: 'e5-c4', type: 'counter', x: ox + 1175, y: oy + 520, number: 4, fill: '#9b59b6', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'e5-rect-spall', type: 'rectangle', x: ox + 930, y: oy + 500, width: 245, height: 160, stroke: '#9b59b6', strokeWidth: 3, cornerRadius: 6 },
      { id: 'e5-txt4', type: 'textbox', x: ox + 930, y: oy + 658, width: 350, height: 52, text: 'Spalling: 200x150mm, depth ~30mm\nDelamination -- patch repair needed', fontSize: 10, fontFamily: 'sans-serif', fill: '#a29bfe', backgroundColor: 'rgba(30,30,30,0.9)', borderColor: '#9b59b6', borderWidth: 1, borderRadius: 4, padding: 6 },

      // Finding 5: Structural rating
      { id: 'e5-c5', type: 'counter', x: ox + 50, y: oy + 730, number: 5, fill: '#2ecc71', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'e5-txt5', type: 'textbox', x: ox + 75, y: oy + 716, width: 460, height: 52, text: 'NBI Condition Rating: 5 (Fair) -- prev. 6\nRecommend: Load rating analysis within 6 months', fontSize: 11, fontFamily: 'sans-serif', fill: '#2ecc71', backgroundColor: 'rgba(30,30,30,0.92)', borderColor: '#2ecc71', borderWidth: 1, borderRadius: 4, padding: 6, bold: true },

      // Showcase: REVIEW stamp
      { id: 'e5-stamp', type: 'stamp', x: ox + 1050, y: oy + 720, text: 'REVIEW', fontSize: 18, fill: '#f39c12', borderColor: '#f39c12' },

      // Showcase: dashed investigation area
      { id: 'e5-dashed-area', type: 'rectangle', x: ox + 250, y: oy + 450, width: 200, height: 120, stroke: '#e67e22', strokeWidth: 1.5, cornerRadius: 0, dash: 'dashed' },
    ],
    rois: [],
    connectors: [],
  }
}

// ------------------------------------------------------------
// Example 6: Solar Panel Array Inspection (Photo)
// ------------------------------------------------------------
async function makeExample6(): Promise<Project> {
  const imgData = await loadPhoto('/examples/solar-panels.jpg')
  const ox = 50, oy = 50
  return {
    version: 1,
    name: 'Solar Array Inspection -- Field Section A',
    canvasWidth: 1400,
    canvasHeight: 900,
    images: [
      {
        id: 'img-solar',
        data: imgData,
        name: 'solar-array-field.jpg',
        x: ox, y: oy,
        width: 1300, height: 800,
        naturalWidth: 1300, naturalHeight: 800,
        role: 'standalone' as const,
      },
    ],
    annotations: [
      { id: 'e6-title', type: 'textbox' as const, x: 50, y: 4, width: 480, height: 34, text: 'SOLAR ARRAY INSPECTION: Field A -- 4 Findings', fontSize: 16, fontFamily: 'sans-serif', fill: '#ffffff', backgroundColor: '#d35400', borderColor: '#bf4f00', borderWidth: 0, borderRadius: 6, padding: 8, bold: true },

      // Finding 1: Hotspot
      { id: 'e6-c1', type: 'counter' as const, x: ox + 500, y: oy + 350, number: 1, fill: '#e74c3c', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'e6-ellipse-hot', type: 'ellipse' as const, x: ox + 420, y: oy + 420, radiusX: 70, radiusY: 45, stroke: '#ff4500', strokeWidth: 3 },
      { id: 'e6-highlight-hot', type: 'highlight' as const, x: ox + 350, y: oy + 375, width: 140, height: 90, fill: 'rgba(255,69,0,0.2)', opacity: 1 },
      { id: 'e6-txt1', type: 'textbox' as const, x: ox + 510, y: oy + 358, width: 280, height: 48, text: 'Hotspot: +38C above ambient\nBypass diode check required', fontSize: 11, fontFamily: 'sans-serif', fill: '#ff6b6b', backgroundColor: 'rgba(20,20,20,0.9)', borderColor: '#e74c3c', borderWidth: 1, borderRadius: 4, padding: 5, bold: true },

      // Finding 2: Cracked panel
      { id: 'e6-c2', type: 'counter' as const, x: ox + 200, y: oy + 480, number: 2, fill: '#e74c3c', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'e6-rect-crack', type: 'rectangle' as const, x: ox + 80, y: oy + 450, width: 200, height: 120, stroke: '#e74c3c', strokeWidth: 3, cornerRadius: 6 },
      { id: 'e6-txt2', type: 'textbox' as const, x: ox + 210, y: oy + 488, width: 260, height: 48, text: 'Diagonal cell crack visible\nReplace -- arc fault risk', fontSize: 11, fontFamily: 'sans-serif', fill: '#ff6b6b', backgroundColor: 'rgba(20,20,20,0.9)', borderColor: '#e74c3c', borderWidth: 1, borderRadius: 4, padding: 5 },

      // Finding 3: Soiling
      { id: 'e6-c3', type: 'counter' as const, x: ox + 800, y: oy + 580, number: 3, fill: '#f39c12', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'e6-rect-soil', type: 'rectangle' as const, x: ox + 550, y: oy + 560, width: 450, height: 80, stroke: '#f39c12', strokeWidth: 2, cornerRadius: 6 },
      { id: 'e6-txt3', type: 'textbox' as const, x: ox + 810, y: oy + 590, width: 230, height: 30, text: 'Soiling -- schedule clean', fontSize: 11, fontFamily: 'sans-serif', fill: '#f39c12', backgroundColor: 'rgba(20,20,20,0.9)', borderColor: '#f39c12', borderWidth: 1, borderRadius: 4, padding: 5 },

      // Finding 4: Performance summary
      { id: 'e6-c4', type: 'counter' as const, x: ox + 50, y: oy + 740, number: 4, fill: '#3498db', textColor: '#ffffff', radius: 20, fontSize: 16 },
      { id: 'e6-txt4', type: 'textbox' as const, x: ox + 75, y: oy + 726, width: 460, height: 50, text: 'Array output: 5.1 kW / 6.48 kWp = 78.7% PR\nExpected 85% -- losses: soiling + hotspot + crack', fontSize: 11, fontFamily: 'sans-serif', fill: '#74b9ff', backgroundColor: 'rgba(20,20,20,0.92)', borderColor: '#3498db', borderWidth: 1, borderRadius: 4, padding: 6, bold: true },

      // Photo credit
      { id: 'e6-credit', type: 'text' as const, x: ox + 850, y: oy + 780, text: 'Photo: American Public Power Association / Unsplash', fontSize: 9, fontFamily: 'sans-serif', fill: '#888888', backgroundColor: 'rgba(0,0,0,0.5)', padding: 3 },

      // Showcase: dimension line for panel width
      { id: 'e6-dim', type: 'dimension' as const, x: 0, y: 0, points: [ox + 100, oy + 680, ox + 500, oy + 680], stroke: '#ffffff', strokeWidth: 1, fontSize: 11, label: '4.2 m', unit: 'm', pixelsPerUnit: 95, capSize: 10 },

      // Showcase: APPROVED stamp
      { id: 'e6-stamp', type: 'stamp' as const, x: ox + 950, y: oy + 50, text: 'APPROVED', fontSize: 16, fill: '#2ecc71', borderColor: '#2ecc71' },
    ],
    rois: [],
    connectors: [],
  }
}


// Image credits for photo-based examples
// Example 4 (Server Rack): Photo by Taylor Vick on Unsplash -- https://unsplash.com/photos/M5tzZtFCOfs
// Example 6 (Solar Panels): Photo by American Public Power Association on Unsplash -- https://unsplash.com/photos/FUeb2npsblQ

export const examples = [
  {
    id: 'bug-report',
    name: 'Bug Report -- Dashboard Error',
    description: 'Annotated screenshot with arrows, blur, counters, and redaction',
    complexity: 'Simple',
    load: () => rasterizeProject(makeExample1()),
  },
  {
    id: 'pcb-inspection',
    name: 'PCB Inspection Report',
    description: 'Circuit board with numbered findings, measurements, and component highlights',
    complexity: 'Intermediate',
    load: () => rasterizeProject(makeExample2()),
  },
  {
    id: 'weld-analysis',
    name: 'Weld Cross-Section Analysis',
    description: 'Composite figure: overview with ROIs connected to detail magnifications',
    complexity: 'Advanced',
    load: () => rasterizeProject(makeExample3()),
  },
  {
    id: 'server-rack-audit',
    name: 'Server Room Audit',
    description: 'Server rack with cable management, LED warnings, and capacity findings',
    complexity: 'Intermediate',
    load: () => makeExample4(),
  },
  {
    id: 'bridge-inspection',
    name: 'Bridge Concrete Inspection',
    description: 'Concrete underside with cracks, rebar corrosion, spalling, and structural rating',
    complexity: 'Intermediate',
    load: () => rasterizeProject(makeExample5()),
  },
  {
    id: 'solar-panel-inspection',
    name: 'Solar Panel Array Inspection',
    description: 'Field array with hotspot, cracked panel, soiling, and performance data',
    complexity: 'Intermediate',
    load: () => makeExample6(),
  },
]
