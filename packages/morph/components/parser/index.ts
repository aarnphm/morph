import { eq } from "drizzle-orm"
import matter, { type GrayMatterFile } from "gray-matter"
import type { Element, Root as HtmlRoot, Text } from "hast"
import { fromHtmlIsomorphic } from "hast-util-from-html-isomorphic"
import { headingRank } from "hast-util-heading-rank"
import { toHtml as hastToHtml } from "hast-util-to-html"
import { toString as hastToString } from "hast-util-to-string"
import { type Child, h, s } from "hastscript"
import yaml from "js-yaml"
import type { Code, Root as MdRoot } from "mdast"
import { fromMarkdown } from "mdast-util-from-markdown"
import { toHast as mdastToHast } from "mdast-util-to-hast"
import { toString as mdastToString } from "mdast-util-to-string"
import readingTime, { ReadTimeResults } from "reading-time"
import { Cite } from "rehype-citation"
import { genBiblioNode } from "rehype-citation/node/src/gen-biblio.js"
import { genFootnoteSection } from "rehype-citation/node/src/gen-footnote.js"
import { parseCitation } from "rehype-citation/node/src/parse-citation.js"
import rehypeGithubEmoji from "rehype-github-emoji"
import rehypeKatex from "rehype-katex"
import rehypePrettyCode, { Theme } from "rehype-pretty-code"
import rehypeRaw from "rehype-raw"
import rehypeSlug from "rehype-slug"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import smartypants from "remark-smartypants"
import { PluggableList } from "unified"
import { EXIT, SKIP, visit } from "unist-util-visit"
import { Data } from "vfile"

import {
  SvgOptions,
  coalesceAliases,
  coerceDate,
  coerceToArray,
  escapeHTML,
  extractArxivId,
  extractInlineMacros,
  genCitation,
  getCitationFormat,
  parsePseudoMeta,
  renderPseudoToString,
  rendererOptions,
  slugTag,
  unescapeHTML,
} from "@/components/parser/utils"

import { dbHandle } from "@/hooks/use-fs-handles"

import { type Settings } from "@/db/interfaces"

export type MorphPluginData = Data
export type MorphParser = {
  name: string
  markdownPlugins?: (settings: Settings, vaultId: string) => PluggableList
  htmlPlugins?: (settings: Settings, vaultId: string) => PluggableList
}

declare module "vfile" {
  interface DataMap {
    description: string
    abstract: string
    text: string
    readingTime: ReadTimeResults
    dates: {
      created: Date
      modified: Date
      published: Date
    }
    frontmatter: { [key: string]: unknown } & {
      title: string
    } & Partial<{
        permalinks: string[]
        tags: string[]
        aliases: string[]
        description: string
        abstract: string
        created: string
        modified: string
        published: string
        lang: string
        cssclasses: string[]
        socialImage: string
        socials: Record<string, string>
      }>
  }
}

export function md(value: string): GrayMatterFile<string>
export function md(value: Buffer<ArrayBuffer>): GrayMatterFile<Buffer<ArrayBuffer>>
export function md(
  content: string | Buffer<ArrayBuffer>,
): GrayMatterFile<string | Buffer<ArrayBuffer>> {
  return matter(content, {
    delimiters: "---",
    language: "yaml",
    engines: {
      yaml: (s) => yaml.load(s, { schema: yaml.JSON_SCHEMA }) as object,
    },
  })
}

// grid two columns
const gr = (...el: Child[]) =>
  h(
    "div",
    {
      class: `grid gap-1 [&>*]:pl-2 [&>*]:py-2 min-[24rem]:grid-cols-[10rem_1fr] border border-transparent hover:border-gray-400 hover:border-solid ${el.length === 0 ? "empty-content" : ""}`,
    },
    ...(el.length > 0 ? el : []),
  )
const t = (value: string) =>
  h("div", { class: "color-inherit !text-sm/7 muted text-gray-300 dark:text-gray-500" }, [
    { type: "text", value },
  ])

