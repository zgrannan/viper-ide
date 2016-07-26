'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import * as debug from './debug';
import * as fs from 'fs';
var ps = require('ps-node');
import * as path from 'path';
import { LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, TransportKind, NotificationType } from 'vscode-languageclient';
import {Timer} from './Timer';
import * as vscode from 'vscode';
import {ExtensionState} from './ExtensionState';
import {HeapGraph, Backend, ViperSettings, VerificationState, Commands, UpdateStatusBarParams, LogLevel, Success} from './ViperProtocol';
import Uri from '../node_modules/vscode-uri/lib/index';
import {Log} from './Log';
import {StateVisualizer} from './StateVisualizer';
import {Helper} from './Helper';
import {StepsAsDecorationOptionsResult,MyDecorationOptions} from './StateVisualizer';

let statusBarItem;
let statusBarProgress;
let backendStatusBar;
let abortButton;
let autoSaver: Timer;
let state: ExtensionState;

let fileSystemWatcher: vscode.FileSystemWatcher;
let manuallyTriggered: boolean;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    Log.initialize(context);
    Log.log('Viper-Client is now active!', LogLevel.Info);
    state = ExtensionState.createExtensionState();
    state.checkOperatingSystem();
    context.subscriptions.push(state);
    fileSystemWatcher = vscode.workspace.createFileSystemWatcher('**/*.sil, **/*.vpr');
    state.startLanguageServer(context, fileSystemWatcher, false); //break?
    startAutoSaver();
    registerHandlers();
    initializeStatusBar();
    StateVisualizer.initialize();//enable second window
}

// function decorateText(position: vscode.Position) {
//     let ranges: vscode.Range[] = [];
//     //ranges.push(new vscode.Range(position, new vscode.Position(2,5)));
//     let decorationRenderType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({});
//     let options: vscode.DecorationOptions[] = [{
//         range: new vscode.Range(position, new vscode.Position(1, 10)),
//         renderOptions: {
//             before: {
//                 contentText: "⚫",
//                 color: "red",
//             }
//         }
//     }];
//     if (textEditorUnderVerification) {
//         textEditorUnderVerification.setDecorations(decorationRenderType, options);
//     }
// }

export function deactivate() {
    Log.log("deactivate", LogLevel.Info);
    state.dispose();
}

function initializeStatusBar() {
    state.state = VerificationState.Stopped;

    statusBarProgress = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 11);
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    updateStatusBarItem(statusBarItem, "Hello from Viper", "white");

    abortButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9);
    abortButton.command = "extension.stopVerification";
    updateStatusBarItem(abortButton, "$(x) Stop", "orange", null, false)

    state.context.subscriptions.push(statusBarProgress);
    state.context.subscriptions.push(statusBarItem);
    state.context.subscriptions.push(abortButton);

    backendStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 12);
}

function updateStatusBarItem(item, text: string, color: string, tooltip: string = null, show: boolean = true) {
    item.text = text;
    item.color = color;
    item.tooltip = tooltip;
    if (show) {
        item.show();
    } else {
        item.hide();
    }
}

function startAutoSaver() {
    let autoSaveTimeout = 1000;//ms
    autoSaver = new Timer(() => {
        //only save viper files
        if (vscode.window.activeTextEditor != null && vscode.window.activeTextEditor.document.languageId == 'viper') {
            if (Helper.getConfiguration('autoSave') === true) {
                manuallyTriggered = false;
                vscode.window.activeTextEditor.document.save();
            }
        }
    }, autoSaveTimeout);

    state.context.subscriptions.push(autoSaver);

    let onActiveTextEditorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(resetAutoSaver);
    let onTextEditorSelectionChange = vscode.window.onDidChangeTextEditorSelection(resetAutoSaver);
    state.context.subscriptions.push(onActiveTextEditorChangeDisposable);
    state.context.subscriptions.push(onTextEditorSelectionChange);
}

function resetAutoSaver() {
    autoSaver.reset();
}

