---
id: VnVReport
tags:
  - meta
author: aarnphm
date: "2024-09-16"
title: Verification and Validation Report
---

## Revision History

| Date          | Version | Notes              |
| :------------ | :------ | :----------------- |
| Sept. 16 2024 | 0.0     | Initial skafolding |
| Mar. 03 2025  | 0.1     | Rev0               |

## Symbols, Abbreviations and Acronyms

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
| tinymorph  | the text editor that helps you to become better writer |
| UC         | Unlikely Change                                        |

![[SRS/SRS#7.2 Data Dictionary|Data Dictionary]]

## Table of Contents

## List of Tables

## List of Figures

## Introduction

This document is intended to provide an overview of the testing that performed throughout the development of the project `tinymorph`, including the obtained results and the relevant discussions. The tests are under the guidance from [[VnVPlan/VnVPlan|VnVplan]].

## Functional Requirements Evaluation

## Nonfunctional Requirements Evaluation

### Usability

### Performance

### etc.

## Comparison to Existing Implementation

This section provides some comparisions between the two existing solutions and the current implementation of project `tinymorph`, focusing on funtionality and usability.

First solution: OpenAI's Chatgpt
- Functionality: have good performance on prompt-based conversation. Canvas feature make it easier for editing but project `tinymorph` provides suggestions as appliable notes to do selective modification on the content.
- Usability: the UI from OpenAI's Chatgpt's UI is imformative and organised to support conversation interface, and `tinymorph` put an emphasis on text-editor tailored interface to better support writing purpose

Second solution: prowritingaid
- Functionality: prowritingaid provides suggestions based on the text input for user as reference to make improvement, but `tinymorph` provides direct modification to the text content.
- Usability: prowritingaid currently supports more delicate unser interface on webserver compared to `tinymorph` to provide better user experience.

## Unit Testing

## Changes Due to Testing

- Interface structure improved for mobile use
- The disabled contents in the interface is adjusted with a more obvious contrast ratios to support contrast compliance
- Hover states improved to support darkmode 
- Front-end code is restructured lightly to deacrese the responding time
- More graphical hint and color hint is used to better support navigation and remove obstacles

## Automated Testing

## Trace to Requirements

## Trace to Modules

## Code Coverage Metrics

## Appendix --- Reflection

The information in this section will be used to evaluate the team members on the graduate attribute of Reflection.

1. What went well while writing this deliverable?
2. What pain points did you experience during this deliverable, and how did you resolve them?
3. Which parts of this document stemmed from speaking to your client(s) or a proxy (e.g. your peers)? Which ones were not, and why?
4. In what ways was the Verification and Validation (VnV) Plan different from the activities that were actually conducted for VnV? If there were differences, what changes required the modification in the plan? Why did these changes occur? Would you be able to anticipate these changes in future projects? If there weren't any differences, how was your team able to clearly predict a feasible amount of effort and the right tasks needed to build the evidence that demonstrates the required quality? (It is expected that most teams will have had to deviate from their original VnV Plan.)

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
1. The document is well organised under the plan of VnV, and the tracibility between the documents are clear to follow
2. The testing is hard to structure and perform due to the specialty of our project scale, especially for the inference module.
3. The non-founctional requirement relevant testing and following adjustment are largely based on the feedback from clients, for the goal that to make this project better fit into the user expectation with high usability. The unit testing is mainly constructed based the the group members' ideas due to the expertise and knowledge gap between the project developer and user.
4. There are a lot of the testcase deletion and modification haapened comparing to the original VnV plan, together with some more detailed and specific testing improvements due to the better understanding to the project along with the development procedure. The testcases after modification better fit into the purpose of verification and support the testing responsibility. 
</p>


</div>


</div>