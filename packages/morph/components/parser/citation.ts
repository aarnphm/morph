// reference: https://github.com/timlrx/rehype-citation
// MIT License
import { type Element } from "hast"
import { fromHtmlIsomorphic } from "hast-util-from-html-isomorphic"
import type { CitationFormat, CiteItem, Mode } from "rehype-citation/node/src/types.js"

export const getCitationFormat = (citeproc: any): CitationFormat => {
  const info = citeproc.cslXml.dataObj.children[0]
  const node = info.children.find((x: any) => x["attrs"] && x["attrs"]["citation-format"])
  // citation-format takes 5 possible values
  // https://docs.citationstyles.org/en/stable/specification.html#toc-entry-14
  const citationFormat: "author-date" | "author" | "numeric" | "note" | "label" =
    node["attrs"]["citation-format"]
  return citationFormat
}

export const getSortedRelevantRegistryItems = (
  citeproc: any,
  relevantIds: string[],
  sorted: boolean,
) => {
  const res = []
  if (sorted) {
    // If sorted follow registry order
    for (const item of citeproc.registry.reflist) {
      if (relevantIds.includes(item.id)) res.push(item)
    }
  } else {
    // Otherwise follow the relevantIds
    for (const id of relevantIds) {
      res.push(citeproc.registry.reflist.find((x: any) => x.id === id))
    }
  }
  return res
}

/**
 * Split a string into two parts based on a given index position
 */
const split = (str: string, index: number): string[] => {
  return [str.slice(0, index), str.slice(index)]
}

/**
 * Check if two registry objects belong to the same author
 * Currently only checks on family name
 */
const isSameAuthor = (i1: any, i2: any) => {
  const authorList = i1.ref.author
  const authorList2 = i2.ref.author
  if (authorList.length !== authorList2.length) return false
  for (let i = 0; i < authorList.length; i++) {
    if (authorList[i].family !== authorList2[i].family) return false
  }
  return true
}

const htmlToHast = (html: string): Element =>
  fromHtmlIsomorphic(html, { fragment: true }).children[0] as Element

export const genCitation = (
  citeproc: any,
  mode: Mode,
  entries: CiteItem[],
  citationIdRoot: string,
  citationId: number,
  citationPre: any[],
  options: any,
  isComposite: boolean,
  citationFormat: CitationFormat,
) => {
  const { inlineClass, linkCitations } = options
  const key = `${citationIdRoot}-${citationId}`
  const c = citeproc.processCitationCluster(
    {
      citationID: key,
      citationItems: entries,
      properties:
        mode === "in-text"
          ? { noteIndex: 0, mode: isComposite ? "composite" : "" }
          : { noteIndex: citationId, mode: isComposite ? "composite" : "" },
    },
    citationPre.length > 0 ? citationPre : [],
    [],
  )
  // c = [ { bibchange: true, citation_errors: [] }, [ [ 0, '(1)', 'CITATION-1' ] ]]
  const citationText = c[1].find((x: any) => x[2] === key)[1]
  const ids = `citation--${entries.map((x) => x.id!.toLowerCase()).join("--")}--${citationId}`
  if (mode === "note") {
    // Use cite-fn-{id} to denote footnote from citation, will clean it up later to follow gfm "user-content" format
    return [
      citationText,
      htmlToHast(
        `<cite class="${(inlineClass ?? []).join(" ")}" id=${ids}><sup><a href="#cite-fn-${citationId}" id="cite-fnref-${citationId}" data-footnote-ref aria-describedby="footnote-label">${citationId}</a></sup></cite>`,
      ),
    ]
  } else if (linkCitations && citationFormat === "numeric") {
    // e.g. [1, 2]
    let i = 0
    const refIds = entries.map((e) => e.id).filter((el) => el !== undefined)
    const output = citationText.replace(/\d+/g, function (d: string) {
      const url = `<a href="#bib-${refIds[i].toLowerCase()}">${d}</a>`
      i++
      return url
    })
    return [
      citationText,
      htmlToHast(`<cite class="${(inlineClass ?? []).join(" ")}" id=${ids}>${output}</cite>`),
    ]
  } else if (linkCitations && citationFormat === "author-date") {
    // E.g. (see Nash, 1950, pp. 12–13, 1951); (Nash, 1950; Xie, 2016)
    if (entries.length === 1) {
      // Do not link bracket
      const output = isComposite
        ? `<a href="#bib-${entries[0].id!.toLowerCase()}">${citationText}</a>`
        : `${citationText.slice(0, 1)}<a href="#bib-${entries[0].id!.toLowerCase()}">${citationText.slice(1, -1)}</a>${citationText.slice(-1)}`
      return [
        citationText,
        htmlToHast(`<cite class="${(inlineClass ?? []).join(" ")}" id=${ids}>${output}</cite>`),
      ]
    } else {
      // Retrieve the items in the correct order and attach link each of them
      const refIds = entries.map((e) => e.id).filter((el) => el !== undefined)
      const results = getSortedRelevantRegistryItems(citeproc, refIds, citeproc.opt.sort_citations)
      const output = []
      let str = citationText
      for (const [i, item] of results.entries()) {
        // Need to compare author. If same just match on date.
        const id = item.id
        let citeMatch = item.ambig
        // If author is the same as the previous, some styles like apa collapse the author
        if (i > 0 && isSameAuthor(results[i - 1], item) && str.indexOf(citeMatch) === -1) {
          // Just match on year
          citeMatch = item.ref.issued.year.toString()
        }
        const startPos = str.indexOf(citeMatch)
        const [start, rest] = split(str, startPos)
        output.push(start) // Irrelevant parts
        const url = `<a href="#bib-${id.toLowerCase()}">${rest.substring(0, citeMatch.length)}</a>`
        output.push(url)
        str = rest.substring(citeMatch.length)
      }
      output.push(str)
      return [
        citationText,
        htmlToHast(
          `<cite class="${(inlineClass ?? []).join(" ")}" id=${ids}>${output.join("")}</cite>`,
        ),
      ]
    }
  } else {
    return [
      citationText,
      htmlToHast(`<cite class="${(inlineClass ?? []).join(" ")}" id=${ids}>${citationText}</cite>`),
    ]
  }
}
