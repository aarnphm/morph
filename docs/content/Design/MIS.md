---
id: MIS
tags:
  - design
author: aarnphm,waleedmalik7,nebrask,lucas-lizhiwei
date: "2024-09-16"
modified: 2025-03-31 14:56:31 GMT-04:00
title: Module Interface Specification
---

## Symbols, Abbreviations and Acronyms

The following data dictionary from [[SRS/SRS]] will be used for the symbols:

![[SRS/SRS#7.2 Data Dictionary|data dictionary]]

## Introduction

The following document details the [[Design/MIS|Module Interface Specifications]] for `morph`, which aims to explore new interfaces and workflow for auto-regressive model to help writers craft better writing artifacts.

Complementary documents include the [[SRS/SRS|System Requirement Specifications]] and [[Design/MG|Module Guide]].

See also [[/index|full documentation]] and [github](https://github.com/aarnphm/morph)

## Notation

The structure of the MIS for modules comes from [@hoffman1995software], with the addition that template modules have been adapted from
[@ghezzi2003fundamentals]. The mathematical notation comes from Chapter 3 of
[@hoffman1995software]. For instance, the symbol := is used for a
multiple assignment statement and conditional rules follow the form $(c_1 \Rightarrow r_1 \mid c_2 \Rightarrow r_2 \mid \dots \mid c_n \Rightarrow r_n)$.

The following table summarizes the primitive data types used by `morph`.

| **Data Type**  | **Notation**              | **Description**                                                                               |
| -------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| character      | $\texttt{char[n]}$        | a single symbol or digit                                                                      |
| integer        | $\mathbb{Z}$              | a number without a fractional component in (-$\infty$, $\infty$)                              |
| natural number | $\mathbb{N}$              | a number without a fractional component in [1, $\infty$)                                      |
| real           | $\mathbb{R}$              | any number in (-$\infty$, $\infty$)                                                           |
| string         | $\textbf{string}$         | a sequence of characters representing textual data                                            |
| Tensor         | $\mathbb{R}^{d \times l}$ | a real matrix with shape $d \times l$, with $d, l \in \mathbb{R}$                             |
| JSON           | $\textbf{JSON}(a=1,b=2)$  | a structured data format consisting of key-value pairs and arrays (for example for $a=1,b=2$) |
| Function       | $f: Q \to F$              | a structure-preserving maps between two category $Q$ and $F$                                  |

The specification of `morph` uses some derived data types: sequences, strings, Tensor, JSON, and tuples.

- Sequences are lists filled with elements of the same data type.
- Strings are sequences of characters.
- Tuples contain a list of values, potentially of different types.
- In addition, `morph` uses functions, which are defined by the data types of their inputs and outputs.
- Local functions are described by giving their type signature followed by their specification.

## Module Decomposition

_excerpt from [[Design#MG|Module Guide]]_

![[Design/MG#Module Hierarchy]]

## MIS of Editor Module

The following encapsulate specification of `morph` (Editor Module)

### Module

Editor module

### Uses

- Rendering Module
- Markdown Parsing Library
- Data Fetching and State Management Module

### Syntax

#### Exported Constants

- `defaultEditorConfig: Object`
  - Default configuration for the editor module

#### Exported Access Programs

| **Name**         | **In**         | **Out** | **Exceptions** |
| ---------------- | -------------- | ------- | -------------- |
| renderMarkdown   | string content | HTML    | InvalidInput   |
| applyVimBindings | -              | boolean | BindingError   |

### Semantics

#### State Variables

- `editorContent: string`
  - Tracks the current content of the editor.
- `cursorPosition: Object`
  Tracks the current cursor position, including line and character offsets.
- `editorView: Object`
  Maintains the reference to the editor's current view, enabling extensions and configurations.

#### Environment Variables

- `window: DOMObject`
  - Captures user input, events, and resizing behavior for a responsive editing experience.

#### Assumptions

- User input is always valid and non-null when it is passed to the access programs.
- The editor maintains state consistency with user interactions such as typing, selecting, and scrolling.
- External modules for Markdown parsing, rendering, and extensions function correctly without failure.

#### Access Routine Semantics

`renderMarkdown(content: string): HTML`

- Transition: 
Binds a predefined set of Vim keybindings to the text editor environment.
Activates modes including normal, insert, and visual.
Integrates command mappings for motion, selection, and text manipulation.
- Output: 
Returns `true` if all bindings are successfully registered and active.
Returns `false` if the environment is incompatible or the editor is not mounted.
- Exception: Throws `BindingError` if:
Required Vim layer is not present in the runtime environment.
Conflicting shortcut keys are already bound.
Editor instance is not properly initialized.

`applyVimBindings(): boolean`

- Transition: Activates Vim-style keyboard bindings for advanced text navigation and editing.
- Output: Returns `true` if bindings are successfully applied, otherwise `false`.
- Exception: Throws `BindingError` if the bindings fail due to invalid configurations or system restrictions.

#### Local Functions

1. `initializeEditor(state: EditorState): EditorView`

   - Configures and initializes the editor view with a given state, including Markdown parsing and Vim extensions.

2. `applyNoteSuggestion(noteContent: string): void`

   - Integrates content from a note into the editor, either appending it or replacing selected text. Ensures that changes are reflected immediately in the editor's state.

3. `sanitizeInput(input: string): string`

   - Ensures that the provided input is free from invalid or harmful characters before being processed.

4. `logEvent(event: string): void`

   - Records interactions within the editor for debugging and analytics purposes.

5. `resetEditor(): void`

   - Clears the editor's content and resets its state to the default configuration.

6. `destroyEditor(): void`
   - Cleans up the editor instance when the component is unmounted, releasing associated resources.

## MIS of Notes Module

### Module

Notes Module

### Uses

- Data Fetching and State Management Module
- Rendering Module

### Syntax

#### Exported Constants

- `defaultEditorConfig: Object`
  Default styles for rendering notes

#### Exported Access Programs

| **Name**   | **In**              | **Out**    | **Exceptions** |
| ---------- | ------------------- | ---------- | -------------- |
| createNote | string content      | NoteObject | InvalidContent |
| deleteNote | int noteId          | boolean    | NoteNotFound   |
| fetchNotes | -                   | NoteArray  | APICallFailed  |
| onDrop     | NoteObject, boolean | boolean    | DropFailed     |

### Semantics

#### State Variables

- `NoteArray: NoteObject[]`
  - Tracks the current list of notes.
- `selectedNote: NoteObject`
  - Tracks the currently selected note.
- `droppedNotes: Note[][]`
  - Tracks notes that have been dropped into the editor.

#### Environment Variables

- `localStorage`: Used to cache notes for offline access.
- `editorRef`: Tracks the editor's reference for drag-and-drop operations.

#### Assumptions

- Note objects are properly structured and contain unique identifiers.
- The local storage system is operational for offline caching.
- External API endpoints for note synchronization are accessible.
- The `editorRef` object is valid and represents the editor's DOM container.

#### Access Routine Semantics

`createNote(content: string): NoteObject`

- Transition: Creates a new note with the provided content and adds it to the notes list.
- Output: Returns the newly created note object.
- Exception: Throws `InvalidContent` if the input is invalid or null.

`deleteNote(noteId: int): boolean`

- Transition: Removes the note with the specified ID from the notes list.
- Output: Returns `true` if the note is successfully deleted.
- Exception: Throws `NoteNotFound` if the note ID does not exist.

`fetchNotes(): NoteArray`

- Transition: Retrieves all stored notes, either from local storage or an API.
- Output: Returns an array of note objects.
- Exception: Throws `APICallFailed` if the external API cannot be reached.

`onDrop(note: NoteObject, droppedOverEditor: boolean): boolean`

- Transition: Removes a note from the list and adds it to the editor if `droppedOverEditor` is `true`.
- Output: Returns `true` if the note is successfully dropped, otherwise `false`.
- Exception: Throws `DropFailed` if the note cannot be dropped due to invalid input or boundary issues.

#### Local Functions

1. `validateNoteContent(content: string): boolean`
   - Checks whether the content meets length and format requirements.
2. `syncWithServer(): void`
   - Synchronizes local notes with the remote server.
3. `cacheNotesLocally(notes: NoteArray): void`
   - Stores the note array in local storage for offline use.
4. `handleDragBehavior(note: NoteObject): void`
   - Implements drag-and-drop functionality for notes.
5. `filterNotesByColumn(index: int): NoteArray`
   - Filters notes into left and right columns based on their index.

## MIS of Graph View Module

### Module

Graph View Module

### Uses

- Data Fetching and State Management Module
- Notes Module
- Rendering Module

### Syntax

#### Exported Constants

- `defaultGraphSettings: Object`
  - Default settings for graph rendering

#### Exported Access Programs

| **Name**    | **In**          | **Out** | **Exceptions** |
| ----------- | --------------- | ------- | -------------- |
| renderGraph | GraphDataObject | HTML    | InvalidGraph   |
| updateGraph | GraphUpdateData | boolean | GraphNotFound  |

### Semantics

#### State Variables

- `graphData: GraphDataObject`
  - Tracks the current graph structure.
- `graphSettings: Object`
  - Tracks the configuration of the graph.

#### Environment Variables

- `canvas: DOMObject`
  - Renders the graph visualization.

#### Assumptions

- Graph data is always structured as valid objects before rendering.
- The canvas element is available and properly initialized for graph visualization.
- User actions to update the graph do not conflict with ongoing render processes.

#### Access Routine Semantics

`renderGraph(data: GraphDataObject): HTML`

- Transition: Renders the graph using the given data.
- Output: Returns HTML for displaying the graph.
- Exception: Throws `InvalidGraph` if the input data is malformed.

`updateGraph(updateData: GraphUpdateData): boolean`

- Transition: Updates the graph with the provided data.
- Output: Returns `true` if the update is successful.
- Exception: Throws `GraphNotFound` if the graph does not exist.

#### Local Functions

1. `parseGraphData(rawData: string): GraphDataObject`
   - Converts raw data into a structured graph object.
2. `logGraphChanges(change: GraphUpdateData): void`
   - Records modifications to the graph for debugging.
3. `clearCanvas(): void`
   - Clears the graph visualization canvas.

## MIS of Settings Module

### Module

Settings Module

### Uses

- Rendering Module
- Data Fetching and State Management Module

### Syntax

#### Exported Constants

- `defaultSettings: Object`
  - Default settings for the application

#### Exported Access Programs

| **Name**       | **In**       | **Out** | **Exceptions** |
| -------------- | ------------ | ------- | -------------- |
| updateTheme    | string theme | boolean | InvalidTheme   |
| savePreference | Object prefs | boolean | SaveFailed     |

### Semantics

#### State Variables

- `userSettings: Object`
  - Tracks current user preferences.

#### Environment Variables

- `localStorage`
  - Persists user settings for future sessions.

#### Assumptions

- All settings are stored in a valid key-value format.
- Local storage is accessible for saving user preferences.
- User-provided settings, like themes, are compatible with the system.

#### Access Routine Semantics

`updateTheme(theme: string): boolean`

- Transition: Applies the specified theme to the editor.
- Output: Returns true if the theme is successfully applied.
- Exception: Throws `InvalidTheme` if the theme string is invalid.

`savePreference(pref: Object): boolean`

- Transition: Saves the provided preferences to local storage.
- Output: Returns true if the preferences are successfully saved.
- Exception: Throws `SaveFailed` if the preferences cannot be stored.

#### Local Functions

1. `validateTheme(theme: string): boolean`
   - Checks if the given theme is supported by the system.
2. `loadDefaultSettings(): Object`
   - Loads default settings into the editor.
3. `logSettingsChange(change: Object): void`
   - Records changes made to user settings for debugging purposes.

## MIS of Rendering Module

### Module

Rendering Module

### Uses

- Editor Module
- Notes Module
- Data Fetching and State Management Module

### Syntax

#### Exported Constants

- `defaultRenderingSettings: Object`
  - Default settings for rendering views, including Markdown plugins and decoration configurations.

#### Exported Access Programs

| **Name**        | **In**            | **Out** | **Exceptions** |
| --------------- | ----------------- | ------- | -------------- |
| renderView      | Object viewData   | HTML    | RenderError    |
| updateRendering | Object renderData | boolean | UpdateFailed   |

### Semantics

#### State Variables

- `currentView: Object`
  - Stores the currently rendered view.
- `decorations: DecorationSet`
  - Manages and applies visual decorations for the editor content.

#### Environment Variables

- `display: DOMObject`
  - Represents the rendering area provided by the `EditorView` DOM container.

#### Assumptions

- Input data for rendering (Markdown) is sanitized and valid.
- The `unified` processor, including its plugins (e.g., `remarkGfm`, `rehypeSlug`), functions correctly.
- The rendering environment (browser and DOM) is stable and functional.

#### Access Routine Semantics

`renderView(viewData: Object): HTML`

- Transition: Converts Markdown input into HTML using the `unified` processor and plugins.
- Output: Returns HTML content for display.
- Exception: Throws `RenderError` if Markdown processing fails.

`updateRendering(renderData: Object): boolean`

- Transition: Applies dynamic updates to the view, such as adding or modifying decorations based on editor changes.
- Output: Returns `true` if updates are successfully applied.
- Exception: Throws `UpdateFailed` if the update process encounters errors or invalid inputs.

#### Local Functions

1. `validateViewData(viewData: Object): boolean`

   - Ensures that the input data for rendering is properly structured and compatible with the renderer.

2. `clearRenderArea(): void`

   - Removes all existing decorations and resets the rendering area to its initial state.

3. `logRenderingErrors(error: string): void`

   - Records errors encountered during the rendering process for debugging and analytics.

4. `processMarkdown(markdown: string): Promise<string>`

   - Converts Markdown input into HTML using the `unified` processor, applying caching for efficiency.

5. `computeDecorations(view: EditorView): void`
   - Updates the decoration set based on the document's current content, applying processed Markdown as inline decorations.

## MIS of Data Fetching and State Management Module

### Module

Data Fetching and State Management Module

### Uses

- Notes Module
- Graph View Module
- Rendering Module

### Syntax

#### Exported Constants

- `defaultFetchConfig: Object`
  - Default configuration for data fetching

#### Exported Access Programs

| **Name**    | **In**          | **Out**            | **Exceptions**    |
| ----------- | --------------- | ------------------ | ----------------- |
| fetchData   | string endpoint | Object fetchedData | FetchError        |
| updateState | Object newState | boolean            | StateUpdateFailed |

### Semantics

#### State Variables

- `currentState: Object`
  - Tracks the current application state.

#### Environment Variables

- `networkInterface: Object`
  - Represents the system's network connection.

#### Assumptions

- Network connectivity is available for fetching data.
- State updates do not conflict with ongoing processes.

#### Access Routine Semantics

`fetchData(endpoint: string): Object`

- Transition: Retrieves data from the specified endpoint.
- Output: Returns the fetched data as an object.
- Exception: Throws `FetchError` if the network request fails.

`updateState(newState: Object): boolean`

- Transition: Updates the application state with the provided data.
- Output: Returns `true` if the update is successful.
- Exception: Throws `StateUpdateFailed` if the state update process fails.

#### Local Functions

1. `validateEndpoint(endpoint: string): boolean`

   - Checks whether the given endpoint is valid and reachable.

2. `mergeStates(oldState: Object, newState: Object): Object`

   - Combines the old state with the new state data.

3. `logFetchErrors(error: string): void`
   - Logs errors that occur during the data fetching process.

## MIS of Inference Module

### Module

`inference`

### Uses

- Data Fetching and State Management [[Design/MIS#MIS of Data Fetching and State Management Module|Module]]
- Rendering [[Design/MIS#MIS of Rendering Module|Module]]

### Syntax

#### Exported Constants

None

#### Exported Access Programs

| **Name**      | **In**                                                                                           | **Out**                                                                                                                                   | **Exceptions**                |
| ------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `interp`      | `markdownInput` ($\textbf{String}$)                                                              | $\textbf{JSON}(\{note_i \| note_i = id ∧ 1 ≤ i ≤ n\}, \text{suggestions}=\{idea_i \| idea_i = id ∧ 1 ≤ i ≤ n\}, \text{graph}=G)$ | InferenceError                |
| `infer_style` | $\textbf{JSON}(\text{text}=\text{String}, \text{style}=[\{author_i \| author_i = id ∧ 1 ≤ i ≤ n\}])$ | $\textbf{JSON}(\text{variations}=[\{text_i \| text_i = id ∧ 1 ≤ i ≤ n\}])$                                                                    | StyleNotFound, InferenceError |

### Semantics

#### State Variables

- `currentInferenceTasks`: $\textbf{JSON}(\text{tasks}= \{task_i | task_i = id ∧ 1 ≤ i ≤ n\})$ where $\text{task}_i = \{\text{id}, \text{model}, \text{status}, \text{progress}\}$
  - Tracks active inference tasks
- `modelStates`: $\textbf{JSON}(\text{models}=[\{\text{name}: \text{String}, \text{SAE}: \mathbb{R}\}])$
  - Tracks loaded models and their Self-Attention Entropy scores
- `generationStates`: $\textbf{JSON}(\text{intermediates}=\{gen_i | gen_i = id ∧ 1 ≤ i ≤ n\})$ where $\text{gen}_i = \{\text{text}, \text{score}, \text{timestamp}\}$
  - Stores intermediate generations for each task

#### Environment Variables

- `CUDA_VISIBLE_DEVICES`
  - Tracks current available GPUs devices for inference

#### Assumptions

- Input data is preprocessed and ready for inference
- GPU resources meet minimum requirements:
  - Available CUDA-capable GPUs with at least 16GB VRAM per device
  - Support for concurrent batch processing of multiple inference tasks
  - Hardware supports mixed-precision (FP16/BF16) inference
- System can maintain continuous batching pipeline for efficient inference
- Memory management system can handle dynamic allocation/deallocation during batch processing
- Sufficient system memory for input/output tensor operations

#### Access Routine Semantics

`interp(markdownInput: String): JSON`

- Transition: Analyzes markdown input to extract key concepts, generate suggestions, and build relationship graphs
- Output: Returns JSON containing:
  - `notes`: Array of extracted note objects from the markdown
  - `suggestions`: Array of generated writing suggestions and ideas
  - `graph`: A graph structure representing connections between notes
- Exception: Throws `InferenceError` if the analysis or generation fails

`infer_style(text: String, style: Array[String]): JSON`

- Transition: Transforms input text into variations matching specified author styles
- Output: Returns JSON containing:
  - `variations`: Array of transformed text versions, one per requested style
- Exception:
  - Throws `StyleNotFound` if a requested author style is not available
  - Throws `InferenceError` if the style transformation fails

#### Local Functions

1. `moveToDevice(data: Tensor, device: string): Tensor`

   - Transfers input tensors from CPU to specified GPU device with proper memory pinning and CUDA streams

2. `allocateResources(modelConfig: Object): Object`

   - Manages GPU memory allocation for model weights and compute buffers
   - Returns allocation map with device IDs and memory segments
   - Handles multi-GPU distribution if needed

3. `loadModel(modelPath: string, device: string): Model`

   - Loads model weights and configuration to specified GPU device
   - Optimizes model for inference (FP16/BF16 quantization)
   - Returns loaded model handle

4. `traceGPUMetrics(taskId: string): Object`

   - Monitors GPU utilization, memory usage, power draw
   - Tracks CUDA events for kernel timing
   - Returns performance metrics for the task

5. `manageRequestQueue(requests: Array): void`

   - Maintains priority queue of inference requests
   - Handles batching and scheduling across available GPUs
   - Implements backpressure when queue is full

6. `cleanupResources(taskId: string): void`
   - Releases GPU memory allocations
   - Clears CUDA cache and synchronizes streams
   - Updates resource availability tracking

## MIS of User Configuration Module

### Module

User Configuration Module

### Uses

- Rendering Module
- Data Fetching and State Management Module

### Syntax

#### Exported Constants

- `defaultUserConfig: Object`
  ```json
  {
    "generation": {
      "temperature": 0.7,
      "top_p": 0.9,
      "max_tokens": 1000
    },
    "style": {
      "tonality": "neutral",
      "formality": 0.5,
      "creativity": 0.7
    },
    "sae": {
      "auto_tune": true,
      "min_threshold": 0.1,
      "max_threshold": 0.9
    }
  }
  ```

### Semantics

#### State Variables

- `userConfigurations: Object`
  - Tracks current user configurations
- `generationParams: Object`
  - Part of user configuration involving temperature, top_p, and token settings
- `styleConfig: Object`
  - Part of user configuration involving tonality, formality, and creativity parameters
- `saeSettings: Object`
  - Part of user configuration involving Self-Attention Entropy tuning configurations
- `configHistory: Array`
  - Maintains history of configuration changes
- `stylePresets: Object`
  - Predefined style combinations

#### Environment Variables

- `localStorage`
  - Stores user preferences
- `modelConfig`
  - Current model configuration state
- `inferenceMetrics`
  - Real-time inference performance metrics

#### Assumptions

- User-provided configurations are valid and within acceptable ranges
- The local storage system is accessible
- Model supports dynamic parameter adjustment during runtime
- SAE measurements are available for auto-tuning
- Style parameters can be effectively translated to model behavior

#### Access Routine Semantics

`saveUserConfig(userSettings: Object): boolean`

- Transition: Validates and saves comprehensive user configurations including generation, style, and SAE parameters
- Output: Returns `true` if settings are saved successfully
- Exception: Throws `SaveFailed` if validation or storage fails

`getUserConfig(): Object`

- Transition: Retrieves stored user configurations with default fallbacks
- Output: Returns complete configuration object with all parameters
- Exception: Throws `ConfigNotFound` if no valid settings exist

`updateStyleConfig(styleParams: Object): boolean`

- Transition: Updates style-specific parameters (tonality, formality, creativity)
- Output: Returns `true` if style update is successful
- Exception: Throws `InvalidStyleParams` if parameters are out of valid ranges

`tuneGeneration(generationParams: Object): Object`

- Transition: Adjusts generation parameters (temperature, top_p) with validation
- Output: Returns updated generation configuration with applied constraints
- Exception: Throws `InvalidGenerationParams` if parameters are invalid

`adjustSAE(saeParams: Object): Object`

- Transition: Configures Self-Attention Entropy parameters and auto-tuning
- Output: Returns metrics showing SAE adjustment results
- Exception: Throws `SAEAdjustmentFailed` if tuning cannot be applied

#### Local Functions

1. `validateConfigRanges(config: Object): boolean`

   - Ensures all parameters are within valid ranges
   - Checks compatibility between different configuration sections
   - Returns validation status with detailed error messages

2. `calculateOptimalSAE(metrics: Object): Object`

   - Analyzes inference metrics to determine optimal SAE settings
   - Adjusts thresholds based on model performance
   - Returns recommended SAE parameters

3. `applyStylePreset(style: string): Object`

   - Loads predefined style configurations
   - Combines with user customizations
   - Returns merged style parameters

4. `validateTonality(params: Object): boolean`

   - Checks tonality parameters against defined scales
   - Ensures consistency with model capabilities
   - Returns validation status

5. `trackConfigPerformance(config: Object): void`

   - Monitors generation quality metrics
   - Records configuration effectiveness
   - Updates optimization suggestions

6. `synchronizeConfigs(): void`
   - Ensures consistency across different configuration aspects
   - Resolves conflicts between parameters
   - Updates dependent settings automatically

## MIS of Analytics Module

### Module

Analytics Module

### Uses

- Data Fetching and State Management Module
- Rendering Module

### Syntax

#### Exported Constants

- `defaultAnalyticsConfig: Object`
  - Default configuration for analytics tasks

#### Exported Access Programs

| **Name**          | **In**                  | **Out**        | **Exceptions**          |
| ----------------- | ----------------------- | -------------- | ----------------------- |
| saveUserConfig    | Object userSettings     | boolean        | SaveFailed              |
| getUserConfig     | -                       | Object         | ConfigNotFound          |
| updateStyleConfig | Object styleParams      | boolean        | InvalidStyleParams      |
| tuneGeneration    | Object generationParams | Object         | InvalidGenerationParams |
| adjustSAE         | Object saeParams        | Object metrics | SAEAdjustmentFailed     |

### Semantics

#### State Variables

- `userConfigurations: Object`
  - Tracks current user configurations
- `generationParams: Object`
  - Part of user configuration involving temperature, top_p, and token settings
- `styleConfig: Object`
  - Part of user configuration involving tonality, formality, and creativity parameters
- `saeSettings: Object`
  - Part of user configuration involving Self-Attention Entropy tuning configurations
- `configHistory: Array`
  - Maintains history of configuration changes
- `stylePresets: Object`
  - Predefined style combinations

#### Environment Variables

- `localStorage`
  - Stores user preferences
- `modelConfig`
  - Current model configuration state
- `inferenceMetrics`
  - Real-time inference performance metrics

#### Assumptions

- User-provided configurations are valid and within acceptable ranges
- The local storage system is accessible
- Model supports dynamic parameter adjustment during runtime
- SAE measurements are available for auto-tuning
- Style parameters can be effectively translated to model behavior

#### Access Routine Semantics

`saveUserConfig(userSettings: Object): boolean`

- Transition: Validates and saves comprehensive user configurations including generation, style, and SAE parameters
- Output: Returns `true` if settings are saved successfully
- Exception: Throws `SaveFailed` if validation or storage fails

`getUserConfig(): Object`

- Transition: Retrieves stored user configurations with default fallbacks
- Output: Returns complete configuration object with all parameters
- Exception: Throws `ConfigNotFound` if no valid settings exist

`updateStyleConfig(styleParams: Object): boolean`

- Transition: Updates style-specific parameters (tonality, formality, creativity)
- Output: Returns `true` if style update is successful
- Exception: Throws `InvalidStyleParams` if parameters are out of valid ranges

`tuneGeneration(generationParams: Object): Object`

- Transition: Adjusts generation parameters (temperature, top_p) with validation
- Output: Returns updated generation configuration with applied constraints
- Exception: Throws `InvalidGenerationParams` if parameters are invalid

`adjustSAE(saeParams: Object): Object`

- Transition: Configures Self-Attention Entropy parameters and auto-tuning
- Output: Returns metrics showing SAE adjustment results
- Exception: Throws `SAEAdjustmentFailed` if tuning cannot be applied

#### Local Functions

1. `validateConfigRanges(config: Object): boolean`

   - Ensures all parameters are within valid ranges
   - Checks compatibility between different configuration sections
   - Returns validation status with detailed error messages

2. `calculateOptimalSAE(metrics: Object): Object`

   - Analyzes inference metrics to determine optimal SAE settings
   - Adjusts thresholds based on model performance
   - Returns recommended SAE parameters

3. `applyStylePreset(style: string): Object`

   - Loads predefined style configurations
   - Combines with user customizations
   - Returns merged style parameters

4. `validateTonality(params: Object): boolean`

   - Checks tonality parameters against defined scales
   - Ensures consistency with model capabilities
   - Returns validation status

5. `trackConfigPerformance(config: Object): void`

   - Monitors generation quality metrics
   - Records configuration effectiveness
   - Updates optimization suggestions

6. `synchronizeConfigs(): void`
   - Ensures consistency across different configuration aspects
   - Resolves conflicts between parameters
   - Updates dependent settings automatically

## MIS of Export Module

### Module

Export and Intergration Module

### Uses

- Rendering Module
- Data Fetching and State Management Module

### Syntax

#### Exported Constants

- `defaultExportConfig: Object`
  - Default configuration for exporting tasks

#### Exported Access Programs

| **Name**              | **In**              | **Out** | **Exceptions**    |
| --------------------- | ------------------- | ------- | ----------------- |
| exportData            | Object exportConfig | boolean | ExportError       |
| integrateWithPlatform | string platform     | boolean | IntegrationFailed |

### Semantics

#### State Variables

- `exportHistory: Array`
  - Tracks all data export logs.

#### Environment Variables

- `externalPlatforms`
  - Tracks available platforms for integration.

#### Assumptions

- Export configurations are valid and compatible with the target format.
- External platforms are accessible for integration.

#### Access Routine Semantics

`exportData(exportConfig: Object): boolean`

- Transition: Exports data based on the provided configurations.
- Output: Returns `true` if the export is successful.
- Exception: Throws `ExportError` if the export process fails.

`integrateWithPlatform(platform: string): boolean`

- Transition: Integrates the system with the specified external platform.
- Output: Returns `true` if integration is successful.
- Exception: Throws `IntegrationFailed` if the process fails.

#### Local Functions

1. `validateExportConfig(config: Object): boolean`

   - Ensures the export configurations are valid and complete.

2. `logExportHistory(config: Object): void`

   - Records export activities for debugging or auditing purposes.

3. `checkPlatformAvailability(platform: string): boolean`
   - Verifies if the specified platform is accessible for integration.

---

## Appendix

[^ref]

### Revision

| **Date**      | **Version** | **Notes**                         |
| ------------- | ----------- | --------------------------------- |
| Sept. 16 2024 | 0.0         | Initial skafolding                |
| Jan. 12 2025  | 0.1         | Initial Rev                       |
| March 31 2025 | 0.2         | Rename to `morph` for consistency |
| April 04 2025 | 1.0         | Rev 1                             |

### Reflection

<!-- The information in this section will be used to evaluate the team members on the -->
<!-- graduate attribute of Problem Analysis and Design. -->
<!---->
<!-- 1. What went well while writing this deliverable? -->
<!-- 2. What pain points did you experience during this deliverable, and how did you resolve them? -->
<!-- 3. Which of your design decisions stemmed from speaking to your client(s) or a proxy (e.g. your peers, stakeholders, potential users)? For those that were not, why, and where did they come from? -->
<!-- 4. While creating the design doc, what parts of your other documents (e.g. requirements, hazard analysis, etc), it any, needed to be changed, and why? -->
<!-- 5. What are the limitations of your solution? Put another way, given unlimited resources, what could you do to make the project better? (LO_ProbSolutions) -->
<!-- 6. Give a brief overview of other design solutions you considered. What are the benefits and tradeoffs of those other designs compared with the chosen design? From all the potential options, why did you select the documented design? (LO_Explores) -->

<br />

<div class="reflection-container">

<div class="users">
  <a class="name" href="https://github.com/aarnphm">Aaron</a>
</div>

<div class="blob">

1. Working on the inference specifications helped clarify the technical architecture needed for model deployment and steering. The process of breaking down complex ML components into discrete modules made the implementation path clearer.

2. Initially struggled to define clear boundaries between model inference and feature steering components. Resolved this through discussions with Goodfire researchers who shared practical insights about SAE deployment patterns and performance considerations.

3. The design for `infer_style` and model interpretability features came directly from conversations with ML engineers working on similar systems. The auto-interp approach was validated through discussions about real-world usage patterns and deployment considerations. Other design decisions emerged from system requirements and prior work in the field.

4. The design process confirmed that our initial architecture aligned well with both the functional requirements and hazard analysis. No significant changes were needed.

5. Key limitations:

   - GPU memory constraints limit model size and batch processing
   - Network latency affects time-to-first-token
   - Infrastructure costs scale with usage

   With unlimited resources, we could:

   - Deploy larger models (Llama 3.3 70B)
   - Trained more SAEs (currently using a general SAEs from Goodfire)
   - Implement full distributed inference
   - Support multilingual generation
   - Build custom training infrastructure

6. Alternative designs considered:
   - Pure client-side inference: Better privacy but limited by device capabilities
   - Serverless architecture: Lower maintenance but higher latency
   - Microservices: More flexible but increased complexity.

</div>

</div>

<br/>

<div class="reflection-container">

<div class="users">
  <a class="name" href="https://github.com/nebrask">Nebras</a>
</div>

<div class="blob">

1. I contributed to the MIS focusing more on the frontend modules, including such as the Editor and Rendering modules. This allowed me to clearly define how these components interact and function within the system. The MIS helped break down complex functionalities into smaller, well-structured modules, making the development process more efficient. Additionally, teamwork played a crucial role in ensuring the deliverable’s success. Each member brought valuable insights and perspectives, which helped refine the design and ensure consistency across all modules. The collaborative effort improved both the quality and clarity of the document.

2. A significant challenge was interpreting and refining the vague details in the SRS to define precise module interfaces. This required extensive research into tools, libraries, and best practices, which was both time-consuming and detail-oriented. However, our team collaborated effectively, dividing tasks and sharing findings to lighten the workload. Regular discussions and feedback loops helped us iteratively refine the document and address ambiguities, ensuring alignment with the overall project goals.

3. Many decisions such as prioritizing local data storage for privacy and implementing context-sensitive suggestions were influenced by stakeholder feedback. These decisions aligned with user priorities like ensuring accessibility and data security. Other decisions, such as integrating Vim-style navigation for power users emerged from internal team discussions and reflected our understanding of technical feasibility and user preferences. This combination of external and internal input resulted in a balanced and user-centric design.

4. Developing the MIS revealed areas in the SRS that needed refinement such as adjusting functional requirements to be more realistic and removing overly ambitious features. For example, anticipated changes like adding graph-based visualizations and interactive notes required updates to the SRS to clarify their scope and dependencies. Additionally, hazard analysis needed revisions to address risks tied to module integration and external library dependencies. These adjustments ensured consistency and alignment across all documentation.

5. Our solution is limited by time and budget, which restricting us from implementing advanced features such as real-time collaboration, cloud integration, and multi-device support. With unlimited resources we could enhance the editor with the best performing GPUs for faster text suggestions and add rich customization options like advanced themes and hotkeys. These improvements would provide a more seamless and feature-rich experience for users but our current constraints focus us on delivering a functional, privacy-focused web application.

6. We evaluated a centralized approach with cloud-based storage for user data, which could have supported features like real-time multi-user collaboration. Ultimately, we opted for a decentralized model to prioritize user privacy and minimize dependency on external infrastructure. Similarly, while pre-built editors provided a quicker implementation path, we chose a customized editor using a pre-built framework to integrate features like interactive notes and Markdown previews tailored to our goals. This approach strikes a balance between fulfilling user needs, maintaining privacy, and managing resource constraints effectively.

</div>

</div>

<br/>

<div class="reflection-container">

<div class="users">
  <a class="name" href="https://github.com/waleedmalik7">Waleed</a>
</div>

<div class="blob">

1. In this deliverable, I mainly contributed to the module guide. As someone who has not coded much for this project, I believe it will greatly help my implementation process. I now clearly understand which modules and features to implement, their dependencies, and the required libraries. The module guide has made the system's overall structure more manageable and understandable.

2. A major pain point was obtaining a precise understanding of our implementation details. We started with a fairly abstract SRS that did not specify the tools and libraries we would use. Researching APIs, tools, and libraries was tedious and time-consuming but necessary to define our modules accurately. Collaborating with peers and dividing research tasks helped mitigate the workload and ensured we chose appropriate tools for the project.

3. Most of the design decisions were inspired by stakeholder input, particularly features like context-sensitive suggestions, graph-based document visualization, and a decentralized approach to storing data locally. These decisions aim to prioritize user privacy and accessibility. Some technical decisions, such as the choice of Llama 3 as the language model and the use of local storage instead of a database, were made internally based on factors like cost, efficiency, and feasibility. These technical choices balance the project’s limited resources with achieving the desired functionality.

4. The SRS’s functional requirements needed significant updates. As we refined our design, we added new ideas and removed some overstated features. For instance, anticipated changes like AC5 (adding UI interactive features like collapsible sections and sticky notes) and AC4 (showing progress metrics as graphs) required us to adjust our requirements to reflect these design-specific changes. Additionally, some unlikely changes, like keeping everything locally stored and maintaining a web-only platform, reinforced the importance of not overcomplicating our backend infrastructure.

5. Our solution is limited by time and budget, but with unlimited resources, we could implement a range of advanced features. For example, consistently utilizing state-of-the-art GPUs would enable faster inference and more responsive text suggestions, significantly reducing latency. Adding more customization options, such as hotkeys, advanced themes, and specialized accessibility features, would enhance the editor's usability and user-friendliness. With sufficient resources, we could integrate with tools like Notion, Obsidian, Google Suite (Docs, Sheets), Evernote, and professional email clients (e.g., Gmail or Outlook), allowing writers to seamlessly incorporate research, drafts, and correspondence into their workflow. Furthermore, we could expand the project to include downloadable desktop and mobile applications after the web launch, catering to both iOS and Android users. These enhancements would establish our application as a cutting-edge, user-centric text editor, but the current limitations of a $700 budget and tight deadlines make such developments challenging.

6. We considered a centralized approach with a cloud-based database to handle user data, but this conflicted with our goal of user privacy. The decentralized model, where everything is stored locally, aligns better with our principles but sacrifices some features like real-time multi-user collaboration. We also debated between using a pre-built editor versus creating a custom one. While pre-built editors would have saved time, a custom solution lets us tailor the experience to our goals, like interactive notes and graph visualizations. Ultimately, our chosen design balances user needs, privacy, and technical feasibility.

</div>

</div>

<br/>

 <div class="reflection-container">

<div class="users">
  <a class="name" href="https://github.com/lucas-lizhiwei">Lucas</a>
</div>

<div class="blob">

1. While writing the MIS, the modular structure of the system provided a clear roadmap for defining each component's responsibilities and interfaces. Breaking down complex functionalities into smaller, manageable modules helped simplify the process. Additionally, frequent team discussions ensured everyone was aligned on the deliverable's scope and avoided duplications or gaps in the document. Having a robust SRS as a foundation made it easier to map requirements to the corresponding modules and focus on addressing user needs effectively.

2. A significant challenge was ensuring consistency between the MIS and other documents like the Module Guide and SRS. Discrepancies in terminology and feature descriptions required constant cross-referencing, which was time-consuming. To address this, we introduced a shared glossary and templates for module descriptions to ensure consistency across the team. Another issue was balancing technical details with clarity for non-technical readers, which we resolved by iterating on the document with peer reviews and feedback.

3. Decisions like implementing markdown support and offering export options in various formats (PDF, Markdown, and plain text) were based on direct feedback from potential users who prioritized versatility and compatibility with existing workflows. On the other hand, technical decisions like leveraging sparse autoencoders for feature steering were internally driven. These decisions were informed by research into state-of-the-art AI techniques, balancing feasibility with innovative features that could set the project apart.

4. We updated the SRS to refine the scope of some features, such as defining limits for planning steps and excluding real-time collaboration for the initial release. The hazard analysis also required revisions to address new risks discovered during design, such as the potential for integration issues with external APIs or libraries. These updates ensured the design doc remained realistic and aligned with the project's technical and time constraints while mitigating overlooked risks.

5. The solution is limited by the decision to focus on local storage for user privacy, which sacrifices features like cloud backups or real-time collaboration. Additionally, the reliance on browser-based functionality limits performance compared to native desktop applications. With unlimited resources, we could implement a hybrid solution, combining local storage with optional cloud-based features for users who prioritize flexibility over privacy. We could also add advanced AI features like tone analysis and real-time grammar checks to improve the user experience.

6. We considered using a third-party text editor framework, such as Quill or ProseMirror, to accelerate development. While these frameworks provided robust functionality out of the box, they lacked flexibility for features like graph-based visualizations and interactive notes, leading us to build a custom editor. We also evaluated using an OpenAI-compatible API for inference tasks but opted for locally trained sparse autoencoders to reduce dependency on external services. This choice ensured greater control over the system while maintaining privacy, albeit with slightly higher development complexity.

</div>

</div>