const Frontmatter = {
  name: "Frontmatter",
  markdownPlugins: () => [
    [remarkFrontmatter, ["yaml", "toml"]],
    () => (_, file) => {
      const { data } = md(Buffer.from(file.value as string))

      if (data.title != null && data.title.toString() !== "") {
        data.title = data.title.toString()
      } else {
        data.title = file.stem ?? "Sans titre"
      }

      const permalinks = coerceToArray(coalesceAliases(data, ["permalinks", "permalink"]))
      if (permalinks) data.permalinks = permalinks

      const tags = coerceToArray(coalesceAliases(data, ["tags", "tag"]))
      if (tags) data.tags = [...new Set(tags.map((tag: string) => slugTag(tag)))]

      const aliases = coerceToArray(coalesceAliases(data, ["aliases", "alias"]))
      if (aliases) data.aliases = aliases

      const cssclasses = coerceToArray(coalesceAliases(data, ["cssclasses", "cssclass"]))
      if (cssclasses) data.cssclasses = cssclasses

      const description = coalesceAliases(data, ["description", "socialDescription"])
      if (description) data.description = description

      const socials = coalesceAliases(data, ["social", "socials"])
      if (socials) data.socials = socials

      const created = coalesceAliases(data, ["date", "created"])
      if (created) data.created = created
      const modified = coalesceAliases(data, ["lastmod", "updated", "last-modified", "modified"])
      if (modified) data.modified = modified
      const published = coalesceAliases(data, ["publishDate", "published", "date"])
      if (published) data.published = published

      // fill in frontmatter
      file.data.frontmatter = data as MorphPluginData["frontmatter"]
    },
  ],
  htmlPlugins: () => [
    () => (tree: HtmlRoot, file) => {
      const frontmatter = file.data.frontmatter
      if (!frontmatter) return SKIP

      visit(tree, "element", (_, index, parent) => {
        parent!.children.splice(
          index!,
          0,
          h(
            "div.metadata-container",
            h(
              "div",
              {
                class: "flex flex-col gap-4 empty-content mb-8 border-b border-b-solid",
              },
              h("h1.metadata-title", { class: "mb-0" }, [
                { type: "text", value: frontmatter.title },
              ]),
              h(
                "div",
                { class: "flex flex-col border-border [&>*:last-child]:mb-4 text-sm/7" },
                [
                  frontmatter.tags &&
                    gr(
                      t("tag"),
                      h(
                        "div.metadata-content",
                        { class: "gap-2 m-0 flex list-style-none" },
                        frontmatter.tags.map((el) =>
                          h(
                            "div",
                            {
                              class:
                                "border-gray-400 border-solid flex-shrink-0 border rounded px-1 text-tiny items-center flex cursor-pointer leading-none max-w-[calc(100% - 6px - 1ch)] relative",
                            },
                            h("span", [{ type: "text", value: el }]),
                          ),
                        ),
                      ),
                    ),
                  frontmatter.description &&
                    gr(
                      t("description"),
                      h("div.metadata-content", { class: "italic muted" }, [
                        { type: "text", value: frontmatter.description },
                      ]),
                    ),
                  frontmatter.created &&
                    gr(
                      t("date"),
                      h("div.metadata-content", [{ type: "text", value: frontmatter.created }]),
                    ),
                  frontmatter.socials &&
                    gr(
                      t("socials"),
                      h(
                        "div.metadata-content",
                        { class: "gap-2 m-0 flex list-style-none text-m" },
                        Object.entries(frontmatter.socials).map(([social, link]) =>
                          h(
                            "address",
                            {
                              class:
                                "flex-shrink-0 text-tiny items-center flex cursor-pointer leading-none relative",
                            },
                            h(
                              "a",
                              {
                                href: link,
                                target: "_blank",
                                rel: "noopener noreferrer",
                                class: "external",
                              },
                              [{ type: "text", value: social }],
                            ),
                          ),
                        ),
                      ),
                    ),
                ].filter(Boolean),
              ),
            ),
          ),
        )
        return EXIT
      })
    },
  ],
} satisfies MorphParser

