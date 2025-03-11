---
id: VnVReport
tags:
  - meta
author: aarnphm
date: "2024-09-16"
title: Verification and Validation Report
---

## 1 Revision History

| Date          | Version | Notes              |
| :------------ | :------ | :----------------- |
| Sept. 16 2024 | 0.0     | Initial skafolding |

## 2 Symbols, Abbreviations and Acronyms

| symbol | description |
| :----- | :---------- |
| T      | Test        |
| UT      | Unit Test        |
| VnV      | Verification and Validation        |

symbols, abbreviations or acronyms -- you can reference the SRS tables if needed

## 3 Table of Contents

## 4 List of Tables

## 5 List of Figures

This document ...

## 6 Functional Requirements Evaluation

### 6.1 Planning and Suggestion Features

#### **Evaluation of Test-FR-P1/P3: Large Text Block Input**

**Test Description:**  
This combined test case validates that when planning mode is active, the system appropriately handles both a valid prompt and a large text block input. For a valid prompt (e.g., "environmental sustainability"), the system should promptly generate at least 5 relevant suggestions within 10 seconds (observed average ~8 seconds). For a large text block (500+ words) on climate change, the system should effectively process the input and either provide condensed suggestions or display a length warning—all within 10 seconds—to ensure robust handling of varied input lengths.

| **Criterion**                    | **Assessment Goal**                                                       | **Pass/Fail** |
|----------------------------------|---------------------------------------------------------------------------|---------------|
| Output Time < 10s                | Suggestions appear within an average of ~8 seconds                        | ✅ Pass       |
| 1 or more suggestion generated   | 5 suggestions are generated given the valid input                         | ✅ Pass       |
| Input Handling                   | The system effectively processes large inputs without performance degradation   | ✅ Pass       |
| Suggestions related to input     | The output is clear and relevant to the large input                       | ✅ Pass       |

#### **Evaluation of Test-FR-P2: Unintelligible Prompt**

**Test Description:**  
This test case validates that when an unintelligible prompt (e.g., "asdh123!@#") is entered in planning mode, the system correctly identifies the invalid input and displays an error message requesting input refinement.

| **Criterion**         | **Assessment Goal**                                                           | **Pass/Fail** |
|-----------------------|-------------------------------------------------------------------------------|---------------|
| Input Recognition     | The system accurately identifies the unintelligible prompt                    | ✅ Pass       |
| Error Message Display | An error message is displayed to prompt for input refinement                  | ✅ Pass       |
| Response Timing       | The error message is shown within 10 seconds                                  | ✅ Pass       |

### 6.2 Text Generation Features

#### **Evaluation of Test-FR-S1: Steering Validation (Didion Tone)**

**Test Description:**  
This test case verifies that when the steering feature is enabled and the "Didion" tone is selected with the prompt "reflection on modern life," the system generates text suggestions that accurately match Didion's writing style under specified lexical constraints.

| **Criterion**          | **Assessment Goal**                                                           | **Pass/Fail** |
|------------------------|-------------------------------------------------------------------------------|---------------|
| Steering Activation    | The steering feature is successfully enabled in the editor                  | ✅ Pass       |
| Tone Selection         | The "Didion" tone is correctly selected                                       | ✅ Pass       |
| Style Matching         | Generated suggestions align with Didion's writing style                       | ✅ Pass       |

#### **Evaluation of Test-FR-S2: Personalized Style Adaptation**

**Test Description:**  
This test case validates that when a user’s writing sample is provided, the system adapts its text generation to reflect the user's personal writing style. Customized suggestions should be generated within 30 seconds.

| **Criterion**             | **Assessment Goal**                                                           | **Pass/Fail** |
|---------------------------|-------------------------------------------------------------------------------|---------------|
| Input Sample Recognition  | The system accepts and processes the user's writing sample                    | ✅ Pass       |
| Style Adaptation          | Generated output reflects the user's personal writing style                   | ✅ Pass       |
| Response Timing           | Customized suggestions are produced within 30 seconds                         | ✅ Pass       |
| Output Relevance          | The suggestions are contextually appropriate and tailored to the sample       | ✅ Pass       |

### 6.3 Feedback Panel

#### **Evaluation of Test-FR-F1: LTR Feedback Panel Validation**

**Test Description:**  
This test case confirms that when user feedback (e.g., tone adjustment, alternative phrasing) is provided via the LTR feedback panel, the system updates the suggestions in real time with a clear preview.

