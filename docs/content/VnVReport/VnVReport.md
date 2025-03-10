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
After completing the usability tests, participants answer the ([[VnVPlan/VnVPlan#6.1 Usability Survey Questions]]) and rated their experience  on the following topics based on a 1–5 scale (1 = Poor, 5 = Excellent):  

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


### Performance

### etc.

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