function handleStateChange(params: UpdateStatusBarParams) {
    Log.log("The new state is: " + VerificationState[params.newState], LogLevel.Debug);
    let window = vscode.window;
    switch (params.newState) {
        case VerificationState.Starting:
            updateStatusBarItem(statusBarItem, 'starting', 'orange'/*,"Starting " + params.backendName*/);
            break;
        case VerificationState.VerificationRunning:
            let showProgressBar = Helper.getConfiguration('showProgress') === true;
            if (!params.progress) {
                updateStatusBarItem(statusBarItem, "pre-processing", 'orange');
                updateStatusBarItem(statusBarProgress, progressBarText(0), 'white', null, showProgressBar);
            }
            else {
                updateStatusBarItem(statusBarItem, `verifying ${params.filename}: ` + params.progress.toFixed(1) + "%", 'orange');
                updateStatusBarItem(statusBarProgress, progressBarText(params.progress), 'white', null, showProgressBar);
            }
            abortButton.show();
            break;
        case VerificationState.Ready:
            if (params.firstTime) {
                updateStatusBarItem(statusBarItem, "ready", 'white');
                //automatically trigger the first verification
                if (params.verificationNeeded && Helper.getConfiguration('autoVerifyAfterBackendChange') === true) {
                    verify(false);
                }
            } else {
                let msg: string = "";
                switch (params.success) {
                    case Success.Success:
                        msg = `Successfully verified ${params.filename} in ${params.time.toFixed(1)} seconds`;
                        Log.log(msg, LogLevel.Default);
                        updateStatusBarItem(statusBarItem, "$(check) " + msg, 'lightgreen');
                        if (params.manuallyTriggered) Log.hint(msg);
                        break;
                    case Success.ParsingFailed:
                        msg = `Parsing ${params.filename} failed after ${params.time.toFixed(1)} seconds`;
                        Log.log(msg, LogLevel.Default);
                        updateStatusBarItem(statusBarItem, "$(x) " + msg, 'red');
                        break;
                    case Success.TypecheckingFailed:
                        msg = `Type checking ${params.filename} failed after ${params.time.toFixed(1)} seconds with ${params.nofErrors} error${params.nofErrors == 1 ? "s" : ""}`;
                        Log.log(msg, LogLevel.Default);
                        updateStatusBarItem(statusBarItem, "$(x) " + msg, 'red');
                        break;
                    case Success.VerificationFailed:
                        msg = `Verifying ${params.filename} failed after ${params.time.toFixed(1)} seconds with ${params.nofErrors} error${params.nofErrors == 1 ? "s" : ""}`;
                        Log.log(msg, LogLevel.Default);
                        updateStatusBarItem(statusBarItem, "$(x) " + msg, 'red');
                        break;
                    case Success.Aborted:
                        updateStatusBarItem(statusBarItem, "Verification aborted", 'orange');
                        Log.log(`Verifying ${params.filename} was aborted`, LogLevel.Info);
                        break;
                    case Success.Error:
                        let msg2 = " - see View->Output->Viper for more info"
                        updateStatusBarItem(statusBarItem, `$(x) Internal error` + msg2, 'red');
                        msg = `Verifying ${params.filename} failed due to an internal error`;
                        Log.log(msg);
                        Log.hint(msg + msg2);
                        break;
                }
            }
            statusBarProgress.hide();
            abortButton.hide();
            break;
        case VerificationState.Stopping:
            updateStatusBarItem(statusBarItem, 'preparing', 'orange');
            break;
        default:
            break;
    }
}

function handleInvalidSettings(data) {
    Log.log("Invalid Settings detected", LogLevel.Default);
    statusBarItem.color = 'red';
    statusBarItem.text = "Invalid Settings";

    let userSettingsButton: vscode.MessageItem = { title: "Open User Settings" };
    let workspaceSettingsButton: vscode.MessageItem = { title: "Open Workspace Settings" };

    vscode.window.showInformationMessage("Viper: Invalid settings: " + data, userSettingsButton, workspaceSettingsButton).then((choice) => {
        if (!choice) {

        } else if (choice.title === workspaceSettingsButton.title) {
            try {
                let rootPath = vscode.workspace.rootPath;
                if (!rootPath) {
                    Log.hint("Only if a folder is opened, the workspace settings can be accessed.")
                    return;
                }
                //workspaceSettings
                let workspaceSettingsPath = path.join(rootPath, '.vscode', 'settings.json');
                Log.log("WorkspaceSettings: " + workspaceSettingsPath, LogLevel.Debug);
                Helper.makeSureFileExists(workspaceSettingsPath);
                Helper.showFile(workspaceSettingsPath, vscode.ViewColumn.Two);
            } catch (e) {
                Log.error("Error accessing workspace settings: " + e)
            }
        } else if (choice.title === userSettingsButton.title) {
            try {
                //user Settings
                let userSettings = state.userSettingsPath();
                Log.log("UserSettings: " + userSettings, LogLevel.Debug);
                Helper.makeSureFileExists(userSettings);
                Helper.showFile(userSettings, vscode.ViewColumn.Two);
            } catch (e) {
                Log.error("Error accessing user settings: " + e)
            }
        }
    });
}

