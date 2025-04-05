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

#### VnV Plan

Expanded Reflection Section with Clearer Reasoning on Critical Paths
- The reflection section has been expanded to include detailed reasoning behind identified critical paths in the system. This includes discussion of how modules such as Inference, Editor, and Config interact during high-priority operations (e.g., suggestion generation), and why their performance and reliability are essential to overall system correctness. These insights provide a stronger foundation for prioritization in testing and risk analysis.

Rewrote Test Case Outputs with Specific, Verifiable Results
- All test cases have been revised to replace vague or subjective output descriptions with measurable, binary-verifiable results. This ensures that each test can be conclusively passed or failed, enhancing the objectivity of the validation process and reducing room for misinterpretation during quality assurance.

Added Symbolic Constants Section for FR and NFR Test Parameters
- A new section defines symbolic constants (e.g., MAX_TTFT_MS, MIN_THROUGHPUT_TOKENS) used throughout the FR and NFR testing documentation. These constants promote consistency across test cases, simplify updates, and ensure alignment between performance expectations and their formal evaluation.

Added Justification for TTFT and Throughput Metrics in Performance Section
- The performance section now includes a rationale for the selected Time-To-First-Token (TTFT) and throughput thresholds. Justifications are based on user experience goals, comparative benchmarks for AI assistants, and responsiveness targets in interactive writing environments. This strengthens the case for the system’s responsiveness requirements.

Included Feedback Iteration Step in the Validation Process
- The validation methodology now explicitly includes a feedback loop from users or reviewers after initial testing phases. This iterative process supports refinement of test strategies, captures usability issues not addressed by automated tests, and ensures alignment with user expectations across style, tone, and interaction flows.

Added Complete Input Test Table for All Functional Requirements
- A comprehensive input test matrix has been added, covering all defined Functional Requirements (FRs). Each entry specifies valid and invalid input cases, edge conditions, and expected system behavior. This addition improves test coverage and aids in verification planning.

Introduced Output Evaluation Checklists for Style and Tone Validation
- To support qualitative assessment of stylistic steering (e.g., author style, tonality, vibe), structured output evaluation checklists have been added. These checklists include criteria for voice consistency, tone adherence, and user-configured parameters, enabling a semi-formal review process that complements automated validation.


#### VnV Report

Expanded the Symbols, Abbreviations, and Acronyms Table
- The table of symbols, abbreviations, and acronyms has been expanded to include all technical terms, test metrics, tool references, and system-specific shorthand used throughout the report. This update improves clarity and ensures that both technical and non-technical readers can follow the document without ambiguity.

Added Evidence Snippets from Tools like coverage.py
- To strengthen the credibility of verification activities, evidence snippets from tools such as coverage.py, pytest, and output logs were added. These include screenshots or excerpts showing line-by-line coverage, test passes/failures, and runtime assertions, providing concrete proof of system behavior and test completeness.

Inserted Code Snippets and Formatted Outputs to Justify Evaluation
- Throughout the report, additional code samples and formatted outputs were embedded to support validation claims. These examples help demonstrate not only functional correctness but also stylistic and structural outcomes from modules like Inference and Editor, aligning evaluation results directly with observable system behavior.

Revised Comparison to Existing Implementations
- The comparison section now includes a deeper analysis contrasting the current system’s performance and features with tools like ChatGPT and ProWritingAid. This includes references to specific test scenarios, highlighting unique advantages (e.g., local inference, customizable tone control) and contextual limitations of mainstream alternatives.

Added Detailed Unit Test Explanations
- Each unit test is now accompanied by a clear explanation of its purpose, what it validates, and what constitutes a pass/fail outcome. This breakdown improves traceability between the tests and the functional requirements, while also demonstrating the system’s stability across core components like configuration management, input parsing, and suggestion generation.

## Challenge Level and Extras

### Challenge Level

The challenge level for our project is General. While the project introduced several concepts in AI and large language models that were initially unfamiliar to many team members, we agreed with our course instructor and TA that a general challenge level was appropriate. This decision allowed us to explore innovative technologies without overcomplicating the project, striking a balance between advanced capabilities and user accessibility.

### Extras

In addition to the core functionality of Morph, we implemented two extra components to enhance the overall project:

Usability Testing:
- We conducted comprehensive usability testing sessions using a think-aloud protocol with a diverse group of stakeholders. This included law students, software engineering students, machine learning/AI engineers, and writers with non-technical backgrounds. The feedback gathered from these sessions was instrumental in refining the interface and ensuring that our application met user needs effectively.

User Manual:
- We developed a detailed user manual to guide new users through Morph’s features and troubleshooting processes. The manual provides step-by-step instructions on how to use the application, making it easier for users to navigate and resolve common issues, thereby enhancing the overall user experience.

## Design Iteration (LO11 (PrototypeIterate))

