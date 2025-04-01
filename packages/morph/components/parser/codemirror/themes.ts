import {
  HighlightStyle,
  syntaxHighlighting as syntaxHighlightingGenerator,
} from "@codemirror/language"
import { tags } from "@lezer/highlight"
import { createTheme } from "@uiw/codemirror-themes"

export const theme = createTheme({
  theme: "light",
  settings: {
    background: "transparent",
    lineHighlight: "transparent",
    foreground: "var(--color-text)",
    caret: "var(--color-border-focus)",
    selection: "var(--color-red-100)",
    gutterBackground: "transparent",
    gutterForeground: "var(--color-text-secondary)",
    gutterActiveForeground: "var(--color-text-secondary)",
    gutterBorder: "transparent",
  },
  styles: [],
})

export const syntaxHighlighting = () =>
  syntaxHighlightingGenerator(
    HighlightStyle.define([
      {
        tag: tags.heading1,
        fontSize: "var(--font-size-xl)",
        fontWeight: 550,
      },
      {
        tag: tags.heading2,
        fontSize: "var(--font-size-lg)",
        fontWeight: 550,
      },
      {
        tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6],
        fontWeight: 550,
      },
      {
        tag: [tags.comment, tags.contentSeparator],
        color: "var(--color-text-secondary)",
      },
      {
        tag: tags.emphasis,
        fontStyle: "italic",
      },
      {
        tag: tags.strong,
        fontWeight: 650,
      },
      {
        tag: tags.strikethrough,
        textDecoration: "line-through",
      },
    ]),
  )
