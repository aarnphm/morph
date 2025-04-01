import type { Element } from "hast"
import katex from "katex"
// @ts-expect-error no provided types
import Lexer from "pseudocode/src/Lexer.js"
// @ts-expect-error no provided types
import Parser from "pseudocode/src/Parser.js"
// @ts-expect-error no provided types
import Renderer from "pseudocode/src/Renderer.js"

export * from "@/components/parser/citation"

export const SvgOptions = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 16,
  height: 16,
  viewbox: "0 0 24 24",
  fill: "currentColor",
  stroke: "none",
  strokewidth: 0,
  strokelinecap: "round",
  strokelinejoin: "round",
}

export function removeAllChildren(node: HTMLElement) {
  while (node.firstChild) {
    node.removeChild(node.firstChild)
  }
}

export function extractArxivId(url: string): string | null {
  try {
    const urlObj = new URL(url)
    if (!urlObj.hostname.includes("arxiv.org")) return null

    // Match different arXiv URL patterns
    const patterns = [
      /arxiv.org\/abs\/(\d+\.\d+)/,
      /arxiv.org\/html\/(\d+\.\d+)/,
      /arxiv.org\/pdf\/(\d+\.\d+)(\.pdf)?/,
      /arxiv.org\/\w+\/(\d+\.\d+)/,
    ]

    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) return match[1]
    }

    return null
  } catch {
    return null
  }
}