Our journey began with a very basic prototype—essentially a static Figma design with a minimal, non-coded interface. In this initial stage, the only AI functionality was a simple model that could "steer" text based solely on one keyword, "furniture." This early prototype served as a conceptual proof-of-concept and lacked any comprehensive user experience features.

### Transition to Rev0
For Revision 0 (Rev0), we shifted from design to code, developing a functional interface and implementing a very basic AI model. While this version demonstrated core capabilities—allowing users to create vaults, edit Markdown files, and receive AI suggestions—it quickly became apparent that the system had several significant issues:
- **Clunky Interface:** The user interface was not refined, making navigation and task completion cumbersome.
- **Data Storage Bugs:** We encountered numerous bugs in storing and retrieving user data, resulting in inconsistent vault functionality.
- **Broken Markdown Rendering:** The text editor failed to fully render Markdown, diminishing the overall writing experience.
- **Unclear Instructions:** Users struggled to understand what each component did, particularly around vault creation and AI suggestion interpretation.
- **Lack of Safety Mechanisms:** There was no safety model in place to block NSFW content, posing potential privacy and security concerns.
- **Minimal AI Feedback:** The embeddings similarity check was running in the background, but clicking on AI-generated notes did not provide any visual indication of the relevant text.

### Advancements in Rev1

In Revision 1 (Rev1), we addressed these issues comprehensively based on extensive usability testing and stakeholder feedback. We reconvened with the same 10 participants—comprising law students, software engineering students, machine learning/AI engineers, and writers with non-technical backgrounds—across multiple sessions (early March, late March, and early April 2025) to validate our changes. Key improvements include:

- **Enhanced Vault Creation:**  
  *What Was Fixed:* Enhanced visual cues (arrows, icons) and clearer instructions were implemented, ensuring users now easily understand the directory requirements.  
  *Why:* Clear visual guidance reduces confusion and ensures users adhere to privacy rules by selecting only empty directories or those containing exclusively Markdown files, thereby protecting their data.

- **Robust Data Storage:**  
  *What Was Fixed:* We integrated more reliable file system APIs and robust error handling to secure local data storage.  
  *Why:* Reliable data storage is paramount to maintain the integrity of user documents. Ensuring data is stored correctly minimizes the risk of data loss and reinforces trust in the application's privacy-first approach.

- **Improved Markdown Rendering:**  
  *What Was Fixed:* The text editor was rebuilt to fully support Markdown formatting, with immediate rendering feedback added.  
  *Why:* A smooth and responsive Markdown rendering process is essential for a productive writing experience. Immediate feedback allows users to see the final output quickly, encouraging a more efficient and enjoyable workflow.

- **Safety Mechanisms:**  
  *What Was Fixed:* A safety model was integrated to filter and block NSFW content effectively.  
  *Why:* By preventing inappropriate content from being displayed or stored, the safety mechanism upholds the integrity of the platform and ensures a secure, family-friendly user environment.

- **AI Suggestions & Reasoning Panel Enhancements:**  
  *What Was Fixed:* We enhanced the embeddings similarity check so that clicking on a note now highlights the corresponding section of text. The Reasoning panel was redesigned to provide simplified, natural language summaries.  
  *Why:* This improvement creates a direct visual link between AI suggestions and the source text, increasing transparency and trust in the AI. Simplified explanations make the feature accessible to all users, regardless of technical expertise.

- **Interface & Navigation Refinements:**  
  *What Was Fixed:* The interface was refined with updated icons, streamlined panel layouts, and real-time visual feedback.  
  *Why:* A clean, intuitive interface is crucial for reducing user frustration and enhancing the overall user experience. Improved navigation ensures that users can access and use all features efficiently.

- **Expanded Settings Customization:**  
  *What Was Fixed:* Additional customization options were integrated into the Settings panel, including a reset-to-default feature and more flexible keybinding configurations.  
  *Why:* Allowing users to tailor the application to their preferences boosts usability and satisfaction. Enhanced customization makes Morph adaptable to a wider range of workflows and personal preferences.

These targeted improvements directly address the issues identified during usability testing and have transformed Morph from a basic, clunky prototype into a polished, intuitive, and responsive tool that meets the high usability and privacy expectations of our diverse user base.


## Design Decisions (LO12)

### Limitations
Our design decisions were heavily influenced by technical limitations inherent in developing a fully web-based, AI-driven text editor. For instance, relying on experimental browser APIs such as `queryPermission()` restricted us to using only modern, Chromium-based browsers, which in turn limited our user base. Moreover, the computational demand for running a real-time embeddings similarity check meant that we had to optimize our code carefully to maintain responsiveness. These limitations forced us to prioritize performance and stability over adding less critical features, resulting in a streamlined, efficient system.

### Assumptions
Several key assumptions guided our design:

