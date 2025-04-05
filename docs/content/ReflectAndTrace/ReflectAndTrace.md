---
id: ReflectAndTrace
tags:
  - meta
  - performance
author: aarnphm
date: "2024-09-16"
title: Reflection and Traceability Report
---

Reflection is an important component of getting the full benefits from a learning experience. Besides the intrinsic benefits of reflection, this document will be used to help the TAs grade how well your team responded to feedback. Therefore, traceability between Revision 0 and Revision 1 is and important part of the reflection exercise. In addition, several CEAB (Canadian Engineering Accreditation Board) Learning Outcomes (LOs) will be assessed based on your reflections.

## Changes in Response to Feedback

Summarize the changes made over the course of the project in response to feedback from TAs, the instructor, teammates, other teams, the project supervisor (if present), and from user testers.

For those teams with an external supervisor, please highlight how the feedback from the supervisor shaped your project. In particular, you should highlight the supervisor's response to your Rev 0 demonstration to them.

Version control can make the summary relatively easy, if you used issues and meaningful commits. If you feedback is in an issue, and you responded in the issue tracker, you can point to the issue as part of explaining your changes. If addressing the issue required changes to code or documentation, you can point to the specific commit that made the changes. Although the links are helpful for the details, you should include a label for each item of feedback so that the reader has an idea of what each item is about without the need to click on everything to find out.

If you were not organized with your commits, traceability between feedback and commits will not be feasible to capture after the fact. You will instead need to spend time writing down a summary of the changes made in response to each item of feedback.

You should address EVERY item of feedback. A table or itemized list is recommended. You should record every item of feedback, along with the source of that feedback and the change you made in response to that feedback. The response can be a change to your documentation, code, or development process. The response can also be the reason why no changes were made in response to the feedback. To make this information manageable, you will record the feedback and response separately for each deliverable in the sections that follow.

If the feedback is general or incomplete, the TA (or instructor) will not be able to grade your response to feedback. In that case your grade on this document, and likely the Revision 1 versions of the other documents will be low.

### Changes in Response to Usability Testing

Based on the feedback received from our usability testing sessions, the following key changes were implemented:

- Embeddings Search Enhancement:
Introduced a major feature where, upon clicking an AI-generated note, Morph now uses embeddings search to highlight the most relevant area of text. This improvement provides clear context and significantly enhances the accuracy of AI suggestions.

- Enhanced Vault Creation Process:
Improved visual cues with arrows and intuitive icons, along with clearer instructions regarding directory requirements. This ensures users easily understand that only empty directories or those containing exclusively Markdown files can be added to the vault, thus reinforcing data privacy.

- Simplified Reasoning Panel:
Redesigned the Reasoning panel to replace overly technical language with simplified, natural language summaries. Additionally, visual feedback was integrated to clearly indicate which section of the text a suggestion relates to when a note is clicked.

- Interface & Navigation Refinements:
Refined overall navigation by updating icons and streamlining panel layouts. Real-time visual feedback was added across the interface to make the user experience more intuitive and responsive.

- Expanded Settings Customization:
Enhanced the Settings panel by adding more customization options, including a reset-to-default feature. This allows users to personalize their interface more effectively and ensures that changes are reflected immediately.

These targeted improvements directly address the issues identified during the usability tests and have resulted in a more seamless and user-friendly experience with Morph.
### SRS and Hazard Analysis

#### SRS 

Update PUCs to align with recent feature changes
- The Product Use Cases (PUCs) were updated to reflect newly added features such as author style, tone, and note density settings. Existing use cases were refined to better capture how user input flows through configuration, storage, and inference stages.

FR and NFR adjustment
- Functional and Non-Functional Requirements were revised for clarity and completeness. New FRs were added to support steering customization, while NFRs were adjusted to cover safety, accessibility, and performance expectations.

BUC diagram
- The Business Use Case (BUC) diagram was updated to follow standard UML conventions.

hyperlink fix
- Internal links across the document were reviewed and corrected to ensure accurate navigation between sections, especially for requirements, glossary terms, and diagrams.

Traceability table between FR and NFR
- The FR-NFR traceability matrix was expanded to include newly added requirements, improving clarity on how functional behaviors are supported by usability, performance, and safety constraints.

#### Harzrd Analysis

Introduction Section:


- The introduction section will be revised to provide a clear, concise overview of the Hazard Analysis document. This includes clearly stating its purpose, scope, and relationship to the overall system safety planning. The introduction will also briefly describe the methodology used (e.g., FMEA, fault tree analysis), helping readers understand the structure and context before diving into technical content. Aligning the introduction with the document’s intent improves readability and sets proper expectations for stakeholders.

Tables:

- All tables in the document will be assigned unique and consistent numbering (e.g., Table 1, Table 2, etc.) to improve organization, referencing, and traceability. Table captions will clearly describe their content, allowing readers to quickly identify relevant data when scanning the document or following cross-references from other sections such as the traceability matrix or risk prioritization.

Markdown Formatting:

