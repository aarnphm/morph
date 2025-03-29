"use client"

import { useState, useEffect } from "react"
import { Cross2Icon, PlusIcon } from "@radix-ui/react-icons"
import { DEFAULT_AUTHORS } from "@/components/steering/constants"
import { cn } from "@/lib"

interface AuthorsSelectorProps {
  value: string[]
  onChange: (authors: string[]) => void
  className?: string
}

export default function AuthorsSelector({ value, onChange, className }: AuthorsSelectorProps) {
  const [authors, setAuthors] = useState<string[]>(value || DEFAULT_AUTHORS)
  const [newAuthor, setNewAuthor] = useState<string>("")
  const [isAdding, setIsAdding] = useState(false)

  useEffect(() => {
    onChange(authors)
  }, [authors, onChange])

  const handleAddAuthor = () => {
    if (!newAuthor.trim()) return

    const updatedAuthors = [...authors, newAuthor.trim()]
    setAuthors(updatedAuthors)
    setNewAuthor("")
    setIsAdding(false)
  }

  const handleRemoveAuthor = (index: number) => {
    const updatedAuthors = [...authors]
    updatedAuthors.splice(index, 1)
    setAuthors(updatedAuthors)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAddAuthor()
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">Authors</label>
        <button
          type="button"
          onClick={() => setIsAdding(!isAdding)}
          className="text-xs text-muted-foreground hover:text-primary"
        >
          <PlusIcon className="h-3 w-3" />
        </button>
      </div>

      {isAdding && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newAuthor}
            onChange={(e) => setNewAuthor(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Add author"
            className="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            autoFocus
          />
          <button
            type="button"
            onClick={handleAddAuthor}
            className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
          >
            Add
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {authors.map((author, index) => (
          <div
            key={index}
            className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs"
          >
            <span>{author}</span>
            <button
              type="button"
              onClick={() => handleRemoveAuthor(index)}
              className="text-muted-foreground hover:text-primary"
            >
              <Cross2Icon className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

