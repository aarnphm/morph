---
id: ProblemStatement
tags:
  - meta
author: aarnphm,nebrask,waleedmalik7,lucas-lizhiwei
date: "2024-09-16"
modified: 2025-03-31 14:56:17 GMT-04:00
title: Problem Statement and Goals
titleTransclude: false
---

See also: [[ProblemStatementAndGoals/ProblemStatement#Revision|this document revision]]

## Problem

<br>
<p class="quotes">
  <i>To know the world one must construct it.</i> -- Pavese
</p>

With software deeply embedded in everyday life and the rapid advancement of large language models (LLMs), there is a growing need for interfaces that amplify user agency and encourage personalized interaction, rather than mere automation. Existing conversational interfaces (CUIs) often struggle with complex tasks and the structuring of extensive information, especially affecting creative writers like engineers who seek coherent, non-linear thought exploration. To address this challenge, `tinymorph` aims to introduce novel spatial and visual interfaces for text generation to enhance cognitive exploration and creativity in writing.

## Inputs and Outputs

Inputs from users' perspective:

1. A writing sample or topic of the user’s choice (e.g., essay on growth)
2. Personal preferences for tonality and writing style
3. External information sources related to topic at hand
4. Context of the topic as well as desired goals.

Outputs from `morph`:

1. A text-based [[glossary#inlay hints]] suggestions from models
2. left-to-right (LTR) sequential panel to get users feedback on [[glossary#manual steering]]


## Stakeholders

The main stakeholders of `tinymorph` include writers and engineers who write. The tool seeks to help writers become more productive and overcome creative blocks. It also aims to encourage engineers who write to be more creative and structured in their writing, while staying true to their tone. Writing at the end of the day is very personal, which means a tool should not dictate how one should write.

## Environment

`tinymorph` is designed to operate as a cross-platform web-based text editor that functions reliably across modern desktop operating systems. It supports both online and offline modes, allowing users to interact with language models through local or remote inference. The system prioritizes lightweight deployment with minimal dependencies and an intuitive interface.

The environment supports modular experimentation with text generation features, steering mechanisms, and user feedback loops, enabling adaptability to various user contexts and writing workflows.

## Goals

Tinymorph aims to deliver a web-based text editor that is intuitive, responsive, and grounded in cognitive support for writers. The following goals guide its design and development:

- **[_File-over-app_](https://stephango.com/file-over-app) editing experience**  
  Prioritizes simplicity and portability by enabling users to treat writing sessions as files rather than bound app sessions, lowering barriers to entry and promoting ease of use.

- **Integrated feedback loop for user-guided planning**  
  Enables writers to iteratively steer text generation based on evolving goals, helping users overcome writer’s block and stay aligned with their intent throughout the process.

- **Efficient activation caching for responsive feature steering**  
  Supports real-time responsiveness during editing by reducing unnecessary recomputation, making interaction smooth even during experimentation.

- **Steering mechanism through interpreter models**  
  Allows users to guide model behavior at a granular level, introducing a new paradigm for interacting with LLMs beyond prompt engineering.

- **OpenAI-compatible API for LLM server integration**  
  Ensures flexibility in deployment, allowing users to plug in external or local models while maintaining compatibility with known standards.

- **User-centered interface design**  
  Focuses on clarity, minimalism, and non-intrusiveness to reduce cognitive load and support diverse writing workflows without distractions.

- **Accessibility and cross-platform usability**  
  Aims for wide accessibility across modern browsers and operating systems, including low-bandwidth or offline scenarios.


## Stretch Goals

- **Local inference support**  
  Gives users full control over their data and usage by running models locally, enhancing privacy and autonomy.

- **Device flexibility (tablets, e-readers, etc.)**  
  Expands usability across form factors, enabling casual and on-the-go writing experiences.

- **Personalized model behavior via user-tuned settings**  
  Allows users to adjust generation behavior through persistent style and tone preferences, offering a more tailored and consistent writing experience over time.

## Challenge Level and Extras

Challenge level for `tinymorph` is advanced, since the project is exploring what is possible to build AI-native
interfaces. It involves the field of [[glossary#mechanistic interpretability]], which is a relatively new field in alignment research that involves a lot of domain knowledge into the inner workings of transformer circuits.

Extras that we wish to pursue: User Manual, Usability Testing.

Reasoning:

1. User Manual: We plan to document the functionality and usage of `tinymorph` to ensure that users can effectively understand and navigate the tool. This includes clear instructions, visual examples, and troubleshooting tips to make the tool more accessible.
2. Usability Testing: As `tinymorph` aims to explore new interactions for writing, it is important to validate our design and interaction patterns through user testing. Gathering feedback from real users will help refine our interface and ensure it supports a smooth and intuitive experience.

## Appendix

### Reflection

1. What went well while writing this deliverable?
2. What pain points did you experience during this deliverable, and how did you resolve them?
3. How did you and your team adjust the scope of your goals to ensure they are suitable for a Capstone project (not overly ambitious but also of appropriate complexity for a senior design project)?
<div class="reflection-container">

<div class="users">
  <a class="name" href="https://github.com/aarnphm">Aaron</a>
</div>

<div class="blob">

1. Writing this document helps me structure my thoughts surrounding the problem
definition and somewhat confirm an intuition I have towards this problem. Interfaces for personal computing are
supposed to be open-ended to surprise ourselves with new ways to create, therefore, I think it is important for me to
write down these thoughts. At the end of the day, writing is a form of lossiness as mutation, turning a "net into a line".

2. The main pain point I have during writing the problem statement includes declaring the scope for hardware and software
requirements. We did have an internal discussion whether to build a GUI text-editor or refer to a web-based one. After
a quick discussion, we decided that given everyone expertise and preference with the web, our main focus for capstone would be a
web-based interface.

3. We did consult with our supervisor to limit down the scope for both the UX work as well as potential avenue for ML research.
We established a clear boundaries for UX components we would develop that supplement the core ML work we are going to
do (which is mechanistic interpretability).

</div>

</div>

<br/>

<div class="reflection-container">

<div class="users">
  <a class="name" href="https://github.com/nebrask">Nebras</a>
</div>

<div class="blob">

1. I think we did a good job distilling the overall vision of tinymorph into something focused and compelling. Everyone contributed ideas that helped shape the goals into more than just features. They became value-driven statements. The revision of the problem statement also flowed smoothly once we got feedback. We all aligned on tone and clarity pretty quickly.

2. Initially, our writing was too verbose and implementation-heavy, especially in the problem statement and environment sections. It was difficult to step back and abstract things to the appropriate level. We resolved it by reviewing each section against the feedback and asking, “Is this what the reader needs to know at this point?” That helped guide clearer edits.

3. Originally, we had some pretty ambitious goals involving mechanistic interpretability, local model support, and UI customizations across multiple devices. After talking with our supervisor and reviewing technical feasibility, we narrowed the scope to focus on the web-based editor and meaningful user feedback loops. These are still technically challenging but more realistic within the timeframe.


</div>

</div>

<br/>

<div class="reflection-container">

<div class="users">
  <a class="name" href="https://github.com/waleedmalik7">Waleed</a>
</div>

<div class="blob">

1. We worked well as a team when iterating on feedback, especially when condensing the problem statement. Everyone was receptive to critique and focused on making the document tighter and more readable. That really helped us shape a more focused narrative.

2. A challenge we ran into was separating “how we’ll build it” from “what we’re building,” particularly in the environment and goals sections. It took several rounds of rewrites and peer edits before we were able to frame things more from a user's perspective rather than a developer's.

3.  We removed some of the stretch elements like native GUI versions and deep research on activation editing. Instead, we added more user-centric goals such as usability testing and a user manual. These still provide value and complexity but are achievable within our team size and timeline.


</div>

</div>

<br/>

<div class="reflection-container">

<div class="users">
  <a class="name" href="https://github.com/lucas-lizhiwei">Lucas</a>
</div>

<div class="blob">

1. It was encouraging to see how much clarity we gained once we committed to making each section user-facing. Once we reframed our goals around user experience rather than just technical output, the entire document felt more cohesive and aligned with our vision.

2. Writing about advanced topics like mechanistic interpretability without overwhelming the reader was tricky. We had to balance technical depth with accessibility. We resolved it by breaking things down with clear, high-level descriptions and pushing technical details into other supporting documents.

3. We made sure to reflect on what success would look like for both the user and the course. This led us to scope down to the core interaction layer such as the web editor, feedback loop, and basic LLM integration. We set aside more experimental ideas like deep customization of model internals. It felt like a good middle ground between ambition and feasibility.

</div>

</div>


<!-- 1. What went well while writing this deliverable? -->
<!-- 2. What pain points did you experience during this deliverable, and how did you resolve them? -->
<!-- 3. How did you and your team adjust the scope of your goals to ensure they are suitable for a Capstone project (not overly ambitious but also of appropriate complexity for a senior design project)? -->

### Revision

| Date          | Revision | Change                                        |
| ------------- | -------- | --------------------------------------------- |
| Sept. 16 2024 | 0.0      | Initial skafolding                            |
| Sept. 19 2024 | 0.1      | Problem Statement definitions                 |
| Oct. 5 2024   | 0.2      | Update problem statement, adjust stakeholders |
| March 31 2025 | 0.3      | Renaming project for consistency              |
| Apr. 1 2025   | 0.4      | Full document revision and restructuring |


[^1]:
    Historically, the seminar work from Alan Turing laid the foundation for exploring the possibilities of a thinking machine [@10.1093/mind/LIX.236.433].
    Subsequently, the development of AI had taken a symbolic approach, popularized
    through decision-tree reasonings and expert systems -- world representation through high-level and human-readable
    symbols to manipulate the results. Haugeland referred to these systems as Good Old-Fashioned AI (GOFAI) [@10.7551/mitpress/4626.001.0001]

    However, GOFAI presented its limitation and led us into a "AI Winter", largely due to the cynicism of the general research community
    as well as a reduction in funding at most research labs. [@handler2008avoidanotheraiwinter]

    Given the rise to Moore's Law and the expontential amount of computing and [[glossary#data|data]] a new approach
    centered around statistical methods and [[glossary#connectionism|connectionist]] networks arose, and referred as "New Fangled AI" (NFAI).
    Machine learning system nowadays are also known as NFAI systems.
