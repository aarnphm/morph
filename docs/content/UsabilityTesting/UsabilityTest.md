---
id: UsabilityTest
tags:
  - meta
author: aarnphm,waleedmalik7,nebrask,lucas-lizhiwei
date: "2024-09-16"
modified: 2025-04-05 00:29:38 GMT-04:00
title: Usability Testing
---

## Revision History

| Date       | Developer(s)                                | Change                   |
| ---------- | ------------------------------------------- | ------------------------ |
| 2025-04-02 | aarnphm,waleedmalik7,nebrask,lucas-lizhiwei | Added raw usibility test |
| 2025-04-04 | aarnphm,waleedmalik7,nebrask,lucas-lizhiwei | Refined Usibility Test   |

## Evaluation Instrument and Structure

The evaluation was structured into the following segments:

- **Introduction**
- **Pre-Evaluation Questions**
- **Task Evaluation (Think-Aloud Protocol & Observations)**
- **Post-Task Questions**
- **Post-Evaluation Questions**
- **Summary of Evaluation Process, Key Insights, and Corrective Actions Implemented**

---

## 1. Introduction

This report documents the usability testing of Morph – an AI-driven, web-based text editor that offers context-aware suggestions to enhance your writing. Morph’s latest iteration has addressed several previously identified gaps, including improvements in vault creation, AI suggestion relevance, and interface clarity. This evaluation was conducted after the Demo of Revision 0. We reconvened with the same 10 participants—comprising a law student, software engineering students, machine learning/AI engineers, and writers with non-technical backgrounds—across multiple sessions (early March, late March, and early April 2025). Significant enhancements have now been implemented, resulting in a nearly seamless user experience with minimal usability gaps.

---

## 2. Pre-Evaluation Questions

Prior to the testing sessions, participants were asked the following questions to gauge their current workflow and expectations:

- How frequently do you use text editors for creative or academic writing?
- What are the biggest challenges you face when organizing or editing your documents?
- Have you used any AI-powered writing tools before? What issues did you encounter?
- How critical is local data storage and privacy in your workflow?
- Which features do you consider essential in an ideal text editor with AI assistance?

---

## 3. Task Evaluation (Think-Aloud Protocol & Observations)

During the sessions, participants were instructed to perform a series of tasks while verbalizing their thought process. The tasks were designed to assess various aspects of Morph’s interface and functionality.

### Task 1: Accessing Morph and Creating a Vault

- **Scenario:**
  "Navigate to the Morph website, acknowledge the disclaimer, and create a new vault by selecting an empty directory or one containing only Markdown files."