export const escapeHTML = (unsafe: string) => {
  return unsafe
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

export const unescapeHTML = (html: string) => {
  return html
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
}

export function coerceDate(d: any): Date {
  const dt = new Date(d)
  const invalidDate = isNaN(dt.getTime()) || dt.getTime() === 0
  // TODO: add a toast here
  // if (invalidDate && d !== undefined) { }
  return invalidDate ? new Date() : dt
}

export function coalesceAliases(data: { [key: string]: any }, aliases: string[]) {
  for (const alias of aliases) {
    if (data[alias] !== undefined && data[alias] !== null) return data[alias]
  }
}

export function coerceToArray(input: string | string[]): string[] | undefined {
  if (input === undefined || input === null) return undefined

  // coerce to array
  if (!Array.isArray(input)) {
    input = input
      .toString()
      .split(",")
      .map((tag: string) => tag.trim())
  }

  // remove all non-strings
  return input
    .filter((tag: unknown) => typeof tag === "string" || typeof tag === "number")
    .map((tag: string | number) => tag.toString())
}

export function slugTag(tag: string) {
  return tag
    .split("/")
    .map((tagSegment) => sluggify(tagSegment))
    .join("/")
}

export function joinSegments(...args: string[]): string {
  if (args.length === 0) {
    return ""
  }

  let joined = args
    .filter((segment) => segment !== "" && segment !== "/")
    .map((segment) => stripSlashes(segment))
    .join("/")

  // if the first segment starts with a slash, add it back
  if (args[0].startsWith("/")) {
    joined = "/" + joined
  }

  // if the last segment is a folder, add a trailing slash
  if (args[args.length - 1].endsWith("/")) {
    joined = joined + "/"
  }

  return joined
}

export function getAllSegmentPrefixes(tags: string): string[] {
  const segments = tags.split("/")
  const results: string[] = []
  for (let i = 0; i < segments.length; i++) {
    results.push(segments.slice(0, i + 1).join("/"))
  }
  return results
}

function sluggify(s: string): string {
  return s
    .split("/")
    .map((segment) =>
      segment
        .replace(/\s/g, "-")
        .replace(/&/g, "-and-")
        .replace(/%/g, "-percent")
        .replace(/\?/g, "")
        .replace(/#/g, ""),
    )
    .join("/") // always use / as sep
    .replace(/\/$/, "")
}

export function stripSlashes(s: string, onlyStripPrefix?: boolean): string {
  if (s.startsWith("/")) {
    s = s.substring(1)
  }

  if (!onlyStripPrefix && s.endsWith("/")) {
    s = s.slice(0, -1)
  }

  return s
}

// Vendorred from https://github.com/ytliu74/obsidian-pseudocode/blob/master/src/latex_translator.ts
export function translateUnsupportedMacros(input: string): string {
  // handle \DeclarePairedDelimiter
  let output = input.replace(
    /\\DeclarePairedDelimiter\{(.*?)\}\{(.*?)\}\{(.*?)\}/g,
    "\\newcommand{$1}[1]{\\left$2 #1 \\right$3}",
  )

  // handle \DeclareMathOperator
  output = output.replace(
    /\\DeclareMathOperator\*\{(.*?)\}\{(.*?)\}/g,
    "\\newcommand{$1}{\\mathop{\\mathrm{$2}}}",
  )
  output = output.replace(
    /\\DeclareMathOperator\{(.*?)\}\{(.*?)\}/g,
    "\\newcommand{$1}{\\mathop{\\mathrm{$2}}}",
  )
  return output
}

// This is a performance improvement for translateUnsupportedMacros
export function translateUnsupportedMacrosPerf(input: string): string {
  const stripped = input
    .replace(/(?<!\\)%.*/gm, "")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .join("\n")

  return stripped.replace(
    /(\\DeclarePairedDelimiter\{(.*?)\}\{(.*?)\}\{(.*?)\})|(\\DeclareMathOperator\*\{(.*?)\}\{(.*?)\})|(\\DeclareMathOperator\{(.*?)\}\{(.*?)\})/g,
    (match, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10) => {
      if (p1) {
        // It's a \DeclarePairedDelimiter
        return `\\newcommand{${p2}}[1]{\\left${p3} #1 \\right${p4}}`
      } else if (p5) {
        // It's a \DeclareMathOperator*
        return `\\newcommand{${p6}}{\\mathop{\\mathrm{${p7}}}}`
      } else if (p8) {
        // It's a \DeclareMathOperator
        return `\\newcommand{${p9}}{\\mathop{\\mathrm{${p10}}}}`
      } else {
        // This should never happen if the regex is correct
        console.error(`Unexpected match: ${match}`)
        return match
      }
    },
  )
}

export function checkTranslatedMacros(input: string): string {
  const lines = input.split("\n")
  for (let i = 0; i < lines.length; i++) {
    try {
      katex.renderToString(lines[i])
    } catch (error) {
      if (error instanceof katex.ParseError && /redefine/.test(error.message)) {
        lines[i] = lines[i].replace("\\newcommand", "\\renewcommand")
        console.log(`Redefining ${lines[i]}`)
      } else {
        throw error
      }
    }
  }
  return lines.join("\n")
}

export function extractInlineMacros(source: string): [string, string] {
  const sourceLines = source.split("\n")
  const macroStartIndex = sourceLines.findIndex((line) => line.includes("\\begin{algorithm}"))

  const macroLines = sourceLines.slice(0, macroStartIndex).join("\n")
  const nonMacroLines = sourceLines.slice(macroStartIndex).join("\n")

  let inlineMacros = ""

  try {
    const translated = translateUnsupportedMacrosPerf(macroLines)
    inlineMacros = checkTranslatedMacros(translated)
  } catch (error) {
    console.error(error)
  }

  return [inlineMacros, nonMacroLines]
}

/**
 * Options of the renderer itself. These are a subset of the options that can be passed to the Quartz plugin.
 * See the PseudocodeOptions type for the full list of options.
 */
interface RendererOptions {
  /**
   * The indent size of inside a control block, e.g. if, for, etc. The unit must be in 'em'. Default value: '1.2em'.
   */
  indentSize?: string
  /**
   * The delimiters used to start and end a comment region. Note that only line comments are supported. Default value: '//'.
   */
  commentDelimiter?: string
  /**
   * The punctuation that follows line number. Default value: ':'.
   */
  lineNumberPunc?: string
  /**
   * Whether line numbering is enabled. Default value: false.
   */
  lineNumber?: boolean
  /**
   * Whether block ending, like `end if`, end `procedure`, etc., are showned. Default value: false.
   */
  noEnd?: boolean
  /**
   * Set the caption counter to this new value.
   */
  captionCount?: number
  /**
   * Whether to set scope lines
   */
  scopeLines?: boolean
  /**
   * The prefix in the title of the algorithm. Default value: 'Algorithm'.
   */
  titlePrefix?: string

  mathEngine?: "katex" | "mathjax"
  mathRenderer?: (input: string) => string
}

export const rendererOptions: RendererOptions = {
  indentSize: "0.6em",
  commentDelimiter: "  ▷",
  lineNumberPunc: ":",
  lineNumber: true,
  noEnd: false,
  scopeLines: false,
  captionCount: undefined,
  titlePrefix: "Algorithm",
  mathEngine: "katex",
  mathRenderer: undefined,
}

export function renderPseudoToString(input: string, options?: RendererOptions) {
  if (input === null || input === undefined) throw new ReferenceError("Input cannot be empty")

  const lexer = new Lexer(input)
  const parser = new Parser(lexer)
  const renderer = new Renderer(parser, options)
  if (options?.mathEngine || options?.mathRenderer) {
    renderer.backend ??= {}
    renderer.backend.name ??= options?.mathEngine
    renderer.backend.driver ??= {}
    renderer.backend.driver.renderToString ??= options?.mathRenderer
  }
  return renderer.toMarkup()
}

export function parsePseudoMeta(meta: string | null, opts: RendererOptions) {
  if (!meta) meta = ""

  const lineNumberMatch = meta.match(/lineNumber=(false|true|0|1)/i)
  const lnum = lineNumberMatch?.[1] ?? null
  let enableLineNumber: boolean
  if (lnum) {
    enableLineNumber = lnum === "true" || lnum === "1"
  } else {
    enableLineNumber = opts.lineNumber as boolean
  }
  meta = meta.replace(lineNumberMatch?.[0] ?? "", "")

  return { enableLineNumber, meta }
}

export const checkMermaidCode = ({ tagName, properties }: Element) =>
  tagName === "code" &&
  Boolean(properties.className) &&
  (properties.className as string[]).includes("mermaid")

// References implementation for ../mermaid-viewer.tsx
interface Position {
  x: number
  y: number
}

class DiagramPanZoom {
  private isDragging = false
  private startPan: Position = { x: 0, y: 0 }
  private currentPan: Position = { x: 0, y: 0 }
  private scale = 1
  private readonly MIN_SCALE = 0.5
  private readonly MAX_SCALE = 3
  private readonly ZOOM_SENSITIVITY = 0.001

  constructor(
    private container: HTMLElement,
    private content: HTMLElement,
  ) {
    this.setupEventListeners()
    this.setupNavigationControls()
  }

  private setupEventListeners() {
    // Mouse drag events
    this.container.addEventListener("mousedown", this.onMouseDown.bind(this))
    document.addEventListener("mousemove", this.onMouseMove.bind(this))
    document.addEventListener("mouseup", this.onMouseUp.bind(this))

    // Wheel zoom events
    this.container.addEventListener("wheel", this.onWheel.bind(this), { passive: false })

    // Reset on window resize
    window.addEventListener("resize", this.resetTransform.bind(this))
  }

  private setupNavigationControls() {
    const controls = document.createElement("div")
    controls.className = "mermaid-controls"

    // Zoom controls
    const zoomIn = this.createButton(
      `<svg width="24" height="24" strokewidth="0" stroke="none"><use href="#zoom-in"/></svg>`,
      () => this.zoom(0.1),
    )
    const zoomOut = this.createButton(
      `<svg width="24" height="24" strokewidth="0" stroke="none"><use href="#zoom-out"/></svg>`,
      () => this.zoom(-0.1),
    )
    const resetBtn = this.createButton(
      `<svg width="24" height="24" strokewidth="0" stroke="none"><use href="#expand-sw-ne"/></svg>`,
      () => this.resetTransform(),
    )

    controls.appendChild(zoomOut)
    controls.appendChild(resetBtn)
    controls.appendChild(zoomIn)

    this.container.appendChild(controls)
  }

  private createButton(text: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button")
    button.innerHTML = text
    button.className = "mermaid-control-button"
    button.addEventListener("click", onClick)
    // TODO: we must add a cleanup here to avoid memory leak
    return button
  }

  private onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return // Only handle left click
    this.isDragging = true
    this.startPan = { x: e.clientX - this.currentPan.x, y: e.clientY - this.currentPan.y }
    this.container.style.cursor = "grabbing"
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.isDragging) return
    e.preventDefault()

    this.currentPan = {
      x: e.clientX - this.startPan.x,
      y: e.clientY - this.startPan.y,
    }

    this.updateTransform()
  }

  private onMouseUp() {
    this.isDragging = false
    this.container.style.cursor = "grab"
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault()

    const delta = -e.deltaY * this.ZOOM_SENSITIVITY
    const newScale = Math.min(Math.max(this.scale + delta, this.MIN_SCALE), this.MAX_SCALE)

    // Calculate mouse position relative to content
    const rect = this.content.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // Adjust pan to zoom around mouse position
    const scaleDiff = newScale - this.scale
    this.currentPan.x -= mouseX * scaleDiff
    this.currentPan.y -= mouseY * scaleDiff

    this.scale = newScale
    this.updateTransform()
  }

  private zoom(delta: number) {
    const newScale = Math.min(Math.max(this.scale + delta, this.MIN_SCALE), this.MAX_SCALE)

    // Zoom around center
    const rect = this.content.getBoundingClientRect()
    const centerX = rect.width / 2
    const centerY = rect.height / 2

    const scaleDiff = newScale - this.scale
    this.currentPan.x -= centerX * scaleDiff
    this.currentPan.y -= centerY * scaleDiff

    this.scale = newScale
    this.updateTransform()
    return this
  }

  private updateTransform() {
    this.content.style.transform = `translate(${this.currentPan.x}px, ${this.currentPan.y}px) scale(${this.scale})`
    return this
  }

  public setInitialPan(pan: Position) {
    this.currentPan = pan
    this.startPan = { x: 0, y: 0 }
    return this
  }

  private resetTransform() {
    this.scale = 1
    // Reset to center instead of origin
    const containerRect = this.container.getBoundingClientRect()
    this.currentPan = { x: containerRect.width / 2, y: 0 }
    this.updateTransform()
    return this
  }
}