type MaybeDate = undefined | string | number
const ModifiedTime = {
  name: "ModifiedTime",
  markdownPlugins: () => [
    () => (_, file) => {
      let created: MaybeDate = undefined
      let modified: MaybeDate = undefined
      let published: MaybeDate = undefined

      created ||= file.data.frontmatter?.created as MaybeDate
      modified ||= file.data.frontmatter?.modified as MaybeDate
      published ||= file.data.frontmatter?.published as MaybeDate

      file.data.dates = {
        created: coerceDate(created),
        modified: coerceDate(modified),
        published: coerceDate(published),
      }
    },
  ],
} satisfies MorphParser

const SyntaxHighlighting = {
  name: "SyntaxHighlighting",
  htmlPlugins: () => [
    [
      rehypePrettyCode,
      {
        theme: {
          light: "rose-pine-dawn",
          dark: "rose-pine",
        } as Record<"light" | "dark", Theme>,
        keepBackground: false,
      },
    ],
    () => (tree: HtmlRoot) => {
      const isCodeblockTranspiled = ({ children, tagName }: Element) => {
        if (children === undefined || children === null) return false
        const maybeCodes = children.filter((c) => (c as Element).tagName === "code")
        return tagName === "pre" && maybeCodes.length != 0 && maybeCodes.length === 1
      }
      visit(tree, "element", (node) => {
        if (!isCodeblockTranspiled(node as Element)) return false
        node.children = [
          h("span.clipboard-button", { type: "button", ariaLabel: "copy source" }, [
            s("svg", { ...SvgOptions, viewbox: "0 -8 24 24", class: "copy-icon" }, [
              s("use", { href: "#github-copy" }),
            ]),
            s("svg", { ...SvgOptions, viewbox: "0 -8 24 24", class: "check-icon" }, [
              s("use", { href: "#github-check" }),
            ]),
          ]),
          ...node.children,
        ]
        return SKIP
      })
    },
  ],
} satisfies MorphParser

