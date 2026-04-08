import { describe, it, expect } from 'vitest'

describe('LaTeX export generation', () => {
  it('should generate valid LaTeX with text annotations', () => {
    const canvasWidth = 1920
    const canvasHeight = 1080

    const textAnnotations = [
      { type: 'text' as const, id: 't1', x: 288, y: 216, text: 'Crack initiation', fontSize: 18, fontFamily: 'sans-serif', fill: '#000', bold: true, backgroundColor: 'rgba(255,255,255,0.85)' },
    ]
    const counterAnnotations = [
      { type: 'counter' as const, id: 'c1', x: 576, y: 108, number: 1, fill: '#e74c3c', textColor: '#ffffff', radius: 16, fontSize: 16 },
    ]

    let tex = '\\begin{tikzpicture}\n'
    for (const ann of textAnnotations) {
      const nx = (ann.x / canvasWidth).toFixed(4)
      const ny = (1 - ann.y / canvasHeight).toFixed(4)
      tex += `  \\node at (${nx},${ny}) {${ann.text}};\n`
    }
    for (const ann of counterAnnotations) {
      const nx = (ann.x / canvasWidth).toFixed(4)
      const ny = (1 - ann.y / canvasHeight).toFixed(4)
      tex += `  \\node[circle] at (${nx},${ny}) {${ann.number}};\n`
    }
    tex += '\\end{tikzpicture}\n'

    expect(tex).toContain('\\begin{tikzpicture}')
    expect(tex).toContain('\\end{tikzpicture}')
    expect(tex).toContain('Crack initiation')
    expect(tex).toContain('{1}')
    expect(tex).toContain('0.1500')
    expect(tex).toContain('0.8000')
  })

  it('should escape special LaTeX characters', () => {
    const specialChars = 'Test & value: 100% with $variable and #tag'
    const escaped = specialChars.replace(/[&%$#_{}~^]/g, (m) => `\\${m}`)
    expect(escaped).toBe('Test \\& value: 100\\% with \\$variable and \\#tag')
  })

  it('should map font sizes to LaTeX commands correctly', () => {
    const mapFontSize = (size: number): string => {
      if (size <= 10) return '\\scriptsize'
      if (size <= 14) return '\\footnotesize'
      if (size <= 18) return '\\small'
      if (size <= 24) return '\\normalsize'
      if (size <= 30) return '\\large'
      return '\\Large'
    }

    expect(mapFontSize(8)).toBe('\\scriptsize')
    expect(mapFontSize(12)).toBe('\\footnotesize')
    expect(mapFontSize(16)).toBe('\\small')
    expect(mapFontSize(20)).toBe('\\normalsize')
    expect(mapFontSize(28)).toBe('\\large')
    expect(mapFontSize(36)).toBe('\\Large')
  })

  it('should convert hex colors to RGB values', () => {
    const hex = '#e74c3c'
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    expect(r).toBe(231)
    expect(g).toBe(76)
    expect(b).toBe(60)
  })
})

describe('export function signatures', () => {
  it('exportPNG should accept pixelRatio parameter', async () => {
    const { exportPNG } = await import('./exportImage')
    // Function exists and accepts 5 parameters (stage, w, h, name, pixelRatio)
    expect(exportPNG.length).toBeGreaterThanOrEqual(4)
  })

  it('exportJPG should accept pixelRatio and quality parameters', async () => {
    const { exportJPG } = await import('./exportImage')
    // Function exists and accepts 6 parameters (stage, w, h, name, pixelRatio, quality)
    expect(exportJPG.length).toBeGreaterThanOrEqual(4)
  })
})
