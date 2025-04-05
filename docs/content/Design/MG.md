---
id: MG
tags:
  - design
author: aarnphm,waleedmalik7,nebrask,lucas-lizhiwei
date: "2024-09-16"
modified: 2025-04-05 00:36:06 GMT-04:00
title: Module Guide
---

## Reference Material

This section records information for easy reference.

### Abbreviations and Acronyms

| **symbol** | **description**                                        |
| ---------- | ------------------------------------------------------ |
| AC         | Anticipated Change                                     |
| DOM        | Document Object Model                                  |
| FR         | Functional Requirement                                 |
| GPU        | Graphics Processing Unit                               |
| M          | Module                                                 |
| MG         | Module Guide                                           |
| OS         | Operating System                                       |
| PDF        | Portable Document Format                               |
| R          | Requirement                                            |
| SRS        | Software Requirements Specification                    |
| morph      | the text editor that helps you to become better writer |
| UC         | Unlikely Change                                        |

![[SRS/SRS#7.2 Data Dictionary|Data Dictionary]]

## Purpose

The following encapsulates both system and document purposes for [[/index|morph]]

### System Purpose

The system is a web-based text editor designed to inspire creativity and make the writing process smoother and more enjoyable. It helps users explore their ideas in a non-linear way, offering interactive suggestions powered by advanced machine learning.
With features like text steering, feedback, and note-style suggestions, the system gives writers the flexibility to refine their tone and structure while keeping full control over their work. Everything is stored locally on the user's computer, so there's no need for logins or worrying about data privacy.
Whether you are working on creative writing or structured documents, the system provides tools to plan, brainstorm, and fine-tune ideas. It's accessible through any modern web browser, ensuring a seamless experience without the hassle of installation or compatibility issues.

### Document Purpose

The purpose of this document is to illustrate and justify the decomposition of the morph system into its core components and provide a Modular Guide for each module.
This document will serve as a guide for the implementation of the system, ensuring all components are designed to achieve the system's goals effectively and maintain scalability, modularity, and user-friendliness.
This document will also serve as a basis for the implementation work scheduled to be completed in the coming months.

## Introduction

Decomposing a system into modules is a commonly accepted approach to developing software. A module is a work assignment for a programmer or programming team [@10.1145/361598.361623]. We advocate a decomposition based on the principle of information hiding [@10.1145/361598.361623]. This principle supports design for change, because the "secrets" that each module hides represent likely future changes. Design for change is valuable in SC,... where modifications are frequent, especially during initial development as the solution space is explored.

Our design follows the rules layed out by [@10.5555/800054.801999], as follows:

- System details that are likely to change independently should be the secrets of separate modules.
- Each data structure is implemented in only one module.
- Any other program that requires information stored in a module's data structures must obtain it by calling access programs belonging to that module.

After completing the first stage of the design, the Software Requirements Specification ([[SRS/SRS|SRS]]), the Module Guide (MG) is developed [@10.5555/800054.801999]. The MG specifies the modular structure of the system and is intended to allow both designers and maintainers to easily identify the parts of the software. The potential readers of this document are as follows:

- New project members: This document can be a guide for a new project member to easily understand the overall structure and quickly find the relevant modules they are searching for.
- Maintainers: The hierarchical structure of the module guide improves the maintainers' understanding when they need to make changes to the system. It is important for a maintainer to update the relevant sections of the document after changes have been made.
- Designers: Once the module guide has been written, it can be used to check for consistency, feasibility, and flexibility. Designers can verify the system in various ways, such as consistency among modules, feasibility of the decomposition, and flexibility of the design.

The rest of the document is organized as follows. Section [[Design/MG#Anticipated and Unlikely Changes|3]] lists the anticipated and unlikely changes of the software requirements. Section [[Design/MG#Module Decomposition|4]] summarizes the module decomposition that was constructed according to the likely changes. Section [[Design/MG#Connection Between Requirements and Design|5]] specifies the connections between the software requirements and the modules. Section [[Design/MG#Module Decomposition|6]] gives a detailed description of the modules. Section [[Design/MG#Traceability Matrix|7]] includes two traceability matrices. One checks the completeness of the design against the requirements provided in the SRS. The other shows the relation between anticipated changes and the modules. Section [[Design/MG#Use Hierarchy Between Modules|8]] describes the use relation between modules.

## Anticipated and Unlikely Changes

This section lists possible changes to the system. According to the likeliness of the change, the possible changes are classified into two categories. Anticipated changes are listed in Section 2.1, and unlikely changes are listed in Section 2.2.

### Anticipated Changes

Anticipated changes are the source of the information that is to be hidden inside the modules. Ideally, changing one of the anticipated changes will only require changing the one module that hides the associated decision. The approach adapted here is called design for change.

- **AC1**: Integrating with newer language models, such as Llama 3.
- **AC2**: Add support for specific GPU drivers to improve performance.
- **AC3**: Add more customization options like themes, font styles, or hotkeys.
- **AC4**: Show user progress metrics as graphs or charts.
- **AC5**: Add UI interactive features like collapsible sections, sticky notes, and inline comments.
- **AC6**: Add visual indicators for text quality metrics (e.g., grammar or tone).
- **AC7**: Enable exporting user data for backup purposes.
- **AC8**: Add tools to compare progress across multiple documents.
- **AC9**: Use A100 GPU for rendering visualizations and running text generation faster.
- **AC10**: May not integrate application with Notion and Obsidian.

### Unlikely Changes

The module design should be as general as possible. However, a general system is more complex. Sometimes this complexity is not necessary. Fixing some design decisions at the system architecture stage can simplify the software design. If these decision should later need to be changed, then many parts of the design will potentially need to be modified. Hence, it is not intended that these decisions will be changed.

- **UC1:**: Core editor interface will stay the same.
- **UC2**: Maintain real-time updates and context-sensitive suggestions as core features.
- **UC3**: No downloads or desktop-only application; the system must stay fully web-based.
- **UC4**: The internal event bus and state management system that supports interactive components (notes, suggestions, graph visualizations) is assumed to remain unchanged. Refactoring this mechanism would require re-architecting major parts of the front-end logic and module interfaces.

## Module Hierarchy

This section provides an overview of the module design. Modules are summarized in a hierarchy decomposed by secrets in Table 1. The modules listed below, which are leaves in the hierarchy tree, are the modules that will actually be implemented.

| **Level 1**                                                  | **Level 2**                               |
| ------------------------------------------------------------ | ----------------------------------------- |
| [[Design/MG#Hardware-Hiding Module(s)\|Hardware-Hiding]]     | GPU/Hardware Acceleration Module          |
| [[Design/MG#Behaviour-Hiding Module(s)\|Behaviour-Hiding]]   | Editor Module                             |
|                                                              | Notes Module                              |
|                                                              | Graph View Module                         |
|                                                              | Settings Module                           |
|                                                              | Rendering Module                          |
|                                                              | Data Fetching and State Management Module |
| [[Design/MG#Software Decision Module(s)\|Software Decision]] | Inference Module                          |
|                                                              | User Configuration Module                 |
|                                                              | Analytics Module                          |
|                                                              | Export and Integration Module             |

_Table 1: Module Hierarchy_

### Hardware-Hiding Module(s)

- **M1**:GPU/Hardware Acceleration Module

### Behaviour-Hiding Module(s)

- **M2**: Editor Module
- **M3**: Notes Module
- **M4**: Graph View Module
- **M5**: Settings Module
- **M6**: Rendering Module
- **M7**: Data Fetching and State Management Module

### Software Decision Module(s)

- **M8**: Inference Module
- **M9**: User Configuration Module
- **M10**: Analytics Module
- **M11**: Export and Integration Module

## Connection Between Requirements and Design

The design of the system is intended to satisfy the requirements developed in the SRS. In this stage, the system is decomposed into modules. The connection between requirements and modules is listed in Table 2.
This section documents the primary design decisions made to satisfy the requirements specified in the SRS. By explicitly recording these decisions, we ensure clear traceability between requirements and their implementation in the modular architecture.

### Text Editor Core (Requirements FR-1 to FR-4)

- Decision to implement a web-based editor using a modular architecture separating the UI components (Editor Module) from the underlying text processing logic
- Implementation of real-time planning suggestions through dedicated Notes Module and Graph View Module
- Storage of user preferences and configurations locally through the Settings Module
- Integration with SAEs for tone and style customization via the Inference Module

### Performance and Scalability (Requirements PR-SLR1, PR-SLR2)

- Integration of GPU acceleration for compute-intensive tasks like inference
- Implementation of KV cache optimization in the Inference Module for improved TTFT
- Design of asynchronous processing pipeline for suggestion generation
- Use of efficient data structures for managing document state and history

### Security and Privacy (Requirements SR-INT1 to SR-P1)

- Decision to keep all user data local, avoiding cloud storage
- Implementation of secure communication protocols for inference requests
- Design of permission system for accessing local files
- Integration of content filtering mechanisms in the Inference Module

### User Experience (Requirements UH-EOU1 to UH-A3)

- Implementation of keyboard navigation and accessibility features in the Editor Module
- Design of intuitive interface components for suggestion interaction
- Integration of theme customization through the Settings Module
- Development of responsive layout system for cross-device compatibility

## Module Decomposition

Modules are decomposed according to the principle of "information hiding" proposed by [@10.5555/800054.801999]. The _Secrets_ field in a module decomposition is a brief statement of the design decision hidden by the module. The _Services_ field specifies _what_ the module will do without documenting _how_ to do it. For each module, a suggestion for the implementing software is given under the _Implemented By_ title. If the entry is _OS_, this means that the module is provided by the operating system or by standard programming language libraries. [/index|morph] means the module will be implemented by the [/index|morph] software. Only the leaf modules in the hierarchy have to be implemented. If a dash (_--_) is shown, this means that the module is not a leaf and will not have to be implemented.

### Hardware-Hiding

#### GPU/Hardware Acceleration Module (M1)

- **Secrets:** Algorithms for utilizing GPU resources to enhance performance, such as optimizing parallel computations for feature steering.
- **Services:** Accelerates computationally intensive tasks, such as generating text or rendering visualizations, by using GPU capabilities.
- **Implemented By:** GPU drivers, WebGL (if applicable).
- **Type of Module:** Abstract Object.

### Behaviour-Hiding

#### Editor Module (M2)

- **Secrets:** State management of the editor, including virtual DOM updates, handling of formatting rules, and integration of context-sensitive suggestions.
- **Services:** Serves as the main interface for text editing, providing features such as structured editing, real-time text previews, and contextual interactions. Supports seamless file parsing, note suggestions, and user-driven customizations.
- **Implemented By:** Frontend libraries.
- **Type of Module:** Abstract Data Type.

#### Notes Module (M3)

- **Secrets:** Storage mechanisms, data structures for dynamic note updates, and algorithms linking notes to specific contexts within the document.
- **Services:** Enables users to create, edit, delete, and manage notes in real time. Dynamically generates suggestions based on the document's context, aiding the user's creative process.
- **Implemented By:** Frontend libraries, Machine learning models.
- **Type of Module:** Library.

#### Graph View Module (M4)

- **Secrets:** Algorithms for translating document structures into graph visualizations and efficiently synchronizing the graph with real-time document edits.
- **Services:** Provides users with a graphical overview of the document's structure to aid in navigation and organization. Updates dynamically to reflect changes made in the editor, ensuring consistency between the text and its visual representation.
- **Implemented By:** Visualization libraries, State management.
- **Type of Module:** Abstract Object.

#### Settings Module (M5)

- **Secrets:** Mechanism for storing, retrieving, and applying user-specific preferences such as themes, font styles, and interface customizations.
- **Services:** Allows users to configure the application's appearance and behavior, maintaining these settings across sessions for a consistent experience. Adapts preferences dynamically based on user settings input.
- **Implemented By:** LocalStorage APIs.
- **Type of Module:** Abstract Data Type.

#### Rendering Module (M6)

- **Secrets:** Parsing and rendering algorithms for converting user input, such as Markdown, into formatted text. Techniques for applying visual enhancements like annotations and syntax highlighting.
- **Services:** Provides real-time previews of user content, enabling better visualization of the writing process. Enhances readability and interactivity through features such as dynamic formatting and highlights.
- **Implemented By:** Markdown libraries, Frontend rendering engines.
- **Type of Module:** Library.

#### Data Fetching and State Management Module (M7)

- **Secrets:** Data synchronization logic for handling drafts, preferences, and metadata between the local storage and the application state.
- **Services:** Ensures seamless data fetching, caching, and synchronization, preserving user progress and settings across sessions locally. Manages application state for a smooth, uninterrupted user experience.
- **Implemented By:** LocalStorage.
- **Type of Module:** Record.

### Software Decision

#### Inference Module (M8)

- **Secrets:** Integration techniques for advanced machine learning models, including parameter tuning and managing interactions between model outputs and user preferences.
- **Services:** Generates personalized text suggestions by analyzing user input and context. Adapts dynamically to user-defined parameters like tone, style, and creativity.
- **Implemented By:** Llama 3.
- **Type of Module:** Library.

#### User Configuration Module (M9)

- **Secrets:** Data structures and Algorithms for managing user-specific settings, including tone preferences, feature configurations, and real-time updates.
- **Services:** Maintains user preferences and applies them consistently across all features of the application. Ensures personalized experiences by dynamically adapting configurations during sessions.
- **Implemented By:** LocalStorage APIs.
- **Type of Module:** Record.

##### Exported Access Programs

| **Routine Name** | **Input**            | **Output**         | **Description**                     |
| ---------------- | -------------------- | ------------------ | ----------------------------------- |
| `Authors`        | `Author, string`     | `Author Record `   | Record the selected author style    |
| `Tonality`       | `IsEnable, boolean`  | `Boolean`          | Record if the tonality is enable    |
| `Vibes`          | `VibeLevel, Value`   | `VibeLevel Record` | Record the level of vibes           |
| `Notes`          | `NotesNumber, Value` | `NotesNumber`      | Recod the Number of notes generated |

#### Analytics Module (M10)

- **Secrets:** Algorithms for tracking user progress metrics such as word count, tone consistency, and goal completion rates. Methods for generating insights and visual feedback.
- **Services:** Tracks real-time user progress and provides actionable insights to achieve writing goals. Offers intuitive feedback to guide users in improving their writing process.
- **Implemented By:** Frontend analytics tools.
- **Type of Module:** Library.

#### Export and Integration Module (M11)

- **Secrets:** Mechanism for formatting and exporting documents in multiple formats, such as Markdown and PDF, while preserving structure and integrity. Techniques for seamless integration with third-party tools.
- **Services:** Converts user content into export-ready formats and integrates with platforms like Google Docs or Notion for enhanced workflow and collaboration.
- **Implemented By:** REST APIs, Browser APIs.
- **Type of Module:** Abstract Object.

## Traceability Matrix

This section shows two traceability matrices: between the modules and the requirements and between the modules and the anticipated changes.

| **Requirement** | **Modules**        |
| --------------- | ------------------ |
| FR-1            | M2, M3, M4, M8     |
| FR-2            | M1, M8, M9, M3, M5 |
| FR-3            | M2, M6, M8         |
| FR-4            | M8, M9, M5, M10    |
| FR-10           | M7, M6, M11        |
| FR-13           | M11, M6, M9        |
| FR-14           | M5, M2, M6         |

_Table 2: Trace Between Requirements and Modules_

| **AC** | **Modules** |
| ------ | ----------- |
| AC1    | M8          |
| AC2    | M1          |
| AC3    | M5          |
| AC4    | M10, M4     |
| AC5    | M2, M3      |
| AC6    | M6, M10     |
| AC7    | M7, M11     |
| AC8    | M10, M11    |
| AC9    | M1, M8      |
| AC10   | M11         |

_Table 3: Trace Between Anticipated Changes and Modules_

## Use Hierarchy Between Modules

In this section, the uses hierarchy between modules is provided. [@10.5555/800054.801999] said of two programs A and B that A _uses_ B if correct execution of B may be necessary for A to complete the task described in its specification. That is, A _uses_ B if there exist situations in which the correct functioning of A depends upon the availability of a correct implementation of B. Figure 1 illustrates the use relation between the modules. It can be seen that the graph is a directed acyclic graph (DAG). Each level of the hierarchy offers a testable and usable subset of the system, and modules in the higher level of the hierarchy are essentially simpler because they use modules from the lower levels.

![[images/modulediagram.png]]

_Figure 1: Use Hierarchy Between Modules_

## User Interfaces

![[images/POC.pdf|POC]]

![[images/modules.drawio.png]]

## Timeline

A breakdown of the team’s delegation of tasks and responsibilities can be found in the GitHub repository Issues tab. The delegation of tasks assumes an even distribution amongst team members as outlined in the Development Plan.

All documentation-related issues are to be completed prior to the Final Documentation deadline (April 4th, 2025). All feature-related issues (functional and non-functional) are to be completed prior to the Final Demonstration deadline in March.

The below outlines the implementation timeline:

### Phase 1: Revision 0 Demo (due February 3rd, 2025)

#### M2: Editor Module

- UI interaction refinement & contextual suggestion logic — Lucas

- DOM update & formatting rules implementation — Nebras

#### M3: Notes Module

- Note data structure design — Lucas

- Contextual note linking and real-time updates — Aarnphm

- Basic testing on note consistency — Waleed

#### M4: Graph View Module

- Graph structure sync implementation — Waleed

- Interactive UI rendering logic — Lucas

- Structural testing with document changes — Aarnphm

#### M5: Settings Module

- Theme & font customization logic — Lucas

- User preferences state binding — Nebras

- Manual test on dynamic setting application — Waleed

#### M6: Rendering Module

- Markdown parsing and preview integration — Nebras

- Preview accuracy testing — Lucas

#### M7: Data Fetching and State Management

- Draft save/load logic via localStorage — Waleed

- Metadata state structure and caching — Lucas

- Regression testing on document persistence — Nebras

#### M8: Inference Module

- Prompt formatting and response processing — Nebras

- Model interaction pipeline (mocked) — Aarnphm

- Basic input/output testing — Lucas

#### M9: User Configuration Module

- Preference record handling & interface — Lucas

- Live update of tone/style from config — Waleed

- Preference persistence testing — Nebras

#### M10: Analytics Module

- Progress tracking logic design — Waleed

- Testing metrics accuracy — Lucas

#### M11: Export & Integration Module

- Export-to-Markdown logic — Lucas

- Testing Markdown integrity — Waleed

### Phase 2: Final Demo (due March 15th, 2025)

Further refinement and testing of all modules (All team members)

## Appendix

[^ref]

### Revision

| **Date**      | **Version** | **Notes**                               |
| ------------- | ----------- | --------------------------------------- |
| Jan. 05 2025  | 0.0         | Created rough sketches for architecture |
| Jan. 10 2024  | 0.1         | Purpose                                 |
| Jan. 12 2024  | 0.2         | Project Overview/Diagrams               |
| Jan. 13 2024  | 0.3         | Updated Module Hierarchy and Table      |
| Jan. 16 2024  | 0.4         | Finished Module Decomposition           |
| Jan. 17 2024  | 0.4         | Completed Document                      |
| March 31 2025 | 0.5         | Rename to `morph` for consistency       |
| April 04 2025 | 1.0         | Rev 1                                   |
