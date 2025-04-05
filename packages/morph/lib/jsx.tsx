import type { Node, Root } from "hast"
import { Components, toJsxRuntime } from "hast-util-to-jsx-runtime"
import { urlAttributes } from "html-url-attributes"
import { HTMLAttributes, ReactNode } from "react"
import { Fragment, jsx, jsxs } from "react/jsx-runtime"
import { type BuildVisitor, visit } from "unist-util-visit"

interface TableWrapperProps extends HTMLAttributes<HTMLTableElement> {
  children?: ReactNode
}

const components: Partial<Components> = {
  table({ children }: TableWrapperProps) {
    return (
      <div className="table-container">
        <table>{children}</table>
      </div>
    )
  },
}

const safeProtocol = /^(https?|ircs?|mailto|xmpp)$/i
export function defaultUrlTransform(value: string): string {
  // Same as:
  // <https://github.com/micromark/micromark/blob/929275e/packages/micromark-util-sanitize-uri/dev/index.js#L34>
  // But without the `encode` part.
  const colon = value.indexOf(":")
  const questionMark = value.indexOf("?")
  const numberSign = value.indexOf("#")
  const slash = value.indexOf("/")

  if (
    // If there is no protocol, it’s relative.
    colon === -1 ||
    // If the first colon is after a `?`, `#`, or `/`, it’s not a protocol.
    (slash !== -1 && colon > slash) ||
    (questionMark !== -1 && colon > questionMark) ||
    (numberSign !== -1 && colon > numberSign) ||
    // It is a protocol, it should be allowed.
    safeProtocol.test(value.slice(0, colon))
  ) {
    return value
  }

  return ""
}

export function toJsx(node: Node) {
  visit(node as Root, transform)

  return toJsxRuntime(node as Root, {
    Fragment,
    jsx,
    jsxs,
    components,
    ignoreInvalidStyle: true,
    passKeys: true,
    passNode: true,
  })
}

const transform: BuildVisitor<Root> = (node, index, parent) => {
  if (node.type === "raw" && parent && typeof index === "number") {
    parent.children[index] = { type: "text", value: node.value }

    return index
  }

  if (node.type === "element") {
    let key

    for (key in urlAttributes) {
      if (Object.hasOwn(urlAttributes, key) && Object.hasOwn(node.properties, key)) {
        const value = node.properties[key]
        const test = urlAttributes[key]
        if (test === null || test.includes(node.tagName)) {
          node.properties[key] = defaultUrlTransform(String(value || ""))
        }
      }
    }
  }
}
