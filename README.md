# AudiTag — Backup Media Verification Prototype

Minimally functional prototype for **Assignment 2: AI Use-Case Design and Feasibility**
(AudiTag: An AI-Assisted Visual Compliance Verification System for Backup Media Rotation in Hospitality Operations)

## What it does
1. User uploads a photo of a backup media item (e.g., a labeled tape).
2. User enters the expected identifier from the rotation schedule.
3. The app runs client-side OCR (Tesseract.js) to read text from the photo.
4. It compares the detected text to the expected identifier and returns:
   - **PASS** — confident match, auto-log
   - **FAIL** — confident mismatch, route to IT Coordinator
   - **UNCERTAIN** — low OCR confidence or partial match, route to IT Coordinator

This simulates the AI Verification Engine described in the AudiTag invention disclosure
(Assignment 1, Annexure B4–B6): image input → OCR/identification → policy comparison →
confidence-based routing → human review for anything uncertain.

## Running it
No installation needed — open `index.html` in any browser, or visit the live GitHub Pages link.
All processing happens in-browser; no photo or data is sent to any server.

## Scope and limitations (honest disclosure for Annexure C/D)
- This is a simplified stand-in for the full AI Verification Engine, using general-purpose OCR
  rather than a purpose-trained media-identification model.
- It does not implement the full rotation-policy database — the expected identifier is entered
  manually rather than pulled automatically from a schedule.
- It does not implement the Evidence Repository, Compliance Dashboard, or IT Coordinator
  review interface — those remain design-stage, as stated in Assignment 1, Annexure B16.
- It is intended to demonstrate that the core AI mechanism (visual identification + policy
  comparison + confidence-based escalation) is technically feasible, not to be a
  production-ready system.

## Author
Saraah Salim Patel | 24WU0201243 | BBA Data Science & AI, Woxsen University
