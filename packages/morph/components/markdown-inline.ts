import {
  Decoration,
  type DecorationSet,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  EditorView,
} from "@codemirror/view"
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state"
import type { Root as HtmlRoot } from "hast"
import type { Root as MdRoot } from "mdast"
import { VFile } from "vfile"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import rehypeStringify from "rehype-stringify"
import { markdownPlugins, htmlPlugins } from "./parser"

export type HtmlContent = [HtmlRoot, VFile, string]

function shouldProcessFile(filename: string): boolean {
  const processableExtensions = [".md", ".mdx", ".markdown", ".txt"]
  return processableExtensions.some((ext) => filename.toLowerCase().endsWith(ext))
}

function processor(filename?: string) {
  if (filename?.endsWith(".mdx")) {
    return unified()
  }

  return unified()
    .use(remarkParse)
    .use(markdownPlugins())
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(htmlPlugins())
    .use(rehypeStringify, { allowDangerousHtml: true })
}

let mdProcessor: ReturnType<typeof processor> | null = null

const cached = new Map<string, HtmlContent>()

function getProcessor(filename?: string) {
  if (!mdProcessor) mdProcessor = processor(filename)
  return mdProcessor
}

export async function mdToHtml(value: string, filename?: string): Promise<string>
export async function mdToHtml(
  value: string,
  filename: string | undefined,
  returnHast: true,
): Promise<HtmlRoot>
export async function mdToHtml(
  value: string,
  filename?: string,
  returnHast?: boolean,
): Promise<HtmlRoot | string> {
  returnHast = returnHast ?? false
  if (!value.trim()) return returnHast ? { type: "root", children: [] } : ""
  if (filename && !shouldProcessFile(filename))
    return returnHast
      ? {
          type: "root",
          children: [{ type: "text", value }],
        }
      : value

  value = value
    .replace(/^ +/, (spaces) => spaces.replace(/ /g, "\u00A0"))
    .toString()
    .trim()

  const cacheKey = `${filename || "local"}:${value}`
  const cachedResult = cached.get(cacheKey)
  if (cachedResult) return returnHast ? cachedResult[0] : String(cachedResult[2])

  const file = new VFile()
  file.value = value
  if (filename) file.path = filename

  try {
    const proc = getProcessor(filename)
    const ast = proc.parse(file) as MdRoot
    const newAst = (await proc.run(ast, file)) as HtmlRoot
    const result = proc.stringify(newAst, file)
    // save ast for parsing reading mode
    cached.set(cacheKey, [newAst, file, result.toString()])
    return returnHast ? newAst : result.toString()
  } catch (error) {
    console.error("Error rendering content:", error)
    return returnHast
      ? {
          type: "root",
          children: [{ type: "text", value }],
        }
      : value
  }
}

const updateDecorations = StateEffect.define<DecorationSet>()

const markdownDecorations = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(updateDecorations)) {
        decorations = e.value
      }
    }
    return decorations
  },
  provide: (f) => EditorView.decorations.from(f),
})

interface PendingDecoration {
  from: number
  to: number
  html: string
}

export const setFile = StateEffect.define<string>()

export const fileField = StateField.define<string>({
  create: () => "",
  update: (value, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(setFile)) return effect.value
    }
    return value
  },
})

export const liveMode = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    pending: Map<number, boolean>
    currentView: EditorView
    filename?: string

    constructor(view: EditorView) {
      this.decorations = Decoration.none
      this.pending = new Map()
      this.currentView = view
      this.filename = view.state.field(fileField, false)
      this.computeDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet) {
        this.computeDecorations(update.view)
      }
    }

    async computeDecorations(view: EditorView) {
      if (!view.dom.isConnected) return

      const { state } = view
      const cursorPos = state.selection.main.head
      const cursorLine = state.doc.lineAt(cursorPos).number
      const pendingDecorations: PendingDecoration[] = []

      const processLine = async (lineNum: number) => {
        if (this.pending.get(lineNum)) return

        const line = state.doc.line(lineNum)
        const lineText = line.text

        this.pending.set(lineNum, true)

        try {
          const renderedHTML = await mdToHtml(lineText, this.filename)
          if (view.dom.isConnected) {
            pendingDecorations.push({
              from: line.from,
              to: line.to,
              html: renderedHTML,
            })
          }
        } finally {
          this.pending.delete(lineNum)
        }
      }

      const linePromises = []
      for (let lineNum = 1; lineNum <= state.doc.lines; lineNum++) {
        if (lineNum !== cursorLine) {
          linePromises.push(processLine(lineNum))
        }
      }

      await Promise.all(linePromises)

      if (view.dom.isConnected) {
        const builder = new RangeSetBuilder<Decoration>()

        pendingDecorations.sort((a, b) => a.from - b.from)

        for (const { from, to, html } of pendingDecorations) {
          builder.add(
            from,
            to,
            Decoration.replace({
              widget: new (class extends WidgetType {
                toDOM(): HTMLElement {
                  const wrapper = document.createElement("div")
                  wrapper.className = "cm-live-mode"
                  wrapper.innerHTML = html
                  return wrapper
                }
              })(),
            }),
          )
        }

        view.dispatch({
          effects: updateDecorations.of(builder.finish()),
        })
      }
    }

    destroy() {
      this.pending.clear()
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: () => [markdownDecorations],
  },
)
