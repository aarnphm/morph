---
id: UserGuide
tags:
  - meta
author: aarnphm,waleedmalik7,nebrask,lucas-lizhiwei
date: "2024-09-16"
title: User Guide
---

## Revision History

| Date  | Developer(s) | Change                 |
| ----- | ------------ | ---------------------- |
| 2025-04-01 | aarnphm,waleedmalik7,nebrask,lucas-lizhiwei | Created Basics of the User Manual |
| 2025-04-04 | aarnphm,waleedmalik7,nebrask,lucas-lizhiwei | Refined Manual Features  |


## 1 Legal and Copyright Information

This copy of Morph (“the Software Product”) and its accompanying documentation is licensed and not sold. Morph and all associated components are protected by copyright laws, treaties, and other intellectual property statutes. The Morph Team, along with its subsidiaries, affiliates, and suppliers (collectively “Morph Team”), retains all intellectual property rights in the Software Product. Your license to download, install, use, copy, or modify Morph is subject to these rights and to all the terms and conditions set forth in this End User License Agreement (“Agreement”).

### 1.0 Acceptance and Consent

Upon launching Morph, you will be presented with an acknowledgment pop-up that outlines these terms and disclaimers. By clicking the “I Acknowledge” button on this pop-up, you confirm that you have read, understood, and agreed to be bound by all the terms and conditions of this Agreement. Your consent through this acknowledgment is a legally binding acceptance of this Agreement.

### 1.1 Restrictions on Use

You may not decompile, reverse-engineer, disassemble, or otherwise attempt to derive the source code for the Software Product. You may not use any part of Morph’s underlying technology in connection with any other software product or service without explicit written consent from the Morph Team.

### 1.2 Restrictions on Alteration

You may not modify, adapt, or create derivative works of the Software Product or its documentation, including but not limited to translations, without express permission from the Morph Team. This restriction includes any alterations to files, libraries, or databases that are part of the Software Product.

### 1.3 Disclaimer of Warranties and Limitation of Liability

UNLESS OTHERWISE EXPRESSLY AGREED TO IN WRITING BY THE MORPH TEAM, THE SOFTWARE PRODUCT IS PROVIDED “AS IS” AND WITHOUT ANY WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NONINFRINGEMENT. THE MORPH TEAM DOES NOT WARRANT THAT THE SOFTWARE PRODUCT WILL MEET YOUR REQUIREMENTS, BE ERROR-FREE, SECURE, OR UNINTERRUPTED. YOU ARE SOLELY RESPONSIBLE FOR DETERMINING WHETHER THE SOFTWARE PRODUCT IS SUFFICIENTLY SAFE AND EFFECTIVE FOR YOUR NEEDS, AND YOU ASSUME ALL RISKS ASSOCIATED WITH ITS USE.  
IN NO EVENT SHALL THE MORPH TEAM, ITS OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING LOST PROFITS OR BUSINESS INTERRUPTION, ARISING OUT OF OR IN CONNECTION WITH THIS AGREEMENT OR THE USE OF THE SOFTWARE PRODUCT, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

### 1.4 Governing Law and Jurisdiction

This Agreement is governed by and construed in accordance with the laws of the Province of Ontario, without regard to its conflict of law principles. Any disputes arising out of or relating to this Agreement shall be resolved exclusively in the courts located in Hamilton, Ontario, Canada.

### 1.5 Severability

If any provision of this Agreement is held to be invalid or unenforceable, the remaining provisions shall remain in full force and effect. Any express or implied restrictions not permitted by applicable law shall be enforced to the maximum extent possible.

## 2 Introduction

Morph is an AI-driven text editor designed to help you plan, structure, and refine your writing by offering context-aware suggestions in the form of notes and outlines. This user guide is intended to help you, the end user, become acquainted with Morph’s essential features and benefits, providing you with the knowledge to effectively harness its advanced text-generation capabilities. Built with a file-over-app philosophy, Morph ensures your work remains stored locally on your device, giving you full control over your data while leveraging the power of AI to enhance your creativity. Whether you’re a novelist, blogger, or technical writer, Morph adapts to your unique style preferences, helping you overcome writer’s block, refine ideas, and maintain coherence in your projects. By following the guidance outlined here, you can seamlessly integrate Morph into your workflow, using its interpretive features and style adjustments to craft content that remains true to your personal voice.

## 3 Definitions

### 3.0 Abbreviations and Acronyms