| **Criterion**           | **Assessment Goal**                                                           | **Pass/Fail** |
|-------------------------|-------------------------------------------------------------------------------|---------------|
| Feedback Integration    | The system seamlessly accepts and integrates user feedback                    | ✅ Pass       |
| Real-time Update        | Suggestions update immediately upon receiving feedback                        | ✅ Pass       |
| Output Clarity          | Updated suggestions provide a clear and accurate preview of changes           | ✅ Pass       |
| Test Execution          | Manual test performed with LTR feedback panel active and initial suggestions  | ✅ Pass       |

### 6.4 Document Export Features

#### **Evaluation of Test-FR-E1/E2: Document Export Functionality Validation**

**Test Description:**  
This test case validates the document export capabilities. It verifies that a completed document can be exported in both PDF (formatted with preserved content) and plain text (raw text without formatting) formats, ensuring that content is accurately maintained.

| **Criterion**           | **Assessment Goal**                                                           | **Pass/Fail** |
|-------------------------|-------------------------------------------------------------------------------|---------------|
| PDF Export              | Selecting PDF export generates a PDF with preserved content                   | ✅ Pass       |
| Markdown Export         | Selecting markdown export produces a raw .md file with preserved content      | ✅ Pass       |
| Output Accuracy         | Exported documents accurately preserve the intended content's format          | ⚠️ Fail (formating issues with pdf format)       |

### 6.5 Interface Customization Features

#### **Evaluation of Test-FR-VT1: Theme Customization Validation**

**Test Description:**  
This test case verifies that the system allows users to switch from the default light theme to dark mode. The dark theme should be applied consistently across the interface, ensuring visual consistency and an improved user experience.

| **Criterion**          | **Assessment Goal**                                                           | **Pass/Fail** |
|------------------------|-------------------------------------------------------------------------------|---------------|
| Theme Switching        | The system successfully enables switching from light to dark mode             | ✅ Pass       |
| Visual Consistency     | The dark theme is applied consistently across all interface elements          | ✅ Pass       |


## 7 Nonfunctional Requirements Evaluation

### 7.1 Look and Feel

#### **Evaluation of Test-LF-A1**  

##### **Predefined UI/UX Checklist:**  
10 engineers and UI/UX experts reviewed and followed the criteria below, ensuring a thorough evaluation of `tinymorph` interface:  

| **Criterion** | **Assessment Goal** | **Pass/Fail** |
|--------------|---------------------|--------------|
| **Visual Consistency** | Typography, spacing, and layout remain uniform across screens. | ✅ Pass |
| **Non-Intrusiveness** | UI elements do not obstruct content or disrupt user flow. | ✅ Pass |
| **Minimalist Navigation** | Menu placement and structure enable efficient navigation. | ✅ Pass (minor improvement suggested for mobile) |
| **Content Focus** | Writing interface prioritizes user content with minimal distractions. | ✅ Pass |
| **Contrast & Readability** | Text contrast meets WCAG guidelines for accessibility. | ✅ Pass |
| **Responsive Adaptation** | UI scales correctly on different screen sizes without loss of functionality. | ✅ Pass (minor mobile optimization needed) |
| **Animation & Feedback** | Transitions and feedback animations are smooth and do not interfere with usability. | ✅ Pass |