export function mermaidViewer(nodes: NodeListOf<HTMLDivElement>) {
  for (const codeBlock of Array.from(nodes)) {
    const svg = codeBlock.getElementsByTagName("svg")[0]

    const pre = codeBlock.parentNode as HTMLPreElement
    const expandBtn = pre.querySelector<HTMLButtonElement>(".expand-button")
    const popupContainer = pre.querySelector<HTMLElement>(".mermaid-viewer")

    let panZoom: DiagramPanZoom | null = null

    const closeBtn = popupContainer?.querySelector<HTMLButtonElement>(".close-button")

    function showMermaid() {
      const container = popupContainer?.querySelector<HTMLElement>("#mermaid-space")
      const content = popupContainer?.querySelector<HTMLElement>(".mermaid-content")
      if (!content || !container) return
      removeAllChildren(content)

      const cloned = svg!.cloneNode(true) as SVGElement
      cloned.style.transform = ""
      content.appendChild(cloned)

      // Show container
      popupContainer?.classList.add("active")
      container.style.cursor = "grab"
      content.style.transform = `scale(1)`

      // Initialize pan-zoom after showing the popup
      panZoom = new DiagramPanZoom(container, content)
      panZoom.setInitialPan({ x: 0, y: 0 })
    }

    function hideMermaid() {
      popupContainer?.classList.remove("active")
      panZoom = null
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && popupContainer?.classList.contains("active")) {
        e.stopPropagation()
        hideMermaid()
      }
    }

    expandBtn?.addEventListener("click", showMermaid)
    closeBtn?.addEventListener("click", hideMermaid)
    document.addEventListener("keydown", handleEscape)

    // TODO: we must add a cleanup here to avoid memory leak
  }
}