| Acronym/Abbreviation | Definition                        |
|----------------------|-----------------------------------|
| AI                   | Artificial Intelligence           |
| API                  | Application Programming Interface |
| CD                   | Continuous Deployment             |
| EULA                 | End User License Agreement        |
| OS                   | Operating System                  |

### 3.1 Glossary of Terms

| Term             | Definition                                                                                                               |
|------------------|--------------------------------------------------------------------------------------------------------------------------|
| **Morph**        | The web-based, AI-driven text editor described in this guide, which provides context-aware suggestions to enhance your writing.                   |
| **Tinymorph**    | An alternate name for Morph, used interchangeably in some contexts.                                                                              |
| **Vault**        | The primary workspace within Morph that contains directories of Markdown files. Only empty directories or those exclusively containing Markdown files may be added to ensure privacy. |
| **File-over-app**| A design philosophy where all files are stored locally on your device rather than in a centralized database, ensuring user data privacy.         |
| **Inference Server** | The backend service that processes AI-driven suggestions and generates notes based on your current text in the editor.                         |
| **Notes**        | AI-generated suggestions and outlines that appear in Morph’s interface to help refine and structure your writing.                                  |
| **Steering**     | The panel controls that allow you to adjust the AI's behavior—such as tonality and reasoning—to better align with your creative objectives.       |
| **Reasoning**    | The section within Morph's AI that explains the thought process behind its suggestions, enabling you to review and validate the generated ideas.  |


## 4 Accessing Morph

### 4.0 Requirements and Precautions

#### Operating Systems

Morph is entirely web-based and works on any operating system—Windows, Mac, or Linux—so long as you have a stable internet connection.

#### Browser Compatibility 

- **Supported:** Modern Chromium-based browsers (e.g., Chrome, Edge) or any browser that fully implements `queryPermission()` or equivalent file-access APIs.
- **Partially Supported:** Firefox may provide some degree of compatibility, but features could vary based on its implementation of file system permissions.
- **Not Supported:** Safari currently does not support the permissions required for Morph to access your local files.

> **Note:**  
> See Section 8 - Appendix to see entire list of supported browsers.


#### Internet Connection

A reliable internet connection is essential. Morph fetches AI-driven suggestions in real time, so intermittent or slow connectivity may affect performance.

#### Disk Space

Because Morph follows a file-over-app philosophy, all documents and newly created files are stored locally on your machine. Make sure you have enough free space for creating, editing, and saving files.

### 4.1 Browsers and Permissions

Morph relies on certain experimental browser APIs—like `queryPermission()`—to request and manage local file access. This functionality allows Morph to read and write files on your device without uploading them to external servers. For best results:

- **Update Your Browser:** Ensure you are running the latest version of Chrome, Edge, or another Chromium-based browser.
- **Check Permissions:** When prompted by the browser, grant Morph permission to access a directory. These permissions are crucial for the editor to open, edit, and save documents directly to your device.


## 5 Getting Started

### 5.0 Start