- Markdown formatting across the document will be reviewed and corrected to fix readability issues caused by broken or misused syntax. This includes improper heading levels, unrendered bullet points, broken tables, and inconsistent spacing. Proper formatting ensures that the rendered output—whether viewed online, exported to PDF, or used in GitHub—remains professional, legible, and consistent.

PDF Version:

- A clean, properly rendered PDF version of the document will be generated and submitted alongside the original Markdown source. This ensures that reviewers do not experience formatting issues when viewing the file in different environments. The PDF will preserve layout consistency, ensure that diagrams and tables render correctly, and support easier offline reading and annotations.

Traceability:

- Hyperlinks will be added to all requirements, particularly those referenced in the FMEA and other risk analysis tables. This allows readers to quickly jump between identified hazards, mitigation actions, and related requirements or constraints. Improved traceability supports better verification, validation, and audit processes, and makes the document more navigable for both engineering and safety review teams.

### Design and Design Documentation

#### Module Guide

User Config Module Updated with Exported Access Program Syntax:
- The user configuration module has been updated to include detailed access program definitions with consistent syntax. Each exported function now follows a standardized interface format, making it easier to implement and trace through the system. This change improves clarity in how configuration preferences (such as author style, tone, and visual themes) are stored and retrieved across the application.

MG Content Synced with SRS Functional Requirements:
- The Module Guide (MG) has been revised to align with recent updates in the Software Requirements Specification (SRS). Functional requirements added or modified in the SRS—such as profile customization, planning enhancements, and feedback mechanisms—are now accurately reflected in the MG, ensuring consistency between design and specification documents.

Timeline Added to the Document:
- A development timeline has been included to outline major milestones, deliverables, and deadlines. This addition provides a clear visual overview of the project phases, helping stakeholders and team members stay aligned on progress expectations and planning sprints.

Legend Added to Module Diagram:
- To improve diagram readability, a legend has been added to the module diagram. The legend clarifies the meaning of different symbols, arrows, and component types, allowing readers to interpret the architectural relationships more accurately.

#### MIS

Updated Hierarchy Diagram:
- The module hierarchy diagram has been revised to reflect the most current structure of the system architecture. Changes include updated relationships between core components such as the Editor, Inference, and Configuration modules, ensuring the diagram matches the current decomposition of responsibilities and inter-module communication flows.

Mathematical Notation Updated for MIS of Inference Module:
- The Module Interface Specification (MIS) for the Inference Module now includes corrected and consistent mathematical notation. Key functions and data transformations (e.g., embedding vectors, steering weights, and prompt construction logic) have been expressed with clearer variable naming and notation that aligns with standard conventions, improving precision and technical readability.

Updated MIS of Editor Module for Greater Detail:
- The MIS for the Editor Module has been expanded to provide more detailed interface definitions. This includes descriptions of key functions (e.g., applyVimBindings, enterVisualMode, getEditorState), their transitions, outputs, and exceptions. The update enhances clarity for implementers and ensures consistent handling of user interactions across the application.

diagram Removed and Updated:
- The outdated module diagram file modules.drawio.png was removed to avoid confusion. A new, up-to-date version—modulediagram.png—has been added, incorporating recent changes to the module structure and legend. This ensures that all diagrams in the documentation accurately reflect the current design state.

### VnV Plan and Report

## Challenge Level and Extras

### Challenge Level

State the challenge level (advanced, general, basic) for your project. Your challenge level should exactly match what is included in your problem statement. This should be the challenge level agreed on between you and the course instructor.

### Extras

Summarize the extras (if any) that were tackled by this project. Extras can include usability testing, code walkthroughs, user documentation, formal proof, GenderMag personas, Design Thinking, etc. Extras should have already been approved by the course instructor as included in your problem statement.

## Design Iteration (LO11 (PrototypeIterate))

Explain how you arrived at your final design and implementation. How did the design evolve from the first version to the final version?

Don't just say what you changed, say why you changed it. The needs of the client should be part of the explanation. For example, if you made changes in response to usability testing, explain what the testing found and what changes it led to.

## Design Decisions (LO12)

Reflect and justify your design decisions. How did limitations, assumptions, and constraints influence your decisions? Discuss each of these separately.

## Economic Considerations (LO23)

Is there a market for your product? What would be involved in marketing your product? What is your estimate of the cost to produce a version that you could sell? What would you charge for your product? How many units would you have to sell to make money? If your product isn't something that would be sold, like an open source project, how would you go about attracting users? How many potential users currently exist?

## Reflection on Project Management (LO24)

This question focuses on processes and tools used for project management.

### How Does Your Project Management Compare to Your Development Plan

Did you follow your Development plan, with respect to the team meeting plan, team communication plan, team member roles and workflow plan. Did you use the technology you planned on using?

### What Went Well?

What went well for your project management in terms of processes and technology?

### What Went Wrong?

What went wrong in terms of processes and technology?

### What Would you Do Differently Next Time?

What will you do differently for your next project?

## Reflection on Capstone

This question focuses on what you learned during the course of the capstone project.

### Which Courses Were Relevant

Which of the courses you have taken were relevant for the capstone project?

### Knowledge/Skills Outside of Courses

What skills/knowledge did you need to acquire for your capstone project that was outside of the courses you took?
