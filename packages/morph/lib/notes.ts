import type { Note } from "@/db/interfaces"

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

export const groupNotesByDate = (notesList: Note[]) => {
  const groups: { [key: string]: Note[] } = {}

  notesList.forEach((note) => {
    const date = new Date(note.createdAt)
    // Format with hours, minutes, and 15-second intervals
    const seconds = date.getSeconds()
    const interval = Math.floor(seconds / 15) * 15
    const dateKey = `${date.toDateString()}-${date.getHours()}-${date.getMinutes()}-${interval}`

    if (!groups[dateKey]) {
      groups[dateKey] = []
    }

    groups[dateKey].push(note)
  })

  return Object.entries(groups).sort((a, b) => {
    // Sort from newest to oldest
    const dateA = new Date(a[0].split("-")[0])
    const hourA = parseInt(a[0].split("-")[1])
    const minuteA = parseInt(a[0].split("-")[2])
    const secondsA = parseInt(a[0].split("-")[3] || "0")
    const dateB = new Date(b[0].split("-")[0])
    const hourB = parseInt(b[0].split("-")[1])
    const minuteB = parseInt(b[0].split("-")[2])
    const secondsB = parseInt(b[0].split("-")[3] || "0")

    if (dateA.getTime() === dateB.getTime()) {
      if (hourA === hourB) {
        if (minuteA === minuteB) {
          return secondsB - secondsA // If same minute, sort by seconds interval
        }
        return minuteB - minuteA // If same hour, sort by minute
      }
      return hourB - hourA // If same day, sort by hour
    }
    return dateB.getTime() - dateA.getTime() // Otherwise sort by date
  })
}
