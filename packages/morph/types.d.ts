// https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker
type StartIn =
  | FileSystemHandle
  | "desktop"
  | "documents"
  | "downloads"
  | "music"
  | "pictures"
  | "videos"
interface SaveFilePickerOptions {
  excludeAcceptAllOptions?: boolean
  id?: string
  startIn?: StartIn
  suggestedName?: string
  types?: Array<{
    description?: string
    accept?: Record<string, string[]>
  }>
}

// https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker
interface DirectoryPickerOptions {
  id?: string
  mode?: "read" | "readwrite"
  startIn?: StartIn
}

// NOTE: This are currently considered experimental API from Chrome
export declare global {
  // dom custom event
  interface CustomEventMap {
    "permission-change": CustomEvent<{ granted: boolean }>
    "mermaid-content": CustomEvent<boolean>
  }

  interface Window {
    mermaid: typeof import("mermaid").Mermaid
    showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>
    showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>

    addEventListener<K extends keyof CustomEventMap>(
      type: K,
      listener: (this: Document, ev: CustomEventMap[K]) => void,
    ): void
    removeEventListener<K extends keyof CustomEventMap>(
      type: K,
      listener: (this: Document, ev: CustomEventMap[K]) => void,
    ): void
    dispatchEvent<K extends keyof CustomEventMap>(ev: CustomEventMap[K] | UIEvent): void
  }

  interface FileSystemDirectoryHandle extends FileSystemHandle {
    id?: string
    getFile(): Promise<File>
    queryPermission(options: { mode: string }): Promise<Readonly<PermissionState>>
    requestPermission(options: { mode: string }): Promise<Readonly<PermissionState>>
    values(): AsyncIterableIterator<FileSystemHandle>
  }
};
