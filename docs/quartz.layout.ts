import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [
    Component.ImagePopup(),
    Component.Comments({
      provider: "giscus",
      options: {
        repo: "aarnphm/morph",
        repoId: "R_kgDOMuBvlg",
        category: "General",
        categoryId: "DIC_kwDOMuBvls4Cihq0",
        reactionsEnabled: false,
      },
    }),
    Component.MinimalFooter({
      links: {
        github: "https://github.com/aarnphm/morph",
        twitter: "https://twitter.com/aarnphm_",
      },
      showInfo: true,
    }),
  ],
  footer: Component.Spacer(),
}

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.Breadcrumbs({ rootName: "~", style: "unique", spacerSymbol: "/" }),
    Component.ArticleTitle(),
    Component.ContentMeta(),
    Component.Author(),
    Component.TagList(),
  ],
  left: [
    Component.PageTitle(),
    Component.Search(),
    Component.DesktopOnly(Component.TableOfContents()),
    Component.DesktopOnly(Component.Explorer()),
  ],
  right: [Component.Graph(), Component.Backlinks()],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [
    Component.Breadcrumbs({ rootName: "~", style: "full", spacerSymbol: "/" }),
    Component.ArticleTitle(),
    Component.ContentMeta(),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Search(),
    Component.DesktopOnly(Component.Explorer()),
  ],
  right: [],
}