- **Expected Steps:**
  1. Open [https://morph-editor.app/](https://morph-editor.app/) in a supported browser.
  2. Click the **Green Button** to access the Vault Selection page.
  3. Acknowledge the disclaimer by clicking **“I acknowledge”**.
  4. Select a directory that meets the vault criteria.
- **Pre-Improvement Observations (Early March: March 2, 2025; March 5, 2025; March 8, 2025):**
  Participants reported that the visual cues during vault creation were minimal and unclear. The instructions regarding privacy and directory requirements were not prominently displayed, leading to confusion about which directories qualified.
- **Post-Improvement Observations (Late March: March 26, 2025; Early April: April 1, 2025):**
  Users noted that the enhanced visual cues (arrows, icons) and clearer instructions made the vault creation process significantly more intuitive. All participants easily identified and selected appropriate directories, and the privacy rules were well communicated.

---

### Task 2: Editing a Document in the Markdown Text Editor

- **Scenario:**
  "Open a new Markdown file, edit the content using the text editor, and render the Markdown using the provided shortcut."
- **Expected Steps:**
  1. Create a new file within the vault.
  2. Input content using Markdown formatting.
  3. Render the Markdown using `Alt + e` (or `Cmd + e` on Mac).
- **Pre-Improvement Observations (Early March):**
  Users experienced delays in rendering their Markdown content. The AI-generated suggestions were not strongly linked to the content, as the embeddings similarity check was active in the background but offered no visual feedback.
- **Post-Improvement Observations (Late March/Early April):**
  Participants liked the immediate rendering feedback. The improved embeddings similarity check now delivers highly relevant AI suggestions, with clear visual cues indicating its impact on suggestion relevance.

---

### Task 3: Interacting with AI Suggestions and the Reasoning Panel

- **Scenario:**
  "While editing, review the AI-generated notes and access the Reasoning section to understand the rationale behind suggestions."
- **Expected Steps:**
  1. Compose a paragraph in the text editor.
  2. Observe the AI-generated suggestions in the Right Panel.
  3. Click a note to view the Reasoning details, which should highlight the area of the text that best matches the suggestion.
- **Pre-Improvement Observations (Early March):**
  Previously, clicking on a note produced no visual indication of the corresponding text. The Reasoning panel offered overly technical details that were not easily understandable for non-technical users.
- **Post-Improvement Observations (Late March/Early April):**
  The updated Reasoning panel now simplifies technical details into plain language and highlights the matching section of text when a note is clicked. This improvement significantly increased user confidence and transparency in the AI’s suggestions.

---

### Task 4: Customizing Settings and Keyboard Shortcuts

- **Scenario:**
  "Open the Settings panel, adjust the theme, and review the keyboard shortcuts."
- **Expected Steps:**
  1. Navigate to the Settings panel via the left panel icon.
  2. Switch between Light and Dark modes.
  3. Review and modify keybindings in the Hotkeys section.
- **Pre-Improvement Observations (Early March):**
  Users found that the Settings panel lacked real-time visual feedback and had limited customization options. Adjusting keybindings was not very intuitive, and changes did not immediately reflect on the interface.
- **Post-Improvement Observations (Late March/Early April):**
  Participants observed that settings changes now update in real time. The expanded customization options, including the ability to reset settings to default, were well received, and the panel’s layout was noted to be clear and user-friendly.

---

## 4. Post-Task Questions

After each task, participants rated their experience using a Likert scale (1 to 5, where 1 = very poor and 5 = excellent):

- **Ease of Task Completion:** How easy was it to complete the task?
- **Interface Clarity:** How clear and intuitive was the interface during the task?
- **Feature Accessibility:** How accessible were the features needed to complete the task?
- **Overall Satisfaction:** How satisfied are you with the experience of completing this task?

---

## 5. Post-Evaluation Questions

Upon completion of all tasks, participants were asked the following open-ended questions:

- How do you compare the new AI suggestion relevance with your previous experience?
- What are your overall impressions of Morph’s current interface and workflow?
- Which feature do you find most valuable, and why?
- What improvements, if any, do you still feel could further enhance your experience?
- How would you rate the effectiveness of the Reasoning panel in clarifying AI suggestions, particularly the new feature that highlights the matching text?

---

## 6. Summary of Evaluation Process and Corrective Actions Implemented

### Session Details

- **Duration per Session:** 15–20 minutes
- **Session Dates:** Sessions were conducted on various dates between February 27, 2025 and April 2, 2025.
  _Example Dates:_ Early March (March 2, March 5, March 8, 2025); Late March (March 26, 2025); Early April (April 1, 2025).
- **Participation Method:**
  - **Law School Student (x1):** Participated via Discord.
  - **Software Engineering Students (x3):** Participated in person.
  - **Machine Learning/AI Engineers (x2):** Participated via Microsoft Teams.
  - **Writers with Non-Technical Background (x4):** Participated via Discord.
- **Context:** All sessions were conducted after the Demo of Revision 0. The evaluation focused on verifying that previously identified usability gaps have been corrected.

### Key Insights and Issues Addressed

- **Vault System Improvements:**

  - **Previous Issue:** Users found the vault creation process unclear due to insufficient visual cues and ambiguous instructions regarding directory requirements.
  - **What Was Fixed:** Enhanced visual cues (including arrows and icons) and clearer, more prominent instructions have been implemented. Users now easily understand the criteria for directory selection, ensuring proper vault setup.

- **AI Suggestions & Reasoning Panel Enhancements:**

  - **Previous Issue:** The technical language in the Reasoning panel was overly complex, and the embeddings similarity check provided no visual feedback when notes were clicked.
  - **What Was Fixed:** The Reasoning section now offers simplified, natural language summaries, and clicking on a note highlights the corresponding section of text. This visual enhancement has markedly improved the clarity and contextual relevance of AI-generated suggestions.

- **Interface & Navigation Enhancements:**

  - **Previous Issue:** Minor navigation challenges and insufficient real-time feedback in the Settings panel hampered the user experience.
  - **What Was Fixed:** The interface has been refined with improved navigation elements, intuitive icons, and real-time visual feedback. These changes have resulted in a smoother, more responsive user experience.

- **Settings Customization:**
  - **Previous Issue:** Limited customization options and difficulty resetting settings were noted.
  - **What Was Fixed:** Additional customization features, including a reset-to-default option, have been integrated. These improvements provide users with greater control over their environment and enhance overall usability.

---

## 7 Evaluation Objectives

- **Assess Overall Usability:**
  Determine how intuitively users can navigate Morph, complete writing tasks, and utilize AI-driven suggestions.

- **Measure Interface Clarity:**
  Identify which elements of the interface are clear and how improvements have enhanced clarity.

- **Verify Feature Effectiveness:**
  Evaluate the impact of the full embeddings similarity check on the relevance of AI suggestions.

- **Gauge Satisfaction with Customization:**
  Understand user satisfaction with the updated Settings panel and keyboard shortcut features.
- **Confirm Resolution of Previous Issues:**
  Validate that the corrective actions implemented have effectively addressed prior usability gaps.

---

## 8 Evaluation Results

### Quantitative Findings (Average Likert Scores)

| Metric                | Average Score |
| --------------------- | ------------- |
| Task Completion Ease  | 4.5/5         |
| Interface Clarity     | 4.8/5         |
| Feature Accessibility | 4.6/5         |
| Overall Satisfaction  | 4.7/5         |

### Qualitative Insights

- **Vault Creation:**
  Post-improvement feedback indicated that users found the vault creation process straightforward and appreciated the clear visual guidance and instructions.
- **AI Suggestions & Reasoning Panel:**
  The improved embeddings similarity check, with visual feedback highlighting matching text, received high praise. Both technical and non-technical users noted the clear, simplified summaries in the Reasoning panel, which greatly increased their trust in the AI suggestions.
- **Navigation and Settings:**
  The refined interface and expanded customization options significantly improved user satisfaction, with real-time feedback now enabling a smoother experience.
- **Overall Experience:**
  All participant groups reported a positive overall experience, with minimal issues noted during the evaluation.

---

## 9 Conclusion

The usability testing of Morph's latest iteration confirms that the majority of previously identified gaps have been successfully addressed. The enhancements implemented in the vault system, AI suggestion relevance, and overall interface clarity have resulted in a highly intuitive and responsive user experience. Notably, the new functionality in the embeddings system—where clicking on a note now highlights the matching section of text—has markedly improved the transparency and contextual accuracy of AI-generated suggestions. Feedback from the same 10 participants, reconvened across sessions in early March, late March, and early April 2025, indicates that Morph now meets or exceeds usability expectations. All corrective actions have been validated, and the product is ready for broader deployment with confidence in its current design and functionality.