##### **User Testing & Survey Results:**  
Participants then answer the ([[VnVPlan/VnVPlan#6.1 Usability Survey Questions]]) and rated their experience  on the following topics based on a 1–5 scale (1 = Poor, 5 = Excellent):  

| **Evaluation Metric** | **Average Rating (1–5)** |
|----------------------|--------------------------|
| Clarity of interface | **4.8** |
| Ease of navigation | **4.6** (some issues with mobile menus) |
| Non-intrusiveness | **4.9** |
| Responsiveness across devices | **4.7** (minor UI scaling issues noted) |
| Visual consistency | **4.9** |

##### **Key Observations & Findings:**  
- **High UI clarity and readability:** Users appreciated the clean layout and distraction-free experience, aligning with the project’s goals.  
- **Minimalist and focused design was well-received:** 90% of users found the UI uncluttered and intuitive.  
- **Mobile navigation needs slight improvement:** 20% of users on mobile devices noted that menus could be more prominent when resizing the screen.  
- **Animations and feedback were well-balanced:** No users found transitions or effects disruptive to the experience.  

#### **Evaluation of Test-LF-A2**  

##### **Predefined UI Audit Checklist:**  
The team manually reviewed the UI components using the design system documentation and WCAG Contrast Checker, ensuring alignment with the project's visual consistency goals.  

| **Criterion** | **Assessment Goal** | **Pass/Fail** |
|--------------|---------------------|--------------|
| **Typography Consistency** | Font families, sizes, and weights match design system guidelines. | ✅ Pass |
| **Color Palette Uniformity** | UI components adhere to the defined monotonic color scheme. | ✅ Pass |
| **Contrast Compliance** | Text and interactive elements meet WCAG 2.1 AA contrast ratios. | ✅ Pass (minor adjustment needed for disabled elements) |
| **Iconography & Symbols** | Icons follow a standardized visual language. | ✅ Pass |
| **Whitespace & Alignment** | Spacing ensures a clean, uncluttered layout. | ✅ Pass |
| **Dark & Light Mode Consistency** | Visual harmony is maintained across themes. | ✅ Pass (minor refinement needed in dark mode hover states) |
| **Error & Notification States** | Alerts and feedback indicators follow design system guidelines. | ✅ Pass |

##### **Validation with WCAG Contrast Checker:**  
The team ran manual contrast checks using a WCAG compliance tool to ensure accessibility standards were met.  

| **UI Element** | **Contrast Ratio** | **WCAG Compliance** |
|---------------|--------------------|--------------------|
| **Primary Text on Background** | **7.1:1** | ✅ AA & AAA |
| **Button Labels** | **4.8:1** | ✅ AA |
| **Links & Interactive Elements** | **5.3:1** | ✅ AA |
| **Disabled Elements** | **3.0:1** | ⚠️ Below AA (Requires Adjustment) |
| **Dark Mode Text on Background** | **6.5:1** | ✅ AA |

### 7.2 Usability and Humanity

#### **Evaluation of Test-UH-EOU3**  

Three users were assigned a creative writing task that required structuring ideas using tinymorph's planning interface. They were observed as they interacted with the interface, and their feedback was collected through survey responses and interviews.  

##### **Predefined Usability Checklist:**  
The following criteria were used to evaluate the effectiveness and intuitiveness of the planning interface:  

| **Criterion** | **Assessment Goal** | **Pass/Fail** |
|--------------|---------------------|--------------|
| **Ease of Use** | Users can quickly understand and utilize the planning interface. | ✅ Pass |
| **Navigation Clarity** | Features such as idea structuring, note organization, and visual flow are intuitive. | ✅ Pass |
| **Real-Time Adjustments** | Users can seamlessly modify, rearrange, and refine their plans. | ✅ Pass (minor UI delay when restructuring large sections) |
| **Content Linking** | Users can link plans to relevant text and ideas fluidly. | ✅ Pass |
| **Distraction-Free UI** | The interface does not interfere with the writing flow. | ✅ Pass |

##### **User Feedback from Surveys and Interviews:**  
Participants then answer the ([[VnVPlan/VnVPlan#6.1 Usability Survey Questions]]) and users rated their experience on a 1–5 scale (1 = Poor, 5 = Excellent):  

| **Evaluation Metric** | **Average Rating (1–5)** |
|----------------------|--------------------------|
| Ease of organizing writing steps | **4.7** |
| Clarity of navigation | **4.5** (users found some advanced features less intuitive) |
| Ability to refine structure seamlessly | **4.6** |
| Efficiency in modifying writing plans | **4.7** |
| Overall satisfaction with planning workflow | **4.8** |

##### **Key Takeaways from Interviews:**  
- Users found the interface intuitive and effective for structuring writing, but some needed extra time to explore all available planning features.  
- One user mentioned they expected a clearer visual indicator when dragging and rearranging planning elements, suggesting that adding hover feedback or snap alignment guides would improve clarity.  
- Keyboard shortcuts were underutilized, with one user stating: *"I didn’t realize I could use shortcuts until I accidentally triggered one for opening the notes panel. Having a list or hint somewhere would be useful."*  
- The linking function between plans and text worked well, though one user suggested allowing bulk linking to multiple sections at once.  
- Minor UI performance delays were observed when rearranging larger content structures, though they did not disrupt the overall workflow.  

#### **Evaluation of Test-UH-L1**  

##### **Testing Setup:**  
Three new users with no prior experience with `tinymorph` were given access to the application without instructions. Their time to first content creation was recorded, and feedback was collected via surveys.  

##### **Onboarding Time Results:**  
Each user’s time to begin writing or editing content was measured:  

| **User** | **Onboarding Time** | **Met 10-Minute Goal?** |
|---------|--------------------|--------------------|
| **User 1** | 7 minutes 32 seconds | ✅ Yes |
| **User 2** | 9 minutes 10 seconds** | ✅ Yes |
| **User 3** | 8 minutes 45 seconds | ✅ Yes |

##### **Predefined Usability Checklist:**  
The following criteria were used to assess onboarding efficiency and initial usability:  

| **Criterion** | **Assessment Goal** | **Pass/Fail** |
|--------------|---------------------|--------------|
| **Navigation Clarity** | Users can easily locate key writing and editing functions. | ✅ Pass |
| **First Task Completion** | Users successfully start writing or editing within 10 minutes. | ✅ Pass |
| **Minimal Guidance Needed** | Users require little to no assistance to begin. | ✅ Pass |
| **Intuitive UI** | Users can recognize and understand core functions immediately. | ✅ Pass |
| **No Major Obstacles** | Users do not encounter critical usability roadblocks. | ✅ Pass (some minor confusion with advanced features) |

##### **User Feedback from Surveys:**  
Participants then answer the ([[VnVPlan/VnVPlan#6.1 Usability Survey Questions]]) and users rated their onboarding experience on a 1–5 scale (1 = Poor, 5 = Excellent):  

| **Evaluation Metric** | **Average Rating (1–5)** |
|----------------------|--------------------------|
| Ease of finding key features | **4.5** |
| Clarity of interface | **4.8** |
| Time taken to start writing | **4.6** |
| Overall onboarding experience | **4.7** |

#### **Evaluation of Test-UH-A2**  

##### **Testing Setup:**  
The team conducted a manual keyboard accessibility test on the tinymorph editor to assess whether all interactive components could be accessed and used without a mouse. The test included vim bindings, core shortcuts, and general keyboard navigation.  

##### **Keyboard Navigation Test Results:**  

| **Task** | **Shortcut Used** | **Accessible via Keyboard?** |
|----------|------------------|----------------------------|
| **Toggle Notes Panel** | `Cmd + [shortcut]` (Mac) / `Ctrl + [shortcut]` (Windows/Linux) | ✅ Pass |
| **Toggle Edit/Read Mode** | `Cmd + [shortcut]` (Mac) / `Alt + [shortcut]` (Windows/Linux) | ✅ Pass |
| **Save Document** | `Cmd+S` (Mac) / `Ctrl+S` (Windows/Linux) | ✅ Pass |
| **Vim Keybinding: Save** | `:w` or `:wa` | ✅ Pass |
| **Vim Keybinding: Escape Mapping** | `jj` or `jk` in insert mode | ✅ Pass |
| **Vim Keybinding: Command Mode Mapping** | `;` mapped to `:` | ✅ Pass |
| **Focus Traversal (Tab & Shift+Tab)** | Navigate through UI components | ✅ Pass |
| **Access File Menu & Settings** | Keyboard shortcuts & Tab navigation | ✅ Pass |
| **Vault Directory Navigation** | No shortcut available | ❌ Fail |

##### **Predefined Accessibility Checklist:**  
| **Criterion** | **Assessment Goal** | **Pass/Fail** |
|--------------|---------------------|--------------|
| **All core writing functions are accessible via keyboard** | Users can perform major actions (edit, save, toggle modes) with shortcuts. | ✅ Pass |
| **Vim keybindings function correctly** | Vim-inspired users can navigate efficiently using familiar shortcuts. | ✅ Pass |
| **No-mouse usability** | Users can operate the editor without touching the mouse. | ✅ Pass |
| **Tab navigation works across all UI elements** | Pressing Tab/Shift+Tab cycles through interactive components. | ✅ Pass |
| **Vault directory is keyboard accessible** | Users can navigate vault directories using shortcuts. | ❌ Fail (No shortcut available) |

### 7.3 Performance

### 7.4 Security

### 7.5 Maintainability and Support

### **Evaluation of Test-OER-MR1**  

#### **Security Audit & Maintenance Review**  

To ensure `tinymorph` remains secure and updated, a security audit was conducted using `pnpm audit`. This aligns with the maintenance schedule and ensures vulnerabilities are proactively identified and mitigated.  

**Audit Results Summary:**  
- **Total vulnerabilities detected:** 3  
- **Severity level:** Moderate  
- **Affected Packages:** `dompurify`, `esbuild`  
- **Patched Versions Available:** `>=3.2.4` for `dompurify`, `>=0.25.0` for `esbuild`  

**Security Audit Report Output:**  
![[VnVReport/audit_output.png]]

#### **Observations & Findings**  

- Security scans are properly integrated into the project's CI/CD pipeline.  
- Moderate vulnerabilities remain unresolved, requiring further investigation into package dependencies.  
- Automated auditing is functioning correctly, detecting and tracking issues as expected.  
- Next Steps involve further investigation is needed to check for upstream dependency conflicts and may require an appropriate mitigation strategy.  

### 7.6 Compliance

## 8 Comparison to Existing Implementation

This section will not be appropriate for every project.

## 9 Unit Testing

## 10 Changes Due to Testing

This section should highlight how feedback from the users and from the supervisor (when one exists) shaped the final product. In particular the feedback from the Rev 0 demo to the supervisor (or to potential users) should be highlighted.

## 11 Automated Testing

## 12 Trace to Requirements

## 13 Trace to Modules

## 14 Code Coverage Metrics

## Appendix --- Reflection

<!--
The information in this section will be used to evaluate the team members on the graduate attribute of Reflection.

1. What went well while writing this deliverable?
2. What pain points did you experience during this deliverable, and how did you resolve them?
3. Which parts of this document stemmed from speaking to your client(s) or a proxy (e.g. your peers)? Which ones were not, and why?
4. In what ways was the Verification and Validation (VnV) Plan different from the activities that were actually conducted for VnV? If there were differences, what changes required the modification in the plan? Why did these changes occur? Would you be able to anticipate these changes in future projects? If there weren't any differences, how was your team able to clearly predict a feasible amount of effort and the right tasks needed to build the evidence that demonstrates the required quality? (It is expected that most teams will have had to deviate from their original VnV Plan.)
-->

<div class="reflection-container">

<div class="users">
  <a class="name" href="https://github.com/aarnphm">Aaron</a>
</div>

<div class="blob">


</div>

</div>

<br/>

<div class="reflection-container">

<div class="users">
  <a class="name" href="https://github.com/nebrask">Nebras</a>
</div>

<div class="blob">

1. One of the things that went well in writing this deliverable was the structured approach we took to verifying `tinymorph` usability, accessibility, and design consistency. By leveraging well-defined test cases from the VNV Plan and refining them based on real-world testing constraints, we were able to document clear and evidence-backed evaluations. The use of predefined checklists, usability surveys, and direct user feedback ensured that each test provided actionable insights rather than just pass/fail outcomes. Additionally, the collaborative nature of the process, where different team members took responsibility for specific evaluations allowed us to work efficiently and maintain consistency across sections.
<br/>

2. One of the primary challenges was balancing the scope of testing with the time and resources available. Initially, we planned to conduct a broad range of tests covering various aspects of UI/UX, accessibility, and system performance. However, we realized that certain test cases overlapped significantly, leading to redundant efforts. For example, specific tests involving "Validate Minimalist Design with a Monotonic Color Palette" and "Test Responsiveness Across Devices and Orientations" were removed since their objectives were already covered in "Verify Unified, Non-Intrusive, and Uncluttered Visual Design" (Test-LF-A1). To address this, we consolidated tests where possible, ensuring that each evaluation provided unique and meaningful results. Additionally, we encountered minor inconsistencies in test execution methods, which were resolved through team discussions and alignment on a unified testing approach.
<br/>

3. The usability and accessibility evaluations, particularly those concerning keyboard navigation, onboarding, and the planning interface, were heavily influenced by direct interactions with our test users such as engineers, UI/UX experts, and fellow students from our program. Their feedback played a crucial role in refining our understanding of real-world usage challenges, which we then incorporated into the evaluation. In contrast, sections related to visual consistency, UI audits, and adherence to accessibility standards were primarily derived from internal documentation, predefined design principles, and testing tools. These areas did not require external input as they were based on established guidelines and could be validated using structured criteria rather than subjective user experiences.
<br/>

4. There were notable differences between the original VnV Plan and the actual activities conducted mainly due to the need for efficiency and prioritization. Several test cases were removed or merged to avoid redundancy, particularly where different tests covered overlapping aspects of UI design and responsiveness. Additionally, some planned evaluations required adjustments based on practical constraints such as the availability of test users and the feasibility of automated tools. While our initial plan aimed to be comprehensive, real-world testing conditions required us to be more selective in how we allocated time and effort. Moving forward, these experiences will help us anticipate such adjustments in future projects by incorporating flexibility into the planning phase, ensuring that our test cases are both thorough and practical within the given constraints.


</div>

</div>

<br/>

<div class="reflection-container">

<div class="users">
  <a class="name" href="https://github.com/waleedmalik7">Waleed</a>
</div>

<div class="blob">

</div>

</div>

<br/>

<div class="reflection-container">

<div class="users">
  <a class="name" href="https://github.com/lucas-lizhiwei">Lucas</a>
</div>

<div class="blob">

<p>
</p>

</div>

</div>