export interface Note {
  id: string
  content: string
  color: string
  fileId: string
  isInEditor: boolean
  editorPosition?: {
    order: number
  }
  createdAt: Date
  reasoningId?: string
  dropped?: boolean
}

export interface EditorNoteState {
  isHovering: boolean
  isCommandPressed: boolean
}

// Generate a random pastel color using Tailwind's color scheme
export function generatePastelColor() {
  const pastelColors = [
    "bg-red-100", // Light pastel red
    "bg-orange-100", // Light pastel orange
    "bg-amber-100", // Light pastel amber
    "bg-yellow-100", // Light pastel yellow
    "bg-lime-100", // Light pastel lime
    "bg-green-100", // Light pastel green
    "bg-emerald-100", // Light pastel emerald
    "bg-teal-100", // Light pastel teal
    "bg-cyan-100", // Light pastel cyan
    "bg-sky-100", // Light pastel sky
    "bg-blue-100", // Light pastel blue
    "bg-indigo-100", // Light pastel indigo
    "bg-violet-100", // Light pastel violet
    "bg-purple-100", // Light pastel purple
    "bg-fuchsia-100", // Light pastel fuchsia
    "bg-pink-100", // Light pastel pink
    "bg-rose-100", // Light pastel rose
  ]
  return pastelColors[Math.floor(Math.random() * pastelColors.length)]
}

export const NOTES_DND_TYPE = "note"