function registerHandlers() {

    state.client.onNotification(Commands.StateChange, (params: UpdateStatusBarParams) => handleStateChange(params));
    state.client.onNotification(Commands.InvalidSettings, (data) => handleInvalidSettings(data));
    state.client.onNotification(Commands.Hint, (data: string) => {
        Log.hint(data);
    });
    state.client.onNotification(Commands.Log, (data: string) => {
        Log.log((Log.logLevel >= LogLevel.Debug ? "S: " : "") + data, LogLevel.Default);
    });
    state.client.onNotification(Commands.ToLogFile, (data: string) => {
        Log.toLogFile((Log.logLevel >= LogLevel.Debug ? "S: " : "") + data, LogLevel.Default);
    });
    state.client.onNotification(Commands.Error, (data: string) => {
        Log.error((Log.logLevel >= LogLevel.Debug ? "S: " : "") + data, LogLevel.Default);
    });
    state.client.onNotification(Commands.BackendChange, (newBackend: string) => {
        updateStatusBarItem(backendStatusBar, newBackend, "white");
    });
    state.client.onRequest(Commands.UriToPath, (uri: string) => {
        let uriObject: vscode.Uri = vscode.Uri.parse(uri);
        let platformIndependentPath = uriObject.fsPath;
        return platformIndependentPath;
    });
    state.client.onRequest(Commands.PathToUri, (path: string) => {
        let uriObject: Uri = Uri.file(path);
        let platformIndependentUri = uriObject.toString();
        return platformIndependentUri;
    });
    state.client.onRequest(Commands.AskUserToSelectBackend, (backendNames: string[]) => {
        //only ask the user if there is a choice
        if (backendNames.length > 1) {
            vscode.window.showQuickPick(backendNames).then((selectedBackend) => {
                state.client.sendRequest(Commands.SelectBackend, selectedBackend);
            });
        } else {
            state.client.sendRequest(Commands.SelectBackend, backendNames[0]);
        }
    });
    state.context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((params) => {
        verify(manuallyTriggered);
    }));
    state.context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        Log.updateSettings();
    }));

    //Heap visualization
    state.client.onNotification(Commands.StepsAsDecorationOptions, (params: { uri: string, decorations: StepsAsDecorationOptionsResult }) => StateVisualizer.storeNewStates(params));
    state.client.onRequest(Commands.HeapGraph, (heapGraph: HeapGraph) => {
        //Log.log("HeapGraph",LogLevel.Debug);
        StateVisualizer.showHeap(heapGraph)
    });
    vscode.window.onDidChangeTextEditorSelection((change) => {
        //Log.log("OnDidChangeTextEditorSelection",LogLevel.Debug);
        let uri = change.textEditor.document.uri.toString();
        let start = change.textEditor.selection.start;
        StateVisualizer.showStateSelection(uri, start);
    });
    state.client.onRequest(Commands.StateSelected, change => {
        //Log.log("stateSelected",LogLevel.Debug);
        let castChange = <{ uri: string, line: number, character: number }>change;
        StateVisualizer.showStateSelection(castChange.uri, { line: castChange.line, character: castChange.character });
    });

    //Command Handlers
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.verify', () => {
        manuallyTriggered = true;
        vscode.window.activeTextEditor.document.save().then(saved => {
            if (!saved) {
                //Log.log("manual verification request",LogLevel.Debug);
                verify(true);
            }
        });
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.selectBackend', () => {
        if (!state.client) {
            Log.hint("Extension not ready yet.");
        } else {
            state.client.sendRequest(Commands.RequestBackendSelection, null);
        }
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.startDebugging', () => {
        let openDoc = vscode.window.activeTextEditor.document.uri.path;
        if (state.isWin) {
            openDoc = openDoc.substring(1, openDoc.length);
        }
        let launchConfig = {
            name: "Viper Debug",
            type: "viper",
            request: "launch",
            program: openDoc,
            stopOnEntry: true
        }
        vscode.commands.executeCommand('vscode.startDebug', launchConfig).then(() => {
            Log.log('Debug session started successfully', LogLevel.Info);
        }, err => {
            Log.error(err.message);
        });
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.stopVerification', () => {
        if (state.client) {
            Log.log("Verification stop request", LogLevel.Debug);
            abortButton.hide();
            statusBarItem.color = 'orange';
            statusBarItem.text = "aborting";
            statusBarProgress.hide();
            state.client.sendRequest(Commands.StopVerification, vscode.window.activeTextEditor.document.uri.toString());
        } else {
            Log.hint("Extension not ready yet.");
        }
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.showStates', () => {
        StateVisualizer.showStates = true;
        StateVisualizer.showDecorations();
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.hideStates', () => {
        StateVisualizer.showStates = false;
        StateVisualizer.hideDecorations();
    }));
}

