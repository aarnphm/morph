---
id: Rev0_Team_Contrib
tags:
  - management
author: waleedmalik7
date: "2025-01-29"
title: "Team Contributions: Rev 0"
---

This document summarizes the contributions of each team member for the Rev 0 Demo. The time period of interest is the time between the POC demo and the Rev 0 demo.

## Demo Plans

We will be demonstrating the Frontend and Backend implementation of tinymorph, showcasing how the text editor and inference model work together. The demo will highlight how the text editor interacts with the inference model to generate sticky notes containing relevant text suggestions, which can be dragged and dropped into the editor to seamlessly continue the user's writing. While integration is ongoing, we will present both components separately and provide a preview of their combined functionality. By the final demonstration, we aim to have a fully functional system with real-time text generation and interactive writing assistance.

## Team Meeting Attendance

For each team member how many team meetings have they attended over the time period of interest. This number should be determined from the meeting issues in the team's repo. The first entry in the table should be the total number of team meetings held by the team.

| Student          | Meetings |
| ---------------- | -------- |
| Total            | 13       |
| Aaron (Anh) Pham | 11       |
| Nebras Khan      | 13       |
| Waleed Malik     | 11       |
| Zhiwei Li        | 13       |

The weekly stand-up meeting is agreed by team members as a time slot to sync up the development progress and any important information from TA meeting or lecture, along with the task divisions of the deliverables writing. It also sometimes works as a knowledge sharing session among group members to conduct Q&A about the backgroup theory of the project, when there is a mentioned research direction raised by the supervisor.

## Supervisor/Stakeholder Meeting Attendance

For each team member how many supervisor/stakeholder team meetings have they attended over the time period of interest. This number should be determined from the supervisor meeting issues in the team's repo. The first entry in the table should be the total number of supervisor and team meetings held by the team. If there is no supervisor, there will usually be meetings with stakeholders (potential users) that can serve a similar purpose.

| Student          | Meetings |
| ---------------- | -------- |
| Total            | 5        |
| Aaron (Anh) Pham | 3        |
| Nebras Khan      | 5        |
| Waleed Malik     | 4        |
| Zhiwei Li        | 5        |

The team has demonstrated a strong commitment to attending supervisor meetings with Dr. Swati Mishra and preparing for potential stakeholder interactions. Each member prioritized these meetings, and absences occurred only when significant obligations or emergencies arose. In such cases, members provided appropriate notice in advance, ensuring transparency and allowing the team to adjust as needed. This level of communication has helped maintain accountability and demonstrated each member's dedication to the project and to Dr. Mishra's guidance.

## Lecture Attendance

For each team member how many lectures have they attended over the time period of interest. This number should be determined from the lecture issues in the team's repo. The first entry in the table should be the total number of lectures since the beginning of the term.

| Student          | Lectures |
| ---------------- | -------- |
| Total            | 5        |
| Aaron (Anh) Pham | 4        |
| Nebras Khan      | 4        |
| Waleed Malik     | 4        |
| Zhiwei Li        | 5        |

The team incorperated the feedback from POC comments and had members attend and summarize the lectures to stay up to date with the latest in-class updates.

## TA Document Discussion Attendance

For each team member how many of the informal document discussion meetings with the TA were attended over the time period of interest.

| Student          | Lectures |
| ---------------- | -------- |
| Total            | 4        |
| Aaron (Anh) Pham | 2        |
| Nebras Khan      | 4        |
| Waleed Malik     | 3        |
| Zhiwei Li        | 4        |

The team has put in an effort to participate in the informal document discussion meetings with the TA, understanding their value for project improvement. Attendance levels varied, but those who were present contributed useful insights and shared notes with members who could not attend. Members who were unable to attend certain meetings had prior significant commitments and informed the team in advance. This proactive approach allowed the team to coordinate effectively, ensuring that feedback and insights from the TA discussions were shared and integrated into the project workflow.

## Commits

For each team member how many commits to the main branch have been made over the time period of interest. The total is the total number of commits for the entire team since the beginning of the term. The percentage is the percentage of the total commits made by each team member.

| Student          | Commits | Percent |
| ---------------- | ------- | ------- |
| Total            | 130     | 100%    |
| Aaron (Anh) Pham | 88      | 67%     |
| Nebras Khan      | 25      | 19%     |
| Waleed Malik     | 8       | 7%      |
| Zhiwei Li        | 9       | 7%      |

## Issue Tracker

For each team member how many issues have they authored (including open and closed issues (O+C)) and how many have they been assigned (only counting closed issues (C only)) over the time period of interest.

| Student          | Authored (O+C) | Assigned (C only) |
| ---------------- | -------------- | ----------------- |
| Aaron (Anh) Pham | 33             | 23                |
| Nebras Khan      | 7              | 5                 |
| Waleed Malik     | 11             | 5                 |
| Zhiwei Li        | 7              | 7                 |

The table records the commits initiated by each seperate team member. Aaron as team leader co-authors **most** group member's commits to make improvements and help to merge to the main branch, along with other commits for independent contributions of document and coding changes. For other group members, there is basically one or two commits for every document deliverable, containing more sub-patches of modification within a single commit with peer-review and modification. Furthermore, Zhiwei and Waleed did alot of the Design Documentation (MG and MIS) while Aaron and Nebras worked on starting the demo development.

## CICD

Our CI/CD pipeline for tinymorph is currently focused on the frontend, ensuring that the project builds successfully before deployment using Cloudflare Wrangler. Every push or pull request triggers an automated build validation to confirm the frontend compiles without errors, while Cloudflare Workers handle seamless deployment. As we continue development, we are actively working on integrating inference model testing and deployment into the pipeline. This will include automated model validation, API performance tracking, and Docker-based deployments, ensuring stable and efficient text generation alongside the frontend. These improvements will enhance system reliability and scalability, allowing for a more robust and automated development process.
If your team has additional metrics of productivity, please feel free to add them to this report.
