import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "vs-rtf-preview" is now active!');

    let disposable = vscode.commands.registerCommand('rtf-preview.preview', async (uri: vscode.Uri) => {
        if (!uri) {
            if (vscode.window.activeTextEditor) {
                uri = vscode.window.activeTextEditor.document.uri;
            } else {
                vscode.window.showErrorMessage('No file selected for preview.');
                return;
            }
        }

        if (uri.scheme !== 'file') {
            vscode.window.showErrorMessage('RTF Preview only supports local files.');
            return;
        }

        const rtfPath = uri.fsPath;
        if (path.extname(rtfPath).toLowerCase() !== '.rtf') {
            vscode.window.showErrorMessage('The selected file is not an RTF file.');
            return;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Converting RTF to PDF...",
                cancellable: false
            }, async (progress) => {
                const pdfPath = await convertRtfToPdf(rtfPath);
                progress.report({ message: "Opening PDF..." });
                await openPdf(pdfPath);
            });
        } catch (error: any) {
            vscode.window.showErrorMessage(`Error converting RTF: ${error.message}`);
        }
    });

    context.subscriptions.push(disposable);

    context.subscriptions.push(RtfPreviewProvider.register(context));

    // Cleanup temp dir on activation
    cleanupTempDir();
}

const TEMP_DIR_NAME = 'vscode-rtf-preview';

function getOutputDir(): string {
    return path.join(os.tmpdir(), TEMP_DIR_NAME);
}

function cleanupTempDir() {
    const outputDir = getOutputDir();
    if (fs.existsSync(outputDir)) {
        try {
            fs.rmSync(outputDir, { recursive: true, force: true });
        } catch (error) {
            console.error(`Failed to cleanup temp dir: ${error}`);
        }
    }
}

class RtfPreviewProvider implements vscode.CustomReadonlyEditorProvider {

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new RtfPreviewProvider(context);
        const providerRegistration = vscode.window.registerCustomEditorProvider(RtfPreviewProvider.viewType, provider);
        return providerRegistration;
    }

    private static readonly viewType = 'rtf-preview.editor';

    constructor(
        private readonly context: vscode.ExtensionContext
    ) { }

    async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
        token: vscode.CancellationToken
    ): Promise<vscode.CustomDocument> {
        return { uri, dispose: () => { } };
    }

    async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
        };

        webviewPanel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; color: var(--vscode-descriptionForeground); }
                </style>
            </head>
            <body>
                <p>Converting RTF to PDF...</p>
            </body>
            </html>
        `;

        try {
            const rtfPath = document.uri.fsPath;
            const pdfPath = await convertRtfToPdf(rtfPath);

            // Open the PDF
            const pdfUri = vscode.Uri.file(pdfPath);
            await vscode.commands.executeCommand('vscode.open', pdfUri);

            // Close this editor (the RTF one) since we opened the PDF
            // We use a small timeout to ensure the PDF tab has started opening
            setTimeout(() => {
                webviewPanel.dispose();
            }, 500);

        } catch (error: any) {
            webviewPanel.webview.html = `
                <!DOCTYPE html>
                <html>
                <body>
                    <p>Error converting RTF: ${error.message}</p>
                </body>
                </html>
            `;
        }
    }
}

async function convertRtfToPdf(rtfPath: string): Promise<string> {
    const config = vscode.workspace.getConfiguration('rtfPreview');
    let sofficePath = config.get<string>('libreOfficePath');

    if (!sofficePath) {
        // Try to detect LibreOffice
        if (process.platform === 'darwin') {
            sofficePath = '/Applications/LibreOffice.app/Contents/MacOS/soffice';
        } else if (process.platform === 'win32') {
            sofficePath = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';
        } else {
            sofficePath = 'soffice'; // Linux/others, assume in PATH
        }
    }

    // Verify soffice exists
    if (process.platform !== 'linux' && !fs.existsSync(sofficePath)) {
        // On Linux it might be in PATH, so fs.existsSync might fail if it's just 'soffice'
        // But for Mac/Win we expect a full path if auto-detected or provided.
        // If user provided 'soffice' on Mac/Win, we might need to check path.
        // For now, let's assume if it's not absolute, we try to run it.
    }

    const outputDir = getOutputDir();
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
        const args = ['--headless', '--convert-to', 'pdf', rtfPath, '--outdir', outputDir];

        // If sofficePath contains spaces and is not quoted, spawn might handle it if passed as command.
        // But better to use it directly.

        const processCmd = cp.spawn(sofficePath!, args);

        processCmd.on('error', (err) => {
            reject(new Error(`Failed to start LibreOffice: ${err.message}. Please check if LibreOffice is installed and the path is correct.`));
        });

        processCmd.on('close', (code) => {
            if (code === 0) {
                const filename = path.basename(rtfPath, path.extname(rtfPath));
                const pdfPath = path.join(outputDir, `${filename}.pdf`);
                if (fs.existsSync(pdfPath)) {
                    resolve(pdfPath);
                } else {
                    reject(new Error('PDF file was not generated.'));
                }
            } else {
                reject(new Error(`LibreOffice exited with code ${code}`));
            }
        });
    });
}

async function openPdf(pdfPath: string) {
    // Use vscode.open to open the PDF. VS Code has a built-in PDF viewer or extensions.
    // Alternatively, we can use 'vscode.env.openExternal' to open in default system viewer.
    // The user request said "preview PDF by leverage standard extension".
    // This implies opening it inside VS Code.

    const uri = vscode.Uri.file(pdfPath);
    await vscode.commands.executeCommand('vscode.open', uri);
}

export function deactivate() {
    cleanupTempDir();
}
