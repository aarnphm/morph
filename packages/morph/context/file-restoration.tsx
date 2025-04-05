import { createContext, useContext, useState } from "react"

interface RestoredFileData {
  file: File
  fileHandle: FileSystemFileHandle
  fileId: string
  content: string
  handleId: string
}

interface FileRestorationContextType {
  restoredFile: RestoredFileData | null
  setRestoredFile: (file: RestoredFileData | null) => void
  isRestorationAttempted: boolean
  setIsRestorationAttempted: (value: boolean) => void
}

const FileRestorationContext = createContext<FileRestorationContextType | null>(null)

export function FileRestorationProvider({ children }: { children: React.ReactNode }) {
  const [restoredFile, setRestoredFile] = useState<RestoredFileData | null>(null)
  const [isRestorationAttempted, setIsRestorationAttempted] = useState(false)

  return (
    <FileRestorationContext.Provider
      value={{
        restoredFile,
        setRestoredFile,
        isRestorationAttempted,
        setIsRestorationAttempted,
      }}
    >
      {children}
    </FileRestorationContext.Provider>
  )
}

export function useRestoredFile() {
  const context = useContext(FileRestorationContext)
  if (context === null) {
    throw new Error("useRestoredFile must be used within a FileRestorationProvider")
  }
  return context
}
