// import {
//   Decoration,
//   type DecorationSet,
//   ViewPlugin,
//   type ViewUpdate,
//   WidgetType,
//   EditorView,
// } from "@codemirror/view"
import { StateEffect, StateField } from "@codemirror/state"
import type { Root as HtmlRoot } from "hast"
import type { Root as MdRoot } from "mdast"
import rehypeStringify from "rehype-stringify"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"
import { VFile } from "vfile"

import type { Settings } from "@/db/interfaces"

import { htmlPlugins, markdownPlugins } from "./parser"

export type HtmlContent = [HtmlRoot, VFile, string]

function processor(settings: Settings, vaultId: string) {
  return unified()
    .use(remarkParse)
    .use(markdownPlugins(settings, vaultId))
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(htmlPlugins(settings, vaultId))
    .use(rehypeStringify, { allowDangerousHtml: true })
}

let mdProcessor: ReturnType<typeof processor> | null = null

interface ConverterOptions {
  value: string
  vaultId: string
  settings: Settings
  fileId: string | null
  returnHast?: boolean
}

export async function mdToHtml(opts: Omit<ConverterOptions, "returnHast">): Promise<string>
export async function mdToHtml(opts: ConverterOptions): Promise<HtmlRoot>
export async function mdToHtml({
  value,
  vaultId,
  fileId,
  settings,
  returnHast,
}: ConverterOptions): Promise<HtmlRoot | string> {
  returnHast = returnHast ?? false
  if (!value.trim()) return returnHast ? { type: "root", children: [] } : ""
  value = value
    .replace(/^ +/, (spaces) => spaces.replace(/ /g, "\u00A0"))
    .toString()
    .trim()

  const file = new VFile()
  file.value = value
  file.path = fileId || "<default>"

  try {
    if (!mdProcessor) mdProcessor = processor(settings, vaultId)
    const ast = mdProcessor.parse(file) as MdRoot
    const newAst = (await mdProcessor.run(ast, file)) as HtmlRoot
    const result = mdProcessor.stringify(newAst, file)
    // save ast for parsing reading mode
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

export const setFile = StateEffect.define<string | null>()

export const fileField = StateField.define<string | null>({
  create: () => null,
  update: (value, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(setFile)) return effect.value
    }
    return value
  },
})

// const updateDecorations = StateEffect.define<DecorationSet>()
//
// const markdownDecorations = StateField.define<DecorationSet>({
//   create() {
//     return Decoration.none
//   },
//   update(decorations, tr) {
//     decorations = decorations.map(tr.changes)
//     for (const e of tr.effects) {
//       if (e.is(updateDecorations)) {
//         decorations = e.value
//       }
//     }
//     return decorations
//   },
//   provide: (f) => EditorView.decorations.from(f),
// })
//
// interface PendingDecoration {
//   from: number
//   to: number
//   html: string
// }
//
// export const liveMode = ViewPlugin.fromClass(
//   class {
//     decorations: DecorationSet
//     pending: Map<number, boolean>
//     currentView: EditorView
//     filename?: string
//
//     constructor(view: EditorView) {
//       this.decorations = Decoration.none
//       this.pending = new Map()
//       this.currentView = view
//       this.filename = view.state.field(fileField, false)
//       this.computeDecorations(view)
//     }
//
//     update(update: ViewUpdate) {
//       if (update.docChanged || update.selectionSet) {
//         this.computeDecorations(update.view)
//       }
//     }
//
//     async computeDecorations(view: EditorView) {
//       if (!view.dom.isConnected) return
//
//       const { state } = view
//       const cursorPos = state.selection.main.head
//       const cursorLine = state.doc.lineAt(cursorPos).number
//       const pendingDecorations: PendingDecoration[] = []
//
//       const processLine = async (lineNum: number) => {
//         if (this.pending.get(lineNum)) return
//
//         const line = state.doc.line(lineNum)
//         const lineText = line.text
//
//         this.pending.set(lineNum, true)
//
//         try {
//           const renderedHTML = await mdToHtml(lineText, this.filename)
//           if (view.dom.isConnected) {
//             pendingDecorations.push({
//               from: line.from,
//               to: line.to,
//               html: renderedHTML,
//             })
//           }
//         } finally {
//           this.pending.delete(lineNum)
//         }
//       }
//
//       const linePromises = []
//       for (let lineNum = 1; lineNum <= state.doc.lines; lineNum++) {
//         if (lineNum !== cursorLine) {
//           linePromises.push(processLine(lineNum))
//         }
//       }
//
//       await Promise.all(linePromises)
//
//       if (view.dom.isConnected) {
//         const builder = new RangeSetBuilder<Decoration>()
//
//         pendingDecorations.sort((a, b) => a.from - b.from)
//
//         for (const { from, to, html } of pendingDecorations) {
//           builder.add(
//             from,
//             to,
//             Decoration.replace({
//               widget: new (class extends WidgetType {
//                 toDOM(): HTMLElement {
//                   const wrapper = document.createElement("div")
//                   wrapper.className = "cm-live-mode"
//                   wrapper.innerHTML = html
//                   return wrapper
//                 }
//               })(),
//             }),
//           )
//         }
//
//         view.dispatch({
//           effects: updateDecorations.of(builder.finish()),
//         })
//       }
//     }
//
//     destroy() {
//       this.pending.clear()
//     }
//   },
//   {
//     decorations: (v) => v.decorations,
//     provide: () => [markdownDecorations],
//   },
// )