const urlRegex = new RegExp(
  /(https?:\/\/)?(?<domain>([\da-z\.-]+)\.([a-z\.]{2,6})(:\d+)?)(?<path>[\/\w\.-]*)(\?[\/\w\.=&;-]*)?/,
  "g",
)
const Gfm = {
  name: "GithubFlavouredMarkdown",
  markdownPlugins: () => [remarkGfm, smartypants],
  htmlPlugins: () => [
    rehypeRaw,
    rehypeSlug,
    rehypeGithubEmoji,
    () => (tree: HtmlRoot) => {
      const modifyHeader = (node: Element) => {
        if (headingRank(node) !== undefined) {
          if (node.properties.id === "footnote-label") {
            node.children = [{ type: "text", value: "Remarque" }]
            node.properties.className = ""
          }
          node.children = [h("span.highlight-span", node.children)]
        }
      }
      visit(tree, (node) => modifyHeader(node as Element))
    },
    () => (tree: HtmlRoot) => {
      const toAddBlock = ({ type, tagName, properties }: Element) =>
        type === "element" && ["pre", "code"].includes(tagName) && Boolean(properties)
      visit(tree, "element", (node: Element) => {
        if (toAddBlock(node)) {
          const className = Array.isArray(node.properties.className)
            ? node.properties.className
            : (node.properties.className = [])
          className.push("notranslate")
        }
      })
    },
    // Special parsing for https://github.com bare URL from autolink literals of gfm
    // to only parse user/project
    () => (tree: HtmlRoot) => {
      visit(tree, { tagName: "a" }, (node: Element) => {
        const githubMatch = ((node.properties.href! as string) ?? "").match(
          /^https:\/\/github\.com\/([^\/]+)\/([^\/\s#]+)/,
        )
        if (githubMatch && mdastToString(node) === node.properties.href!) {
          visit(node, { type: "text" }, function (node) {
            // @ts-expect-error wrong type hint upstream
            node.value = `${githubMatch[1]}/${githubMatch[2]}`
          })
        }
      })
      return
    },
    // automatically add dir https://github.com/rehypejs/rehype-github/blob/main/packages/dir/lib/index.js
    // It is simple enough and I don't want to add a whole deps for it.
    () => {
      const include = new Set(["div", "h1", "h2", "h3", "h4", "h5", "h6", "ol", "p", "ul"])

      const checkAddDir = ({ type, tagName, properties }: Element) => {
        if (type !== "element" || !include.has(tagName) || !properties) return false
        // Do not add them to `:is(ol, ul).contains-task-list`.
        if (
          Array.isArray(properties.className) &&
          properties.className.includes("contains-task-list")
        ) {
          return false
        }
        return true
      }
      return (tree: HtmlRoot) => {
        const addDir = (node: Element) => {
          if (checkAddDir(node)) node.properties.dir = "auto"
        }
        visit(tree, (node) => addDir(node as Element))
      }
    },
  ],
} satisfies MorphParser

const Description = {
  name: "Description",
  htmlPlugins: () => [
    () => (tree: HtmlRoot, file) => {
      const frontMatterDescription = file.data.frontmatter?.description?.replace(
        urlRegex,
        "$<domain>" + "$<path>",
      )
      const text = escapeHTML(hastToString(tree)).replace(urlRegex, "$<domain>" + "$<path>")

      const processDescription = (desc: string, includeTripleDots: boolean): string => {
        const sentences = desc.replace(/\s+/g, " ").split(/\.\s/)
        const finalDesc: string[] = []
        const len = 150
        let sentenceIdx = 0
        let currentDescriptionLength = 0

        if (sentences[0] !== undefined && sentences[0].length >= len) {
          const firstSentence = sentences[0].split(" ")
          while (currentDescriptionLength < len) {
            const sentence = firstSentence[sentenceIdx]
            if (!sentence) break
            finalDesc.push(sentence)
            currentDescriptionLength += sentence.length
            sentenceIdx++
          }
          if (includeTripleDots) finalDesc.push("...")
        } else {
          while (currentDescriptionLength < len) {
            const sentence = sentences[sentenceIdx]
            if (!sentence) break
            const currentSentence = sentence.endsWith(".") ? sentence : sentence + "."
            finalDesc.push(currentSentence)
            currentDescriptionLength += currentSentence.length
            sentenceIdx++
          }
        }
        return finalDesc.join(" ")
      }

      const description = processDescription(frontMatterDescription ?? text, true)
      file.data.description = unescapeHTML(
        frontMatterDescription || description.trim() || "Aucune description fournie",
      )
      file.data.text = text
      file.data.description = description
      file.data.abstract = file.data.frontmatter?.abstract ?? processDescription(text, false)
      file.data.readingTime = readingTime(file.data.text!)
    },
  ],
} satisfies MorphParser

const Latex = {
  name: "Latex",
  markdownPlugins: () => [remarkMath],
  htmlPlugins: () => [
    [
      rehypeKatex,
      {
        output: "htmlAndMathml",
        macros: {
          "\\argmin": "\\mathop{\\operatorname{arg\\,min}}\\limits",
          "\\argmax": "\\mathop{\\operatorname{arg\\,max}}\\limits",
          "\\upgamma": "\\mathit{\\gamma}",
          "\\upphi": "\\mathit{\\phi}",
          "\\upbeta": "\\mathit{\\beta}",
          "\\upalpha": "\\mathit{\\alpha}",
          "\\uptheta": "\\mathit{\\theta}",
        },
        strict: false,
      },
    ],
  ],
} satisfies MorphParser

const Pseudocode = {
  name: "Pseudocode",
  markdownPlugins: () => [
    () => (tree: MdRoot) => {
      visit(tree, "code", (node) => {
        const { lang, meta, value } = node
        if (["pseudo", "pseudocode"].includes(lang!)) {
          const { enableLineNumber: lineNumber } = parsePseudoMeta(meta!, rendererOptions)

          // PERF: we are currently doing one round trip from text -> html -> hast
          // pseudocode (katex backend) --|renderToString|--> html string --|fromHtml|--> hast
          // ideally, we should cut this down to render directly to hast
          const [inlineMacros, algo] = extractInlineMacros(value ?? "")
          // TODO: Might be able to optimize.
          // find all $ enclosements in source, and add the preamble.
          const mathRegex = /\$(.*?)\$/g
          const algoWithPreamble = algo.replace(mathRegex, (_, p1) => {
            return `$${inlineMacros}${p1}$`
          })

          const rendered = fromHtmlIsomorphic(
            renderPseudoToString(algoWithPreamble!, { ...rendererOptions, lineNumber }),
            { fragment: true },
          ).children[0] as Element

          rendered.children = [
            h(
              "span",
              {
                type: "button",
                class: "clipboard-button ps-clipboard",
                ariaLabel: "Copy pseudocode to clipboard",
              },
              [
                s("svg", { width: 16, height: 16, viewbox: "0 0 16 16", class: "copy-icon" }, [
                  s("use", { href: "#github-copy" }),
                ]),
                s("svg", { width: 16, height: 16, viewbox: "0 0 16 16", class: "check-icon" }, [
                  s("use", {
                    href: "#github-check",
                    fillRule: "evenodd",
                    fill: "rgb(63, 185, 80)",
                  }),
                ]),
              ],
            ),
            h("span", { class: "ps-mathml" }, [
              h("math", { xmlns: "http://www.w3.org/1998/Math/MathML" }, [
                h("semantics", [
                  h("annotation", { encoding: "application/x-tex" }, [
                    { type: "text", value: JSON.stringify(algoWithPreamble) },
                  ]),
                ]),
              ]),
            ]),
            ...rendered.children,
          ]
          rendered.properties["data-inline-macros"] = inlineMacros ?? ""

          node.type = "html" as "code"
          node.value = hastToHtml(rendered, { allowDangerousHtml: true })
        }
      })
    },
  ],
} satisfies MorphParser

const Markup = {
  name: "Markup",
  markdownPlugins: () => [
    () => (tree: MdRoot, file) => {
      const lang = file.data.frontmatter?.lang ?? "en"

      const createBaseElement = ({ lang, value }: Code): Element => ({
        type: "element",
        tagName: "p",
        properties: { "data-codeblock": lang },
        children: [{ type: "text", value }],
      })

      const transformPoetry = (target: Element, lang: string) => {
        target.tagName = "pre"
        target.properties.className = ["poetry"]
        target.properties["data-language"] = lang
        return hastToHtml(target, { allowDangerousHtml: true })
      }

      const transformQuotes = (target: Element) => {
        const hast = (
          mdastToHast(fromMarkdown((target.children[0] as Text).value.replace(/--/g, "—")), {
            allowDangerousHtml: true,
          }) as HtmlRoot
        ).children[0] as Element
        target = {
          ...target,
          ...hast,
          properties: { className: ["quotes"] },
        }
        return hastToHtml(target, { allowDangerousHtml: true })
      }

      const transformSMS = (target: Element) => {
        target.properties.className = ["text"]
        return hastToHtml(target, { allowDangerousHtml: true })
      }

      const transformations: Record<"poetry" | "quotes" | "sms", (node: Code) => string> = {
        poetry: (node: Code) => transformPoetry(createBaseElement(node), lang),
        quotes: (node: Code) => transformQuotes(createBaseElement(node)),
        sms: (node: Code) => transformSMS(createBaseElement(node)),
      }

      visit(tree, "code", (node) => {
        const transform = transformations[node.lang as keyof typeof transformations]
        if (transform) {
          node.type = "html" as "code"
          node.value = transform(node)
        }
      })
    },
  ],
} satisfies MorphParser

const URL_PATTERN = /https?:\/\/[^\s<>)"]+/g

interface LinkType {
  type: string
  pattern: (url: string) => boolean | string | null
  label: string
}

const LINK_TYPES: LinkType[] = [
  {
    type: "arxiv",
    pattern: extractArxivId,
    label: "[arXiv]",
  },
  {
    type: "lesswrong",
    pattern: (url: string) => url.toLowerCase().includes("lesswrong.com"),
    label: "[lesswrong]",
  },
  {
    type: "github",
    pattern: (url: string) => url.toLowerCase().includes("github.com"),
    label: "[GitHub]",
  },
  {
    type: "transformer",
    pattern: (url: string) => url.toLowerCase().includes("transformer-circuits.pub"),
    label: "[transformer circuit]",
  },
  {
    type: "alignment",
    pattern: (url: string) => url.toLowerCase().includes("alignmentforum.org"),
    label: "[alignment forum]",
  },
]

function createTextNode(value: string): Text {
  return { type: "text", value }
}

function getLinkType(url: string): LinkType | undefined {
  return LINK_TYPES.find((type) => type.pattern(url))
}

function createLinkElement(href: string): Element {
  const linkType = getLinkType(href)
  const displayText = linkType ? linkType.label : href

  return h(
    "a.csl-external-link",
    { href, target: "_blank", rel: "noopener noreferrer" },
    createTextNode(displayText),
  )
}

function processTextNode(node: Text): (Element | Text)[] {
  const text = node.value
  const matches = Array.from(text.matchAll(URL_PATTERN))

  if (matches.length === 0) {
    return [node]
  }

  const result: (Element | Text)[] = []
  let lastIndex = 0

  matches.forEach((match) => {
    const href = match[0]
    const startIndex = match.index!

    // Add text before URL if exists
    if (startIndex > lastIndex) {
      result.push(createTextNode(text.slice(lastIndex, startIndex)))
    }

    // Add arXiv prefix if applicable
    const arxivId = extractArxivId(href)
    if (arxivId) {
      result.push(createTextNode(`arXiv preprint arXiv:${arxivId} `))
    }

    // Add link element
    result.push(createLinkElement(href))
    lastIndex = startIndex + href.length
  })

  // Add remaining text after last URL if exists
  if (lastIndex < text.length) {
    result.push(createTextNode(text.slice(lastIndex)))
  }

  return result
}

// Function to process a list of nodes
function processNodes(nodes: (Element | Text)[]): (Element | Text)[] {
  return nodes.flatMap((node) => {
    if (node.type === "text") {
      return processTextNode(node)
    }
    if (node.type === "element") {
      return {
        ...node,
        children: processNodes(node.children as (Element | Text)[]),
      }
    }
    return [node]
  })
}

export const checkBib = ({ tagName, properties }: Element) =>
  tagName === "a" &&
  Boolean(properties.href) &&
  typeof properties.href === "string" &&
  properties.href.startsWith("#bib")

export const checkBibSection = ({ type, tagName, properties }: Element) =>
  type === "element" && tagName === "section" && properties.dataReferences == ""

/**
 * Regex adapted from https://github.com/Zettlr/Zettlr/blob/develop/source/common/util/extract-citations.ts
 *
 * Citation detection: The first alternative matches "full" citations surrounded
 * by square brackets, whereas the second one matches in-text citations,
 * optionally with suffixes.
 *
 * * Group 1 matches regular "full" citations
 * * Group 2 matches in-text citations (not surrounded by brackets)
 * * Group 3 matches optional square-brackets suffixes to group 2 matches
 *
 * For more information, see https://pandoc.org/MANUAL.html#extension-citations
 */
export const citationRE: RegExp =
  /(?:\[([^[\]]*@[^[\]]+)\])|(?<=\s|^|(-))(?:@([\p{L}\d_][^\s]*[\p{L}\d_]|\{.+\})(?:\s+\[(.*?)\])?)/u
const permittedTags = ["div", "p", "span", "li", "td", "th"]
const idRoot = "CITATION"

const Citations = {
  name: "Citations",
  htmlPlugins: (_, vaultId) => {
    return [
      () => async (tree) => {
        //The following is vendorred from rehype-citation, given that we don't access to 'path' within the browser
        const opts = {
          suppressBibliography: false,
          linkCitations: true,
          csl: "apa",
          lang: "en-US",
        }

        // --- Updated Logic ---
        // Fetch reference file entries directly from Dexie 'referenceFiles' table
        let referenceFileEntries: { handle: FileSystemFileHandle }[] = [] // Initialize empty array
        try {
          referenceFileEntries = await dbHandle.referenceFiles
            .where("vaultId")
            .equals(vaultId)
            .toArray()
        } catch (error) {
          console.error(`Error fetching reference files for vault ${vaultId} from Dexie:`, error)
          // Handle error appropriately, maybe return or show a message
          return // Exit processing if we can't get reference files
        }

        // Skip citation processing if no reference files are found for this vault
        if (referenceFileEntries.length === 0) {
          console.debug(
            `No reference file handles found in Dexie for vault ${vaultId}. Skipping citation processing.`,
          )
          return
        }

        // Get valid handles directly from the fetched entries
        const validHandles = referenceFileEntries.map((entry) => entry.handle)

        // --- End of Updated Logic ---

        // --- Remaining citation processing logic (mostly unchanged) ---
        const config = (Cite.plugins as { config: any }).config.get("@csl")

        const bibliography: string[] = await Promise.all(
          validHandles.map(async (handle) => {
            // Use the handles fetched from Dexie
            try {
              const file = await handle.getFile()
              return await file.text()
            } catch (error) {
              console.error("Error reading citation file:", error)
              return "" // Return empty string if file can't be read
            }
          }),
        )

        // Filter out empty strings
        const validBibliography = bibliography.filter((text) => text.trim() !== "")
        if (validBibliography.length === 0) {
          console.debug(
            "Bibliography files are empty or could not be read. Skipping citation processing.",
          )
          return
        }

        const citations = new Cite(validBibliography, { generateGraph: false })
        const citationIds = citations.data.map((x) => x.id)
        const citationPre: [string, number][] = []
        const citationDict: Record<string, string> = {}
        let citationId = 1
        const citeproc = config.engine(citations.data, opts.csl, opts.lang, "html")

        const mode = citeproc.opt.xclass
        const citationFormat = getCitationFormat(citeproc)

        visit(tree, "text", (node, idx, parent) => {
          const match = node.value.match(citationRE)
          if (!match || ("tagName" in parent && !permittedTags.includes(parent.tagName))) return
          let citeStartIdx = match.index
          const citeEndIdx = match.index + match[0].length
          // If we have an in-text citation and we should suppress the author, the
          // match.index does NOT include the positive lookbehind, so we have to manually
          // shift "from" to one before.
          if (match[2] !== undefined) {
            citeStartIdx--
          }
          const newChildren = []
          // if preceding string
          if (citeStartIdx !== 0) {
            // create a new child node
            newChildren.push({
              type: "text",
              value: node.value.slice(0, citeStartIdx),
            })
          }
          const [entries, isComposite] = parseCitation(match)
          // If id is not in citation file (e.g. route alias or js package), abort process
          for (const citeItem of entries) {
            if (!citationIds.includes(citeItem.id)) return
          }
          const [citedText, citedTextNode] = genCitation(
            citeproc,
            mode,
            entries,
            idRoot,
            citationId,
            citationPre,
            opts,
            isComposite,
            citationFormat,
          )
          citationDict[citationId] = citedText
          // Prepare citationPre and citationId for the next cite instance
          citationPre.push([`${idRoot}-${citationId}`, 0])
          citationId = citationId + 1
          newChildren.push(citedTextNode)
          // if trailing string
          if (citeEndIdx < node.value.length) {
            newChildren.push({
              type: "text",
              value: node.value.slice(citeEndIdx),
            })
          }
          // insert into the parent
          parent.children = [
            ...parent.children.slice(0, idx),
            ...newChildren,
            ...parent.children.slice(idx! + 1),
          ]
        })
        // NOTE: Remove noCite features
        if (citeproc.registry.mylist.length >= 1 && !opts.suppressBibliography) {
          const biblioNode: Element = genBiblioNode(citeproc)
          let bilioInserted = false
          const biblioMap: Record<string, Element> = {}
          biblioNode.children
            .filter((node) =>
              ((node as Element).properties?.className as string[])?.includes("csl-entry"),
            )
            .forEach((node) => {
              const citekey = ((node as Element).properties.id as string)!
                .split("-")
                .slice(1)
                .join("-")
              biblioMap[citekey] = { ...node } as Element
              biblioMap[citekey].properties = { id: "inlinebib-" + citekey }
            })
          // Insert it at ^ref, if not found insert it as the last element of the tree
          visit(tree, "element", (node, idx, parent) => {
            // TODO: Add inline bibliography
            // Add bibliography
            if (
              !opts.suppressBibliography &&
              (node.tagName === "p" || node.tagName === "div") &&
              node.children.length >= 1 &&
              node.children[0].type === "text" &&
              node.children[0].value === "[^ref]" &&
              idx
            ) {
              parent.children[idx] = biblioNode
              bilioInserted = true
            }
          })
          if (!opts.suppressBibliography && !bilioInserted) {
            tree.children.push(biblioNode)
          }
        }
        let footnoteSection
        visit(tree, "element", (node, index, parent) => {
          if (node.tagName === "section" && node.properties.dataFootnotes) {
            footnoteSection = node
            parent.children.splice(index, 1)
          }
        })
        // Need to adjust footnote numbering based on existing ones already assigned
        // And insert them into the footnote section (if exists)
        // Footnote comes after bibliography
        if (mode === "note" && Object.keys(citationDict).length > 0) {
          const fnArray: { type: "citation" | "existing"; oldId: string }[] = []
          let index = 1
          visit(tree, "element", (node) => {
            if (node.tagName === "sup" && node.children[0].type === "element") {
              const nextNode = node.children[0]
              if (nextNode.tagName === "a") {
                const { href, id } = nextNode.properties
                if (href.includes("fn") && id.includes("fnref")) {
                  const oldId = href.split("-").pop()
                  fnArray.push({
                    type: href.includes("cite") ? "citation" : "existing",
                    oldId,
                  })
                  // Update ref number
                  nextNode.properties.href = `#user-content-fn-${index}`
                  nextNode.properties.id = `user-content-fnref-${index}`
                  nextNode.children[0].value = index.toString()
                  index += 1
                }
              }
            }
          })
          // @ts-expect-error some type mismatch, it is ok
          const newFootnoteSection = genFootnoteSection(citationDict, fnArray, footnoteSection)
          tree.children.push(newFootnoteSection)
        } else {
          if (footnoteSection) tree.children.push(footnoteSection)
        }
      },
      // using https://github.com/syntax-tree/unist-util-visit as they're just anochor links
      () => (tree) => {
        visit(tree, (node) => {
          if (checkBib(node as Element)) {
            node.properties["data-bib"] = true
          }
        })
      },
      // Format external links correctly
      () => (tree) => {
        const checkReferences = ({ properties }: Element): boolean => {
          const className = properties?.className
          return Array.isArray(className) && className.includes("references")
        }
        const checkEntries = ({ properties }: Element): boolean => {
          const className = properties?.className
          return Array.isArray(className) && className.includes("csl-entry")
        }

        visit(
          tree,
          (node) => checkReferences(node as Element),
          (node, index, parent) => {
            const entries: Element[] = []
            visit(
              node,
              (node) => checkEntries(node as Element),
              (node) => {
                const { properties, children } = node as Element
                entries.push(h("li", properties, processNodes(children as Element[])))
              },
            )

            parent!.children.splice(
              index!,
              1,
              h(
                "section.bibliography",
                { dataReferences: true },
                h("h2#reference-label", [{ type: "text", value: "Bibliographie" }]),
                h("ul", ...entries),
              ),
            )
          },
        )
      },
    ]
  },
} satisfies MorphParser

const Order = [
  Frontmatter,
  ModifiedTime,
  Markup,
  Pseudocode,
  SyntaxHighlighting,
  Citations,
  Gfm,
  Description,
  Latex,
]

export function markdownPlugins(settings: Settings, vaultId: string) {
  // @ts-expect-error type aren't smart enough
  return Order.flatMap((plugin) => plugin.markdownPlugins?.(settings, vaultId) ?? [])
}
export function htmlPlugins(settings: Settings, vaultId: string) {
  // @ts-expect-error type aren't smart enough
  return Order.flatMap((plugin) => plugin.htmlPlugins?.(settings, vaultId) ?? [])
}

export * from "@/components/parser/codemirror"