To access the Morph starting page, navigate to [https://morph-editor.app/](https://morph-editor.app/) in your supported browser. Once the page loads, look for the **Green Button** located in the bottom-right corner of the screen, as shown in **Figure 1**. Clicking this button takes you to the **Vault Selection** page, where you can create a new vault or open an existing one.

![Figure 1](<Figure 1.png>)

Upon your first visit, a **Disclaimer** pop-up will appear (see **Figure 2**). To proceed beyond this screen, you must click **“I acknowledge”** if you agree to the terms of Morph. Only after acknowledging the disclaimer will you gain full access to the rest of the application.

![Figure 2](<Figure 2.png>)

### 5.1 Vault

The **Vault** is the primary workspace within Morph, containing the directories you’ve selected for storing and editing Markdown files. After arriving on the Vault page, you can click the **Green Button** (see **Figure 3**) to open a local directory:

![Figure 3](<Figure 3.png>)

Upon doing so, you may see a browser prompt requesting permission for Morph to view files in that directory (see **Figure 4**). Clicking **“View Files”** grants Morph the necessary access to read and write your Markdown files.

![Figure 4](<Figure 4.png>)

> **Important Note:**  
> For your privacy and security, only **empty directories** or directories **containing exclusively Markdown files** can be added to the Vault. This restriction ensures that Morph never gains access to any unrelated or sensitive data stored elsewhere on your device.

### 5.3 Main

The **Main Page** greets you with a text editor prompting, “What’s on your mind?” in the central area **(2)**. This layout is divided into three key sections:

1. **Left Panel (1)**  
   - Access **New File** creation  
   - Return to the **Home** page  
   - View **Keyboard Shortcut** information  
   - Open **Settings**  
   - Quickly toggle or focus on these features using another keyboard shortcut (`Cntrl + b`) or (`Cmd + b`)

2. **Text Editor (2)**  
   - Compose and refine your text directly in the central editor  
   - Morph’s AI-driven suggestions and outlines will appear in the **Right Panel** (3) as you write

3. **Right Panel (3)**  
   - Houses **AI Reasoning**, **Notes**, and the **Steering** menu  
   - Quickly toggle or focus on these features using another keyboard shortcut (`Cntrl + i`) or (`Cmd + i`)

![Figure 5](<Figure 5.png>)

By organizing your workspace into these three sections, Morph provides an intuitive way to write, review suggestions, and manage files or settings—all within a single, distraction-free environment.

### 5.4 Middle: Markdown Text Editor

The **Markdown Text Editor** is where your creative process comes to life. By default, any changes you make in the editor apply to a new file. The editor supports all standard Markdown formatting—including headings, lists, links, and more—providing you with the flexibility to structure your content as you see fit.

To quickly render your Markdown content, use the following shortcuts:
- **Windows/Linux:** Press `Alt + e`
- **MacOS:** Press `Cmd + e`

Every edit you make in the text editor is considered by the AI, ensuring that its suggestive notes and outlines are tailored to your current content.

**Example Render Process:**

**Before Render:**

![Figure 7](<Figure 7.png>)

**After Render:**

![Figure 8](<Figure 8.png>)

### 5.4 Left Panel: Directory Tree

To open the directory tree, click the panel icon at the top left of the screen. As shown in **Figure 6**, all subdirectories and Markdown files within your vault are displayed in a hierarchical list (e.g., “Essay_1,” “Essay_2,” etc.). Clicking any file name opens it in the main editor for viewing or editing. This structure makes it easy to organize and navigate multiple writing projects within Morph, ensuring you always know where your files reside and how to access them quickly.

![Figure 8](<Figure 8.png>)

### 5.5 Left Panel: Settings

The **Settings** panel in Morph is your central hub for customizing your writing environment. Accessible via the panel icon on the left, this section provides a wide range of configuration options that allow you to tailor Morph to your personal workflow and preferences.

![Figure 9](<Figure 9.png>)

#### General Tab

Within the **General** tab, you can find links to external resources:
- **GitHub** – Contribute or open new issues related to Morph’s development.
- **Documentation** – Access user manuals for in-depth guidance.
- **Engineering** – Explore engineering-focused references or advanced usage details.

![Figure 10](<Figure 10.png>)


#### Editor Settings

In the **Editor** tab, you can fine-tune how Morph looks and behaves while you write:
- **Theme and Appearance**  
  Choose between **Light**, **Dark**, or **System** mode to optimize visual comfort.
- **Vim Mode**  
  Enable or disable **Vim key bindings** for text editing, allowing you to navigate and modify text using familiar Vim shortcuts if desired.

![Figure 11](<Figure 11.png>)

#### Keyboard Shortcuts

The **Hotkeys** section allows you to view all the current keybindings, and you can modify them to match your personal preferences for quick access to commonly used functions.

![Figure 12](<Figure 12.png>)

By using the Settings panel, you can create a more **accessible** writing environment that enhances both your productivity and creative flow. All changes are applied in real time, allowing you to experiment with different configurations and instantly see the impact on your workspace.

### 5.6 Right Panel: Notes

### 5.7 Right Panel: Steering 

## 6 Troubleshooting

### 6.0 Vault Issues: Cannot Add Vault System Files

Morph’s number one priority is ensuring that your data remains private and secure. To maintain this security:
- **Directory Requirements:** Only add **empty directories** or directories that exclusively contain Markdown files. This restriction is in place to ensure that Morph never gains access to any unrelated or sensitive data on your device.
- **Action:** If you encounter issues when trying to add a vault, double-check that the directory you’re selecting meets these criteria.

### 6.1 Notes Not Generating

If Morph is not generating notes:
- **Inference Server Load:** This issue might be caused by high load on the inference server.
- **Manual Generation:** Try generating notes manually.
- **Retry Later:** Wait approximately 5 minutes and try again. If the problem persists, please report the [issue on GitHub](https://github.com/aarnphm/morph/issues/new).

### 6.2 Cannot Access Website

If you’re unable to access the Morph website:
- **Internet Connection:** Verify that you have a stable internet connection.
- **Device Compatibility:** Ensure you are using a computer, as Morph does not support mobile devices.
- **Browser Requirements:** Confirm that you are using a supported browser (refer to the Appendix for the full list of accepted browsers).
- **Firewall/Network Restrictions:** Make sure your firewall or network settings are not blocking access to the website.
  - **For Windows:** Check your Windows Firewall settings.
  - **For MacOS:** Review your network and security preferences.

By following these troubleshooting steps, you should be able to resolve many common issues encountered while using Morph.

## 7 Frequently Asked Questions (FAQs)

### Q1: Does this application have access to my data?
**A:** No. Morph was built on the principle of a fully decentralized text editing platform. All your Markdown files and notes are stored locally on your device—either on your disk or within the browser's database (index.db). Our stack is designed without a central database to ensure that your data remains completely private and under your control.

### Q2: Can I input any author?
**A:** You can select from a curated list of well-known authors available within Morph. This list is designed to offer popular and influential writing styles. Future updates may allow for more customization or the addition of custom authors.

### Q3: How can I tell if the AI is giving me correct results?
**A:** Morph includes a **Reasoning** section within the Notes menu that breaks down the AI’s thought process behind its suggestions. You can review these details to verify that the generated ideas align with your intent. Additionally, clicking on a note provides further insight by highlighting most relevant area within your text editor.

### Q4: What happens if I lose internet access mid-writing?
**A:** If you lose internet connectivity while writing, the text editor remains fully operational because all your work is stored locally. You can continue editing and save your document using the standard shortcut (Ctrl + s on Windows/Linux or Cmd + s on Mac). However, note that without an internet connection, AI-driven note generation will be unavailable until connectivity is restored.


## 8 Appendix

### 8.0 Supported Browsers

| Browser        | Support Level       | Notes                                                            |
|----------------|---------------------|------------------------------------------------------------------|
| Chrome         | Supported           | Latest version recommended.                                      |
| Edge           | Supported           | Latest version recommended.                                      |
| Firefox        | Partially Supported | Compatibility may vary based on file system permissions.         |
| Safari         | Not Supported       | Does not support required file-access APIs.                      |
| Other Browsers | Not Recommended     | Use a modern Chromium-based browser for best results.            |

### 8.1 Basic Markdown Formatting Reference

| Markdown Element | Syntax Example                                                                                               |
|------------------|--------------------------------------------------------------------------------------------------------------|
| Heading 1        | `# Heading 1`                                                                                                |
| Heading 2        | `## Heading 2`                                                                                               |
| Heading 3        | `### Heading 3`                                                                                              |
| Emphasis         | `*Italic*` or `_Italic_`, **Bold**: `**Bold**`                                                                 |
| Unordered List   | `- Item 1`<br>`- Item 2`                                                                                       |
| Ordered List     | `1. First item`<br>`2. Second item`                                                                            |
| Link             | `[Link text](https://example.com)`                                                                            |
| Image            | `![Alt text](image_url)`                                                                                      |
| Inline Code      | `` `inline code` ``                                                                                           |
| Code Block       | <pre>```language<br>// Code block content<br>```</pre> (replace "language" with your desired programming language) |
| Blockquote       | `> This is a blockquote.`                                                                                      |

### 8.2 Keyboard Shortcuts

#### For Windows / Linux

| Action                                | Shortcut  |
|---------------------------------------|-----------|
| Render Markdown                       | Alt + e   |
| Toggle Left Panel (Directory/Settings)| Ctrl + b  |
| Toggle Right Panel (Notes/Steering)   | Ctrl + i  |
| Save Document                         | Ctrl + s  |
| Search                                | Ctrl + k  |

#### For MacOS

| Action                                | Shortcut  |
|---------------------------------------|-----------|
| Render Markdown                       | Cmd + e   |
| Toggle Left Panel (Directory/Settings)| Cmd + b   |
| Toggle Right Panel (Notes/Steering)   | Cmd + i   |
| Save Document                         | Cmd + s   |
| Search                                | Cmd + k   |

### 8.3 Additional Resources

| Resource                  | Link/Description                                                                                   |
|---------------------------|-----------------------------------------------------------------------------------------------------|
| Morph GitHub Repository   | [https://github.com/aarnphm/morph](https://github.com/aarnphm/morph)                                  |
| User Documentation        | This guide contains detailed instructions on using Morph.                                          |
| Support & Issue Reporting | Report issues at [https://github.com/aarnphm/morph/issues/new](https://github.com/aarnphm/morph/issues/new) |