function verify(manuallyTriggered: boolean) {
    if (Helper.isViperSourceFile(vscode.window.activeTextEditor.document.uri.toString())) {
        if (!state.client) {
            Log.hint("Extension not ready yet.");
        } else {
            let workspace = vscode.workspace.rootPath ? vscode.workspace.rootPath : path.dirname(vscode.window.activeTextEditor.document.fileName);
            state.client.sendRequest(Commands.Verify, { uri: vscode.window.activeTextEditor.document.uri.toString(), manuallyTriggered: manuallyTriggered, workspace: workspace });
        }
    }
}

function progressBarText(progress: number): string {
    let bar = "";
    for (var i = 0; i < progress / 10; i++) {
        bar = bar + "⚫";
    }
    for (var i = 10; i > progress / 10; i--) {
        bar = bar + "⚪";
    }
    return bar;
}

/*
function colorFileGutter(color: string) {
    let window = vscode.window;
    let editor = window.activeTextEditor;
    let range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(editor.document.lineCount, Number.MAX_VALUE));
    colorGutter(color, range);
}

function colorGutter(color: string, range: vscode.Range) {
    let window = vscode.window;
    let editor = window.activeTextEditor;
    let ranges = [];
    ranges.push(range);
    var bookmarkDecorationType = vscode.window.createTextEditorDecorationType({
        overviewRulerColor: color
    });
    editor.setDecorations(bookmarkDecorationType, ranges);
}

function removeDecorations() {
    let window = vscode.window;
    let editor = window.activeTextEditor;
    let selection = editor.selection;
    let ranges = [];
    let start = new vscode.Position(0, 0);
    let end = new vscode.Position(editor.document.lineCount - 1, Number.MAX_VALUE);
    Log.log('Remove decoration on: ' + start.line + ':' + start.character + ' to ' + end.line + ':' + end.character + ".")

    ranges.push(new vscode.Range(start, end));
    let decorationRenderType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(30,30,30,1)'
    }); //TODO: get color from theme
    editor.setDecorations(decorationRenderType, ranges);
}

function markError(start: vscode.Position, end: vscode.Position, message: string) {
    Log.log('Mark error: ' + start.line + ':' + start.character + ' to ' + end.line + ':' + end.character + ".")
    let window = vscode.window;
    let editor = window.activeTextEditor;
    let range = new vscode.Range(start, end);
    let diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error)
}

function decorate(start: vscode.Position, end: vscode.Position) {
    Log.log('Decorate ' + start.line + ':' + start.character + ' to ' + end.line + ':' + end.character + ".")
    let window = vscode.window;
    let editor = window.activeTextEditor;
    let ranges = [];
    ranges.push(new vscode.Range(start, end));
    let decorationRenderType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'red'
    });
    editor.setDecorations(decorationRenderType, ranges);
}

function doesFileExist(path: string): boolean {
    if (!fs.existsSync(path)) {
        Log.hint('File not found at: ' + path);
        return false;
    }
    return true;
}
*/

    // let addBackendDisposable = vscode.commands.registerCommand('extension.addNewBackend', () => {
    //         Log.log("add new backend");
    //         let window = vscode.window;
    //         window.showInputBox()
    // });
    // context.subscriptions.push(addBackendDisposable);

    /*
    let siliconCommandDisposable = vscode.commands.registerCommand('extension.compileSilicon', () => {
        //Log.hint('Silicon-build-command detected');
        //removeDecorations();
        let window = vscode.window;
        let editor = window.activeTextEditor;
        if (!editor) return;

        //start verification of current file
        const exec = child_process.exec;
        //const ls = spawn('dir');
        let currfile = '"' + editor.document.fileName + '"';

        //let siliconHome = 'C:\\Users\\ruben\\Desktop\\Masterthesis\\Viper\\silicon';
        let env = process.env;
        let siliconHome = process.env.SILICON_HOME;
        if (!siliconHome) {
            Log.log('ERROR: SILICON_HOME Environment Variable is not set.');
        }

        Log.log('-> Env: SILICON_HOME: ' + siliconHome);

        Log.log('-> Silicon: verify ' + currfile);
        const ls = exec('silicon.bat --ideMode ' + currfile, { cwd: siliconHome });

        var time = "0";

        ls.stdout.on('data', (data) => {
            Log.log(`stdout: ${data}`);
            let stringData: string = data;
            let parts = stringData.split("\r\n"); //TODO: make compatible with OSX and LINUX

            parts.forEach((part, i, array) => {
                if (part.startsWith('Silicon finished in')) {
                    time = /.*?(\d*\.\d*)/.exec(part)[1];
                }
                else if (part == 'No errors found.') {
                    Log.hint('Successfully verified with Silicon in ' + time + ' seconds.');
                    time = "0";
                }
                else if (part.startsWith('The following errors were found')) {
                    Log.hint('Silicon: Verification failed after ' + time + ' seconds.');
                    time = "0";
                }
                else if (part.startsWith('  ')) {
                    let pos = /\s*(\d*):(\d*):(\.*)/.exec(part);
                    if (pos.length != 4) {
                        Log.log('ERROR: could not parse error description: "' + part + '"');
                        return;
                    }
                    let lineNr = +pos[1]-1;
                    let charNr = +pos[2]-1;
                    let message = pos[3].trim();
                    markError(new vscode.Position(lineNr, charNr), new vscode.Position(lineNr, Number.MAX_VALUE),message);
                }
            })
        });

        ls.stderr.on('data', (data) => {
            Log.log(`stderr: ${data}`);
        });

        ls.on('close', (code) => {
            Log.log(`child process exited with code ${code}`);
        });

        Log.log('after silicon start');
    });
    let carbonCommandDisposable = vscode.commands.registerCommand('extension.compileCarbon', () => {
        Log.hint('Carbon-build-command detected');
        removeDecorations();
    });

    let testCommandDisposable = vscode.commands.registerCommand('extension.test', () => {
        let window = vscode.window;
        let editor = window.activeTextEditor;
        if (!editor) return;

        //create a position(lineNumber,characterNumber)
        let origin = new vscode.Position(0, 0);

        let selection = editor.selection;
        let start = selection.start;
        let end = selection.end;

        let ranges = [];
        ranges.push(new vscode.Range(start, end));

        decorate(selection.start, selection.end);
        // //showing an input box
        // let lineNumber = window.showInputBox("line to delete");

        // //delete selection
        // editor.edit(editBuilder =>{
        //     editBuilder.delete(selection);
        // })

        // //validate file paths
        // let gutterImagePath = context.asAbsolutePath("error.png");
        // if (!fs.existsSync(gutterImagePath)){
        //      Log.hint('file not found at: '+gutterImagePath);
        //      return;
        // }
        // //decorate the gutter and overviewRuler
        // var bookmarkDecorationType = vscode.window.createTextEditorDecorationType({
        //     gutterIconPath: gutterImagePath,
        //     overviewRulerLane: vscode.OverviewRulerLane.Full,
        //     overviewRulerColor: 'rgba(255, 0, 0, 0.7)'
        // });
        // editor.setDecorations(bookmarkDecorationType, ranges);

        // //check if file exists
        //let siliconPath = "C:\Users\ruben\Desktop\Masterthesis\Viper\silicon\target\scala-2.11\silicon.jar"
        //if(!doesFileExist(siliconPath)) return;

        // let exec = require('child_process').exec;
        // exec('silicon', function callback(error, stdout, stderr) {
        //     Log.hint('callback');
        // });
        // og.hint('method end reached');
    });

    context.subscriptions.push(testCommandDisposable)
    context.subscriptions.push(carbonCommandDisposable);
    context.subscriptions.push(siliconCommandDisposable);
    */


