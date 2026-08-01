# Electron + Vite + TypeScript Project

This project demonstrates a modern Electron desktop application using Vite for frontend development and TypeScript for type safety.

## Prerequisites

-   **Node.js**: >= 18.0.0
-   **npm** (or **yarn** / **pnpm**)

## Getting Started

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd taking-book-desktop-app
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

## Available Scripts

### Development

-   `npm run dev`: Starts the development server for the renderer process (Vite). This will automatically reload the app when changes are made.
-   `npm run dev:main`: Starts the main process in watch mode (if supported).

### Build & Package

-   `npm run build`: Builds the renderer process (Vite).
-   `npm run package`: Packages the application for distribution (requires Electron Forge).
-   `npm run make`: Creates distributable installers for your platform.
-   `npm run make:win`: Creates installers for Windows.
-   `npm run make:mac`: Creates installers for macOS.
-   `npm run make:linux`: Creates installers for Linux.

### Run

-   `npm run start`: Compiles the main process and runs the application.

## Project Structure

-   `src/main/`: Contains the Electron main process code (entry point, IPC handlers).
-   `src/renderer/`: Contains the frontend code (React/HTML/CSS).
-   `electron.vite.config.ts`: Configuration for Electron's Vite integration.
-   `vite.config.ts`: Standard Vite configuration.