- **User Environment:** We assumed that users would have a stable internet connection and sufficient local disk space, which allowed us to implement a "file-over-app" approach without relying on centralized cloud storage.
- **Data Privacy:** It was assumed that our target users place a high priority on data privacy. This assumption led to decisions such as enforcing strict directory criteria (only empty directories or those containing exclusively Markdown files) to ensure that user data remains entirely local.
- **User Proficiency:** We assumed a baseline level of technical competence among our users, enabling us to integrate advanced AI functionalities while still maintaining an intuitive interface. This balance allowed us to offer sophisticated features like embeddings-based suggestions without overwhelming less technical users.

### Constraints
Our design was also shaped by several constraints:

- **Privacy and Security:** Mandatory privacy constraints required that no sensitive data be transmitted or stored externally. This led to a design that emphasizes local storage and strict control over file access.
- **Performance:** The need for a responsive, real-time interface imposed performance constraints. We had to optimize the embeddings similarity check and ensure that all user interactions, such as rendering Markdown or updating settings, occurred quickly and smoothly.
- **Time and Resource Constraints:** Limited development time and resources dictated that we prioritize core functionalities. This constraint led to iterative development, where we incrementally improved the interface and AI features based on user feedback from our usability testing sessions.

Overall, our design decisions were a careful balancing act between overcoming technical limitations, validating our assumptions about user needs, and adhering to strict constraints on privacy, performance, and project timelines. This approach enabled us to deliver a secure, efficient, and user-friendly product that meets both our technical goals and the expectations of our diverse user base.

## Economic Considerations (LO23)

There is a robust market for an AI-enhanced text editor like Morph. With the increasing demand for tools that integrate advanced AI capabilities into everyday workflows, our product appeals to a broad audience, including creative writers, students, professionals, and technical writers. Morph’s focus on local data privacy, real-time AI suggestions, and an intuitive interface distinguishes it from other products, positioning it well within a growing niche.

### Marketing Strategy
- **Digital Marketing:**  
  Leverage social media platforms (Twitter, LinkedIn, Facebook) and content marketing (blogs, tutorials, and case studies) to highlight Morph’s unique features and benefits.
- **Community Engagement:**  
  Build an active user community through GitHub, developer forums, and dedicated user groups to encourage feedback and continuous improvement.
- **Conferences and Webinars:**  
  Present Morph at industry events and host webinars to demonstrate its functionality and attract both individual users and enterprise customers.
### Cost Considerations
- **Domain Name:**  
  The cost of a domain (e.g., morph-editor.app) is relatively low and constitutes a minor part of the overall budget.
- **GPU Costs:**  
  Our current setup utilizes an NVIDIA A100 GPU that runs continuously. With a low number of concurrent users, costs remain minimal; however, GPU expenses will scale with increased user concurrency.
- **No Database Costs:**  
  Morph’s file-over-app architecture means that user data is stored locally on the device, eliminating ongoing database costs.
- **Development and Maintenance:**  
  Ongoing development, bug fixes, and support are required, but leveraging open source components and community contributions helps mitigate these expenses.

### Revenue Model and Pricing
- **Commercial Version:**  
  For a commercial release, we could adopt a subscription model (e.g., $10–$20 per month) or a one-time licensing fee (e.g., $50–$100 per user).
- **Open Source Strategy:**  
  If Morph remains open source, attracting users will depend on active community engagement, regular updates, and robust support channels. Monetization could occur through sponsorships, premium add-ons, or enterprise support contracts.

### Market Potential
- **User Base:**  
  The market for AI-enhanced writing tools is expanding rapidly. Potential users include thousands of creative professionals, academics, and technical experts worldwide.
- **Scalability:**  
  With a scalable cloud-based infrastructure and a decentralized data storage model, Morph can efficiently serve both individual users and larger organizations while ensuring high levels of privacy.
- **Competitive Advantage:**  
  Morph’s combination of local storage (ensuring data privacy), real-time AI suggestions, and a polished, intuitive user interface provides a strong competitive edge.

Overall, Morph offers a cost-effective and scalable solution with significant revenue potential. By minimizing operational costs (through local data storage and scalable GPU usage) and implementing a strategic marketing plan focused on digital outreach and community engagement, Morph is well-positioned to capture a substantial share of the market for AI-enhanced text editors.

## Reflection on Project Management (LO24)

This question focuses on processes and tools used for project management.

### How Does Your Project Management Compare to Your Development Plan

Overall, our project management closely followed the structure outlined in our original development plan. We maintained our team meeting schedule, holding both regular standups and milestone-based planning sessions. This helped us stay aligned across phases and quickly adjust priorities as needed.

In terms of team communication, we followed the planned approach of combining synchronous meetings with asynchronous updates via chat platforms. This allowed for fast issue resolution and kept all members in the loop, even when schedules didn’t perfectly align.

