# Project Overview for Agents

This project is a Visual Studio Code extension that allows users to preview RTF (Rich Text Format) files.

## Architecture

The extension works by:
1.  Detecting when an RTF file is opened or the preview command is triggered.
2.  Using LibreOffice (headless mode) to convert the RTF file to a temporary PDF file.
3.  Displaying the generated PDF file using VS Code's built-in or a custom PDF viewer mechanism (currently leveraging standard webview or external PDF viewer capabilities if available, but primarily focusing on the conversion pipeline).

## Key Technologies

-   **VS Code Extension API**: Used for commands, configuration, and editor integration.
-   **LibreOffice**: Used as the conversion engine. The extension spawns a child process to run `soffice --headless --convert-to pdf`.
-   **TypeScript**: The language used for development.

## Development Guidelines

-   **Code Style**: Follow standard TypeScript and VS Code extension guidelines.
-   **Error Handling**: Ensure robust error handling for LibreOffice execution (e.g., missing executable, conversion failures).
-   **Async/Await**: Use async/await for file operations and child process execution.
