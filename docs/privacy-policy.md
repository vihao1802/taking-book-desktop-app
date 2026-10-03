---
title: Privacy Policy
permalink: /privacy-policy/
---

# Taking Book Privacy Policy

Effective date: 3 October 2026

Taking Book is a local-first PDF reading app for Windows, macOS, Linux and Android. This policy explains what data the app handles and where it goes. Questions: [tranvihao40@gmail.com](mailto:tranvihao40@gmail.com).

**In short:** your library lives on your own device. The developer runs no server, receives none of your data, and the app contains no advertising, analytics or tracking.

## What stays on your device

The app stores the following on your device only: the Books you add (their PDF files, titles, tags, status and favorites), your Last-read position and zoom for each Book, your highlights and notes, reading minutes, settings such as the theme and target language, cached covers and text layouts, and any sounds you add. The reading minutes, covers, layouts and settings are never synced.

## Google account and Google Drive (optional sync)

Sync is optional and only runs after you choose "Connect Google Drive". When you connect, the app asks Google for these permissions:

- **Your name and email address** (`openid`, `email`, `profile`): only to show which Google account is connected.
- **Access to files the app itself creates in your Google Drive** (`https://www.googleapis.com/auth/drive.file`): the app creates a folder named "Taking Book" in your Drive and keeps in it a manifest of your library (titles, tags, status, reading position, highlights and notes) and copies of the PDF files you added. The app cannot see or change any other file in your Drive.

This data goes between your device and your own Google Drive. It is not sent to the developer or to anyone else. The access token Google gives the app, together with your name and email, is stored on your device, encrypted with the operating system's secure storage where the system provides it.

You can disconnect at any time in the app, which removes the stored token from the device. You can also revoke the app's access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions), and delete the "Taking Book" folder from your Drive.

Taking Book's use and transfer of information received from Google APIs to any other app will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## Features that send text to other services

- **Translate (when you tap it).** The text you selected and your target language are sent to Google Translate through its public web endpoint to get the translation. No account information is sent. Google's own privacy policy applies to that request.
- **Quizzes (desktop only, when you use them).** The text of the pages in the Quiz scope is sent to an AI provider, Google Gemini by default, using an API key that you enter yourself. The app shows a notice before the first Quiz. Your key is stored on your device, encrypted with the operating system's secure storage where available, and is never synced.
- **Update check.** The app asks GitHub's public releases page whether a newer version exists. GitHub receives the usual information of any web request, such as your IP address.

## What we do not do

The developer does not collect, sell or share your data, and the app has no advertising, analytics or crash reporting that sends data anywhere.

## Your choices

Everything the app stores is on your device and in the Drive folder described above. Removing a Book in the app removes it from your library; uninstalling the app and deleting the "Taking Book" Drive folder removes the rest.

## Changes

If this policy changes, the new version will be published at this address with a new effective date.