Each member largely stuck to their assigned role as outlined in the workflow plan, but we also remained flexible—occasionally shifting responsibilities based on workload or availability. This adaptability helped maintain progress without overloading any one team member.

We also implemented the workflow plan effectively, using a shared Kanban board to assign and track tasks. This gave us a clear overview of what was in progress, completed, or blocked.

Finally, we stayed consistent with our planned technology stack, using the intended libraries, frameworks, and tools throughout the project. Any changes were minimal and carefully justified, often in response to implementation constraints or performance considerations.

### What Went Well?

One of the most successful aspects of our project management was our consistent and timely internal communication. We maintained a strong feedback loop within the team by holding regular check-ins and using asynchronous updates through messaging tools. This helped us clarify blockers early, stay aligned on priorities, and quickly iterate on tasks without waiting for formal meetings.

In addition, the use of time management tools like a shared Kanban board (e.g., Trello or GitHub Projects) helped us track progress effectively. We broke down major milestones into smaller, manageable tasks with clear deadlines and ownership. This made it easier to stay on schedule and adapt when scope changes occurred.

Overall, combining proactive communication with lightweight scheduling tools kept the team organized and responsive throughout the development cycle.

### What Went Wrong?

One challenge we encountered was overestimating the clarity of early task definitions. In some cases, tasks were assigned before all requirements were fully understood, leading to rework or misalignment with the intended functionality. This highlighted the need for clearer scoping discussions before task breakdown.

On the process side, while our communication was generally strong, there were occasional delays in decision-making when coordination across submodules was required. These bottlenecks could have been reduced by designating clearer escalation paths or setting firmer async deadlines.

From a technology perspective, some tooling setup (e.g., formatting or coverage tools) took longer than anticipated due to compatibility issues across local environments. We also had to make minor adjustments to our original tech stack when edge cases or performance bottlenecks arose that weren’t fully anticipated in the planning phase.

Lastly, while our Kanban board helped track task status, task granularity wasn’t always ideal, making it harder to estimate progress in certain sprints.

### What Would you Do Differently Next Time?

For future projects, we would place more emphasis on early-stage task refinement and requirement clarification before implementation begins. Ensuring that each task is well-scoped and that dependencies are clearly identified would help reduce ambiguity and avoid rework.

We would also implement a more structured approach to cross-module integration planning, including dedicated sync points where teams align on shared interfaces or timing-sensitive features. This would help reduce coordination delays and improve overall system cohesion.

On the tooling side, we would allocate time at the beginning of the project to standardize local environments and verify that all tools (e.g., testing, formatting, coverage) are fully operational for everyone. This proactive setup would minimize compatibility issues down the line.

Finally, we would experiment with more granular task tracking and timeboxing in our workflow tools to improve visibility into individual progress and better estimate workload across sprints.

## Reflection on Capstone

Throughout the development of tinymorph, our team gained hands-on experience with designing and delivering a machine-assisted writing environment. We strengthened our technical and communication skills by coordinating across multiple components including the text editing frontend, real-time feedback mechanisms, and the machine learning inference server. We navigated architectural decisions that balanced user needs, implementation constraints, and maintainability. Iterating on feedback from early usability tests and stakeholder reviews helped refine our core features, such as note suggestions and the vault system. Working within a real development cycle also taught us the importance of early integration testing and continuously verifying assumptions about user workflows. tinymorph challenged us to build a system that not only functions but also inspires creativity, requiring a higher level of UX awareness than many previous course projects.

### Which Courses Were Relevant

Several McMaster courses directly informed how we approached the tinymorph project. Our understanding of client-server communication and modular architecture stemmed from Software Architecture and Software Design courses. These helped in structuring the system into manageable components like the inference backend and stateless vault. Human-Computer Interfaces provided critical insight into how users interact with digital tools, directly influencing our minimalist UI and focus on non-intrusive feedback. Software Testing gave us the foundation to build reliable unit and integration tests, and our learnings from Databases, while not directly applied due to tinymorph’s file-over-database philosophy, informed how we managed file-based consistency and performance. Finally, Engineering Design taught us how to scope, validate, and iterate systematically throughout the capstone cycle.

### Knowledge/Skills Outside of Courses

In addition to classroom knowledge, we acquired a wide range of practical and interpersonal skills throughout the project. We learned to operate within real-world engineering tradeoffs—deciding when to simplify a feature, rework an interaction model, or defer a complex enhancement. We became comfortable with tools and practices like CI/CD pipelines, GitHub Actions, and automated accessibility and performance testing. Our understanding of working with large language models and embedding techniques was largely self-taught, relying on external documentation and experimentation. Equally important were the soft skills we developed: managing team dynamics, coordinating across async workflows, and conducting user interviews to inform our priorities. These experiences built a foundation not only for technical growth but also for clear, empathetic communication that will benefit us in future collaborative settings.
