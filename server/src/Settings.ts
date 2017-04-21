'use strict';

import fs = require('fs');
import * as pathHelper from 'path';
import { Log } from './Log';
import { Versions, PlatformDependentURL, PlatformDependentPath, SettingsErrorType, SettingsError, NailgunSettings, Commands, Success, ViperSettings, Stage, Backend, LogLevel } from './ViperProtocol';
import { Server } from './ServerClass';
import { BackendService } from './BackendService';
import { ViperServerService } from './ViperServerService';
import { NailgunService } from './NailgunService';
const os = require('os');
var portfinder = require('portfinder');

export interface ResolvedPath {
    path: string,
    exists: boolean,
    error?: string
}

export class Settings {
    public static settings: ViperSettings;
    public static isWin = /^win/.test(process.platform);
    public static isLinux = /^linux/.test(process.platform);
    public static isMac = /^darwin/.test(process.platform);
    public static workspace;
    public static VERIFY = "verify";
    public static selectedBackend: string;

    private static firstSettingsCheck = true;

    private static _valid: boolean = false;
    private static _errors: SettingsError[];
    private static _upToDate: boolean = false;

    private static home = os.homedir();

    public static getStage(backend: Backend, name: string): Stage {
        if (!name) return null;
        for (let i = 0; i < backend.stages.length; i++) {
            let stage = backend.stages[i];
            if (stage.name === name) return stage;
        }
        return null;
    }

    public static getStageFromSuccess(backend: Backend, stage: Stage, success: Success): Stage {
        switch (success) {
            case Success.ParsingFailed:
                return this.getStage(backend, stage.onParsingError);
            case Success.VerificationFailed:
                return this.getStage(backend, stage.onVerificationError);
            case Success.TypecheckingFailed:
                return this.getStage(backend, stage.onTypeCheckingError);
            case Success.Success:
                return this.getStage(backend, stage.onSuccess);
        }
        return null;
    }

    public static backendEquals(a: Backend, b: Backend) {
        if (!a || !b) {
            return false;
        }
        let same = a.stages.length === b.stages.length;
        same = same && a.name === b.name;
        same = same && a.type === b.type;
        same = same && a.timeout === b.timeout;
        same = same && this.resolveEngine(a.engine) === this.resolveEngine(b.engine);
        a.stages.forEach((element, i) => {
            same = same && this.stageEquals(element, b.stages[i]);
        });
        same = same && a.paths.length === b.paths.length;
        for (let i = 0; i < a.paths.length; i++) {
            same = same && a.paths[i] === b.paths[i];
        }
        return same;
    }

    private static resolveEngine(engine: string) {
        if (engine && (engine.toLowerCase() == "viperserver" || engine.toLowerCase() == "nailgun")) {
            return engine;
        } else {
            return "none";
        }
    }

    public static useNailgunServer(backend: Backend) {
        if (!backend || !backend.engine) return false;
        return backend.engine.toLowerCase() == "nailgun";
    }

    public static useViperServer(backend: Backend) {
        if (!backend || !backend.engine) return false;
        return backend.engine.toLowerCase() == "viperserver";
    }

    private static stageEquals(a: Stage, b: Stage): boolean {
        let same = a.customArguments == b.customArguments;
        same = same && a.mainMethod == b.mainMethod;
        same = same && a.name == b.name;
        same = same && a.isVerification == b.isVerification;
        same = same && a.onParsingError == b.onParsingError;
        same = same && a.onTypeCheckingError == b.onTypeCheckingError;
        same = same && a.onVerificationError == b.onVerificationError;
        same = same && a.onSuccess == b.onSuccess;
        return same;
    }

    public static nailgunEquals(newSettings: NailgunSettings, oldSettings: NailgunSettings): boolean {
        let same = oldSettings.clientExecutable == newSettings.clientExecutable;
        same = same && oldSettings.port == newSettings.port;
        same = same && oldSettings.serverJar == newSettings.serverJar;
        same = same && oldSettings.timeout == newSettings.timeout;
        return same;
    }

    static expandCustomArguments(args: string, stage: Stage, fileToVerify: string, backend: Backend): string {
        args = args.replace(/\s+/g, ' '); //remove multiple spaces
        args = args.replace(/\$z3Exe\$/g, '"' + this.settings.paths.z3Executable + '"');
        args = args.replace(/\$ngExe\$/g, '"' + this.settings.nailgunSettings.clientExecutable + '"');
        args = args.replace(/\$boogieExe\$/g, '"' + this.settings.paths.boogieExecutable + '"');
        args = args.replace(/\$mainMethod\$/g, stage.mainMethod);
        args = args.replace(/\$nailgunPort\$/g, this.settings.nailgunSettings.port);
        args = args.replace(/\$fileToVerify\$/g, '"' + fileToVerify + '"');
        args = args.replace(/\$backendPaths\$/g, Settings.backendJars(backend))
        return args.trim();
    }

    static expandViperToolsPath(path: string): string {
        if (!path) return path;
        if (typeof Settings.settings.paths.viperToolsPath !== "string") {
            return path;
        }
        path = path.replace(/\$viperTools\$/g, <string>Settings.settings.paths.viperToolsPath);
        return path;
    }

    public static selectBackend(settings: ViperSettings, selectedBackend: string): Backend {
        if (selectedBackend) {
            Settings.selectedBackend = selectedBackend;
        }
        if (!settings || !settings.verificationBackends || settings.verificationBackends.length == 0) {
            this.selectedBackend = null;
            return null;
        }
        if (this.selectedBackend) {
            for (let i = 0; i < settings.verificationBackends.length; i++) {
                let backend = settings.verificationBackends[i];
                if (backend.name === this.selectedBackend) {
                    return backend;
                }
            }
        }
        this.selectedBackend = settings.verificationBackends[0].name;
        return settings.verificationBackends[0];
    }

    public static getBackendNames(settings: ViperSettings): string[] {
        let backendNames = [];
        settings.verificationBackends.forEach((backend) => {
            backendNames.push(backend.name);
        })
        return backendNames;
    }

    public static getBackend(backendName:string):Backend{
        return Settings.settings.verificationBackends.find(b=>{return b.name == backendName});
    }

    public static valid(): boolean {
        Server.sendSettingsCheckedNotification({ ok: this._valid, errors: this._errors, settings: this.settings });
        return this._valid;
    }

    public static upToDate(): boolean {
        return this._upToDate;
    }

    public static setNailgunPort(nailgunSettings: NailgunSettings): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if (!nailgunSettings.port || nailgunSettings.port == "*") {
                //use a random port
                portfinder.getPort(function (err, port) {
                    Log.log("nailgun port is chosen as: " + port, LogLevel.Debug);
                    nailgunSettings.port = port;
                    resolve(true);
                });
            } else {
                resolve(true);
            }
        });
    }

    //tries to restart backend, 
    public static initiateBackendRestartIfNeeded(oldSettings?: ViperSettings, selectedBackend?: string, viperToolsUpdated: boolean = false) {
        Settings.checkSettings(viperToolsUpdated).then(() => {
            if (Settings.valid()) {
                let newBackend = Settings.selectBackend(Settings.settings, selectedBackend);

                if (newBackend) {
                    //only restart the backend after settings changed if the active backend was affected
                    let restartBackend = !Server.backendService.isReady() //backend is not ready -> restart
                        || !Settings.backendEquals(Server.backend, newBackend) //change in backend
                        || (oldSettings && (this.useNailgunServer(newBackend) && (!Settings.nailgunEquals(Settings.settings.nailgunSettings, oldSettings.nailgunSettings)))) //backend needs nailgun and nailgun settings changed
                        || viperToolsUpdated //Viper Tools Update might have modified the binaries
                        || (Server.backendService.isViperServerService != this.useViperServer(newBackend)); //the new backend requires another engine type
                    if (restartBackend) {
                        Log.log(`Change Backend: from ${Server.backend ? Server.backend.name : "No Backend"} to ${newBackend ? newBackend.name : "No Backend"}`, LogLevel.Info);
                        Server.backend = newBackend;
                        Server.verificationTasks.forEach(task => task.resetLastSuccess());
                        Server.sendStartBackendMessage(Server.backend.name);
                        //Server.nailgunService.startOrRestartNailgunServer(Server.backend, true);
                    } else {
                        //In case the backend does not need to be restarted, retain the port
                        if (oldSettings) { Settings.settings.nailgunSettings.port = oldSettings.nailgunSettings.port; }
                        Log.log("No need to restart backend. It is still the same", LogLevel.Debug)
                        Server.backend = newBackend;
                        Server.sendBackendReadyNotification({
                            name: Server.backend.name,
                            restarted: false,
                            isViperServer: Settings.useViperServer(newBackend)
                        });
                    }
                } else {
                    Log.error("No backend, even though the setting check succeeded.");
                }
            } else {
                Server.backendService.stop();
            }
        });
    }

    private static checkNailgunSettings(nailgunSettings: NailgunSettings): string {
        //check nailgun port
        if (!/^(\*|\d+)$/.test(nailgunSettings.port)) {
            this.addError("Invalid NailgunPort: " + nailgunSettings.port);
        } else {
            try {
                let port = Number.parseInt(nailgunSettings.port);
                if (port < 1024 || port > 65535) {
                    this.addError("Invalid NailgunPort: please use a port in the range of 1024 - 65535");
                }
            } catch (e) {
                this.addError("viperSettings.nailgunSettings.port needs to be an integer or *");
            }
        }
        //check nailgun jar
        if (!nailgunSettings.serverJar || nailgunSettings.serverJar.length == 0) {
            this.addError("Path to nailgun server jar is missing");
        } else {
            nailgunSettings.serverJar = Settings.checkPath(nailgunSettings.serverJar, "Nailgun Server:", false, false).path
        }

        //check nailgun client
        nailgunSettings.clientExecutable = Settings.checkPath(nailgunSettings.clientExecutable, "Nailgun Client:", true, true).path

        //check nailgun timeout
        if (!nailgunSettings.timeout || (nailgunSettings.timeout && nailgunSettings.timeout <= 0)) {
            nailgunSettings.timeout = null;
        }
        return null;
    }

    private static addError(msg: string) {
        this._errors.push({ type: SettingsErrorType.Error, msg: msg });
    }
    private static addErrors(errors: SettingsError[]) {
        this._errors = this._errors.concat(errors);
    }
    private static addWarning(msg: string) {
        this._errors.push({ type: SettingsErrorType.Warning, msg: msg });
    }

    private static checkSettingsVersion(settings, requiredVersions): string[] {
        let oldSettings = [];
        //check the settings versions
        if (!requiredVersions) {
            Log.error("Getting required version failed.");
        } else {
            if (Version.createFromVersion(requiredVersions.advancedFeaturesVersion).compare(Version.createFromHash(settings.advancedFeatures.v)) > 0) {
                oldSettings.push("advancedFeatures");
            }
            if (Version.createFromVersion(requiredVersions.javaSettingsVersion).compare(Version.createFromHash(settings.javaSettings.v)) > 0) {
                oldSettings.push("javaSettings");
            }
            if (Version.createFromVersion(requiredVersions.nailgunSettingsVersion).compare(Version.createFromHash(settings.nailgunSettings.v)) > 0) {
                oldSettings.push("nailgunSettings");
            }
            if (Version.createFromVersion(requiredVersions.pathSettingsVersion).compare(Version.createFromHash(settings.paths.v)) > 0) {
                oldSettings.push("paths");
            }
            if (Version.createFromVersion(requiredVersions.userPreferencesVersion).compare(Version.createFromHash(settings.preferences.v)) > 0) {
                oldSettings.push("preferences");
            }
            let requiredBackendVersion = Version.createFromVersion(requiredVersions.backendSettingsVersion);
            settings.verificationBackends.forEach(backend => {
                if (requiredBackendVersion.compare(Version.createFromHash(backend.v)) > 0) {
                    oldSettings.push("backend " + backend.name);
                }
            });
        }
        return oldSettings;
    }

    public static checkSettings(viperToolsUpdated: boolean): Promise<boolean> {
        return new Promise((resolve, reject) => {
            try {
                this._valid = false;
                this._errors = [];
                this._upToDate = false;

                Server.connection.sendRequest(Commands.CheckIfSettingsVersionsSpecified).then((errors: SettingsError[]) => {
                    if (errors) {
                        this.addErrors(errors);
                        return null;
                    } else {
                        //check settings versions
                        return Server.connection.sendRequest(Commands.RequestRequiredVersion);
                    }
                }).then((requiredVersions: Versions) => {
                    if (!requiredVersions) {
                        resolve(false);
                        return;
                    }
                    if (this.firstSettingsCheck) {
                        Log.log("Extension Version: " + requiredVersions.extensionVersion + " - " + Version.hash(requiredVersions.extensionVersion), LogLevel.LowLevelDebug)
                        this.firstSettingsCheck = false;
                    }
                    let settings = Settings.settings;
                    let oldSettings: string[] = this.checkSettingsVersion(settings, requiredVersions);
                    let defaultSettings = requiredVersions.defaultSettings;

                    if (oldSettings.length > 0) {
                        let affectedSettings = oldSettings.length < 10 ? "(" + oldSettings.join(", ") + ")" : "(" + oldSettings.length + ")";
                        this.addError("Old viper settings detected: " + affectedSettings + " please replace the old settings with the new default settings.");
                        resolve(false); return;
                    }

                    this._upToDate = true;

                    //Check viperToolsProvider
                    settings.preferences.viperToolsProvider = this.checkPlatformDependentUrl(settings.preferences.viperToolsProvider);

                    //Check Paths
                    //check viperToolsPath
                    let resolvedPath: ResolvedPath = this.checkPath(settings.paths.viperToolsPath, "Path to Viper Tools:", false, true, true);
                    settings.paths.viperToolsPath = resolvedPath.path;
                    if (!resolvedPath.exists) {
                        if (!viperToolsUpdated) {
                            //Automatically install the Viper tools
                            Server.updateViperTools(true);
                            reject(); // in this case we do not want to continue restarting the backend,
                            //the backend will be restarted after the update
                        } else {
                            resolve(false);
                        }
                        return;
                    }

                    //check z3 Executable
                    settings.paths.z3Executable = this.checkPath(settings.paths.z3Executable, "z3 Executable:", true, true, true).path;
                    //check boogie executable
                    settings.paths.boogieExecutable = this.checkPath(settings.paths.boogieExecutable, `Boogie Executable: (If you don't need boogie, set it to "")`, true, true, true).path;

                    //check backends
                    if (!settings.verificationBackends || settings.verificationBackends.length == 0) {
                        settings.verificationBackends = defaultSettings["viperSettings.verificationBackends"].default;
                    } else {
                        defaultSettings["viperSettings.verificationBackends"].default.forEach(defaultBackend => {
                            let customBackend = settings.verificationBackends.filter(backend => backend.name == defaultBackend.name)[0];
                            if (customBackend) {
                                //Merge the backend with the default backend
                                this.mergeBackend(customBackend, defaultBackend);
                            } else {
                                //Add the default backend if there is none with the same name
                                settings.verificationBackends.push(defaultBackend);
                            }
                        })
                    }
                    Settings.checkBackends(settings.verificationBackends);
                    //check nailgun settings
                    let nailgunRequired = settings.verificationBackends.some(elem => this.useNailgunServer(elem));
                    if (nailgunRequired) {
                        this.checkNailgunSettings(settings.nailgunSettings);
                    }

                    //check ViperServer related settings
                    let viperServerRequired = settings.verificationBackends.some(elem => this.useViperServer(elem));
                    if (viperServerRequired) {
                        //check viperServer path
                        settings.paths.viperServerPath = this.checkPath(settings.paths.viperServerPath, "viperServerPath:", true, true, true).path;
                    }

                    //no need to check preferences
                    //check java settings
                    if (!settings.javaSettings.customArguments) {
                        settings.javaSettings.customArguments = defaultSettings["viperSettings.javaSettings"].default.customArguments;
                        if (!settings.javaSettings.customArguments) {
                            this.addError("The customArguments are missing in the java settings");
                        }
                    }

                    //checks done
                    this._valid = !this._errors.some(error => error.type == SettingsErrorType.Error); //if there is no error -> valid
                    if (this._valid) {
                        Log.log("The settings are ok", LogLevel.Info);
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                });
            } catch (e) {
                Log.error("Error checking settings: " + e);
                resolve(false);
            }
        });
    }

    private static mergeBackend(custom: Backend, def: Backend) {
        if (!custom || !def || custom.name != def.name) return;
        if (!custom.paths || custom.paths.length == 0) custom.paths = def.paths;
        if (!custom.stages) custom.stages = def.stages
        else this.mergeStages(custom.stages, def.stages);
        if (!custom.timeout) custom.timeout = def.timeout;
        if (!custom.engine || custom.engine.length == 0) custom.engine = def.engine;
        if (!custom.type || custom.type.length == 0) custom.type = def.type;
    }

    private static mergeStages(custom: Stage[], defaultStages: Stage[]) {
        defaultStages.forEach(def => {
            let cus = custom.filter(stage => stage.name == def.name)[0];
            if (cus) {
                //merge
                if (cus.customArguments === undefined) cus.customArguments = def.customArguments;
                if (!cus.mainMethod) cus.mainMethod = def.mainMethod;
                if (cus.isVerification === undefined) cus.isVerification = def.isVerification;
            } else {
                custom.push(def);
            }
        });
    }

    private static checkPlatformDependentUrl(url: string | PlatformDependentURL): string {
        let stringURL = null;
        if (url) {
            if (typeof url === "string") {
                stringURL = url;
            } else {
                if (Settings.isLinux) {
                    stringURL = url.linux;
                } else if (Settings.isMac) {
                    stringURL = url.mac;
                } else if (Settings.isWin) {
                    stringURL = url.windows;
                } else {
                    Log.error("Operation System detection failed, Its not Mac, Windows or Linux");
                }
            }
        }
        if (!stringURL || stringURL.length == 0) {
            this.addError("The viperToolsProvider is missing in the preferences");
        }
        //TODO: check url format
        return stringURL;
    }

    private static checkPath(path: (string | PlatformDependentPath), prefix: string, executable: boolean, allowPlatformDependentPath: boolean, allowStringPath: boolean = true, allowMissingPath = false): ResolvedPath {
        if (!path) {
            if (!allowMissingPath) this.addError(prefix + " path is missing");
            return { path: null, exists: false };
        }
        let stringPath: string;
        if (typeof path === "string") {
            if (!allowStringPath) {
                this.addError(prefix + ' path has wrong type: expected: {windows:string, mac:string, linux:string}, found: ' + typeof path);
                return { path: stringPath, exists: false };
            }
            stringPath = <string>path;
        } else {
            if (!allowPlatformDependentPath) {
                this.addError(prefix + ' path has wrong type: expected: string, found: ' + typeof path + " at path: " + JSON.stringify(path));
                return { path: null, exists: false };
            }
            let platformDependentPath: PlatformDependentPath = <PlatformDependentPath>path;
            if (Settings.isLinux) {
                stringPath = platformDependentPath.linux;
            } else if (Settings.isMac) {
                stringPath = platformDependentPath.mac;
            } else if (Settings.isWin) {
                stringPath = platformDependentPath.windows;
            } else {
                Log.error("Operation System detection failed, Its not Mac, Windows or Linux");
            }
        }

        if (!stringPath || stringPath.length == 0) {
            if (!allowMissingPath) {
                this.addError(prefix + ' path has wrong type: expected: string' + (executable ? ' or {windows:string, mac:string, linux:string}' : "") + ', found: ' + typeof path + " at path: " + JSON.stringify(path));
            }
            return { path: stringPath, exists: false };
        }
        let resolvedPath = Settings.resolvePath(stringPath, executable);
        if (!resolvedPath.exists) {
            this.addError(prefix + ' path not found: "' + stringPath + '"' + (resolvedPath.path != stringPath ? ' which expands to "' + resolvedPath.path + '"' : "") + (" " + (resolvedPath.error || "")));
        }
        return resolvedPath;
    }

    private static checkBackends(backends: Backend[]) {
        //Log.log("Checking backends...", LogLevel.Debug);
        if (!backends || backends.length == 0) {
            this.addError("No backend detected, specify at least one backend");
            return;
        }

        let backendNames: Set<string> = new Set<string>();

        for (let i = 0; i < backends.length; i++) {
            let backend = backends[i];
            if (!backend) {
                this.addError("Empty backend detected");
            }
            else if (!backend.name || backend.name.length == 0) {//name there?
                this.addWarning("Every backend setting should have a name.");
                backend.name = "backend" + (i + 1);
            }
            let backendName = "Backend " + backend.name + ":";
            //check for duplicate backends
            if (backendNames.has(backend.name)) this.addError("Dublicated backend name: " + backend.name);
            backendNames.add(backend.name);

            //check stages
            if (!backend.stages || backend.stages.length == 0) {
                this.addError(backendName + " The backend setting needs at least one stage");
                continue;
            }

            backend.engine = this.resolveEngine(backend.engine);
            //check engine and type
            if (this.useViperServer(backend) && !ViperServerService.isSupportedType(backend.type)) {
                this.addError(backendName + "the backend type " + backend.type + " is not supported, try " + ViperServerService.supportedTypes);
            }

            let stages: Set<string> = new Set<string>();
            let verifyStageFound = false;
            for (let i = 0; i < backend.stages.length; i++) {
                let stage: Stage = backend.stages[i];
                if (!stage) {
                    this.addError(backendName + " Empty stage detected");
                }
                else if (!stage.name || stage.name.length == 0) {
                    this.addError(backendName + " Every stage needs a name.");
                } else {
                    let backendAndStage = backendName + " Stage: " + stage.name + ":";
                    //check for duplicated stage names
                    if (stages.has(stage.name))
                        this.addError(backendName + " Duplicated stage name: " + stage.name);
                    stages.add(stage.name);
                    //check mainMethod
                    if (!stage.mainMethod || stage.mainMethod.length == 0)
                        this.addError(backendAndStage + " Missing mainMethod");
                    //check customArguments
                    if (!stage.customArguments) {
                        this.addError(backendAndStage + " Missing customArguments");
                        continue;
                    }
                    //check customArguments for compliance with advancedFeatures
                    let hasIdeModeAdvanced = stage.customArguments.indexOf("--ideModeAdvanced") >= 0;
                    let hasIdeMode = stage.customArguments.indexOf("--ideMode ") >= 0;
                    if (hasIdeModeAdvanced && !hasIdeMode) {
                        this.addError(backendAndStage + " the --ideModeAdvanced depends on --ideMode, for the Advanced Mode you need to specify both.");
                    }
                    if (Settings.settings.advancedFeatures.enabled && hasIdeMode && !hasIdeModeAdvanced) {
                        this.addWarning(backendAndStage + " the advanced features only work when --ideModeAdvanced is specified.");
                    }
                    if (!Settings.settings.advancedFeatures.enabled && hasIdeModeAdvanced) {
                        this.addWarning(backendAndStage + " when the advanced features are disabled, you can speed up the verification by removing the --ideModeAdvanced flag from the customArguments.");
                    }
                }
            }
            for (let i = 0; i < backend.stages.length; i++) {
                let stage: Stage = backend.stages[i];
                let BackendMissingStage = backendName + ": Cannot find stage " + stage.name;
                if (stage.onParsingError && stage.onParsingError.length > 0 && !stages.has(stage.onParsingError))
                    this.addError(BackendMissingStage + "'s onParsingError stage " + stage.onParsingError);
                if (stage.onTypeCheckingError && stage.onTypeCheckingError.length > 0 && !stages.has(stage.onTypeCheckingError))
                    this.addError(BackendMissingStage + "'s onTypeCheckingError stage " + stage.onTypeCheckingError);
                if (stage.onVerificationError && stage.onVerificationError.length > 0 && !stages.has(stage.onVerificationError))
                    this.addError(BackendMissingStage + "'s onVerificationError stage " + stage.onVerificationError);
                if (stage.onSuccess && stage.onSuccess.length > 0 && !stages.has(stage.onSuccess))
                    this.addError(BackendMissingStage + "'s onSuccess stage " + stage.onSuccess);
            }

            //check paths
            if (!backend.paths || backend.paths.length == 0) {
                this.addError(backendName + " The backend setting needs at least one path");
            } else {
                if (typeof backend.paths == 'string') {
                    let temp = backend.paths;
                    backend.paths = [temp];
                }
                for (let i = 0; i < backend.paths.length; i++) {
                    //extract environment variable or leave unchanged
                    backend.paths[i] = Settings.checkPath(backend.paths[i], backendName, false, false).path;
                }
            }

            //check verification timeout
            if (!backend.timeout || (backend.timeout && backend.timeout <= 0)) {
                if (backend.timeout && backend.timeout < 0) {
                    this.addWarning(backendName + " The timeout of " + backend.timeout + " is interpreted as no timeout.");
                }
                backend.timeout = null;
            }
        }
        return null;
    }

    public static backendJars(backend: Backend): string {
        let backendJars = "";

        let concatenationSymbol = Settings.isWin ? ";" : ":";
        backend.paths.forEach(path => {
            if (this.isJar(path)) {
                //its a jar file
                backendJars = backendJars + concatenationSymbol + '"' + path + '"';
            } else {
                //its a folder
                let files = fs.readdirSync(path);
                files.forEach(file => {
                    if (this.isJar(file)) {
                        backendJars = backendJars + concatenationSymbol + '"' + pathHelper.join(path, file) + '"';
                    }
                });
            }
        });
        return backendJars;
    }

    private static isJar(file: string): boolean {
        return file ? file.trim().endsWith(".jar") : false;
    }

    private static extractEnvVars(path: string): ResolvedPath {
        if (path && path.length > 2) {
            while (path.indexOf("%") >= 0) {
                let start = path.indexOf("%")
                let end = path.indexOf("%", start + 1);
                if (end < 0) {
                    return { path: path, exists: false, error: "unbalanced % in path: " + path };
                }
                let envName = path.substring(start + 1, end);
                let envValue = process.env[envName];
                if (!envValue) {
                    return { path: path, exists: false, error: "environment variable " + envName + " used in path " + path + " is not set" };
                }
                if (envValue.indexOf("%") >= 0) {
                    return { path: path, exists: false, error: "environment variable: " + envName + " must not contain %: " + envValue };
                }
                path = path.substring(0, start - 1) + envValue + path.substring(end + 1, path.length);
            }
        }
        return { path: path, exists: true };
    }

    private static resolvePath(path: string, executable: boolean): ResolvedPath {
        try {
            if (!path) {
                return { path: path, exists: false };
            }
            path = path.trim();

            //expand internal variables
            let resolvedPath = this.expandViperToolsPath(path);
            //handle env Vars
            let envVarsExtracted = this.extractEnvVars(resolvedPath);
            if (!envVarsExtracted.exists) return envVarsExtracted;
            resolvedPath = envVarsExtracted.path;

            //handle files in Path env var
            if (resolvedPath.indexOf("/") < 0 && resolvedPath.indexOf("\\") < 0) {
                //its only a filename, try to find it in the path
                let pathEnvVar: string = process.env.PATH;
                if (pathEnvVar) {
                    let pathList: string[] = pathEnvVar.split(Settings.isWin ? ";" : ":");
                    for (let i = 0; i < pathList.length; i++) {
                        let pathElement = pathList[i];
                        let combinedPath = this.toAbsolute(pathHelper.join(pathElement, resolvedPath));
                        let exists = this.exists(combinedPath, executable);
                        if (exists.exists) return exists;
                    }
                }
            } else {
                //handle absolute and relative paths
                if (this.home) {
                    resolvedPath = resolvedPath.replace(/^~($|\/|\\)/, `${this.home}$1`);
                }
                resolvedPath = this.toAbsolute(resolvedPath);
                return this.exists(resolvedPath, executable);
            }
            return { path: resolvedPath, exists: false };
        } catch (e) {
            Log.error("Error resolving path: " + e);
        }
    }

    private static exists(path: string, executable: boolean): ResolvedPath {
        try {
            fs.accessSync(path);
            return { path: path, exists: true };
        } catch (e) { }
        if (executable && this.isWin && !path.toLowerCase().endsWith(".exe")) {
            path += ".exe";
            //only one recursion at most, because the ending is checked
            return this.exists(path, executable);
        }
        return { path: path, exists: false }
    }

    private static toAbsolute(path: string): string {
        return pathHelper.resolve(pathHelper.normalize(path));
    }
}

class Version {
    private static Key = "VdafSZVOWpe";

    versionNumbers: number[] = [0, 0, 0];
    private constructor(versionNumbers?: number[]) {
        if (versionNumbers) {
            this.versionNumbers = versionNumbers;
        }
    }

    public static createFromVersion(version) {
        try {
            if (version) {
                if (/\d+(\.\d+)+/.test(version)) {
                    return new Version(version.split(".").map(x => Number.parseInt(x)))
                }
            }
        } catch (e) {
            Log.error("Error creating version from Version: " + e);
        }
        return new Version();
    }

    public static createFromHash(hash) {
        try {
            if (hash) {
                let version = this.decrypt(hash, Version.Key);
                //Log.log("hash: " + hash + " decrypted version: " + version, LogLevel.LowLevelDebug);
                return this.createFromVersion(version);
            }
        } catch (e) {
            Log.error("Error creating version from hash: " + e);
        }
        return new Version();
    }

    private static encrypt(msg: string, key: string): string {
        let res: string = ""
        let parity: number = 0;
        for (let i = 0; i < msg.length; i++) {
            let keyChar: number = key.charCodeAt(i % key.length);
            //Log.log("keyChar " + key.charAt(i % key.length),LogLevel.LowLevelDebug);
            let char: number = msg.charCodeAt(i);
            //Log.log("char " + msg.charAt(i) + " charCode: " + char,LogLevel.LowLevelDebug);
            let cypher: number = (char ^ keyChar)
            parity = (parity + cypher % (16 * 16)) % (16 * 16);
            //Log.log("cypher " + (char ^ keyChar).toString() + " hex: "+ cypher,LogLevel.LowLevelDebug);
            res += this.pad(cypher);
        }
        return res + this.pad(parity);
    }

    private static pad(n: number): string {
        let s = n.toString(16);
        return (s.length == 1 ? "0" : "") + s;
    }

    private static decrypt(cypher: string, key: string): string {
        //Log.log("decrypt",LogLevel.LowLevelDebug);
        let res: string = ""
        let parity: number = 0;
        if (!cypher || cypher.length < 2 || cypher.length % 2 != 0) {
            return "";
        }
        for (let i = 0; i < cypher.length - 2; i += 2) {
            let keyChar: number = key.charCodeAt((i / 2) % key.length);
            //Log.log("keyChar " + key.charAt(i % key.length),LogLevel.LowLevelDebug);
            let char: number = (16 * parseInt(cypher.charAt(i), 16)) + parseInt(cypher.charAt(i + 1), 16)
            parity = (parity + char % (16 * 16)) % (16 * 16);
            //Log.log("char " + char,LogLevel.LowLevelDebug);
            //Log.log("encChar " + String.fromCharCode(char ^ keyChar) + " charCode: "+(char ^ keyChar),LogLevel.LowLevelDebug);
            res += String.fromCharCode(char ^ keyChar)
        }
        if (parity != (16 * parseInt(cypher.charAt(cypher.length - 2), 16)) + parseInt(cypher.charAt(cypher.length - 1), 16)) {
            return ""
        } else {
            return res
        }
    }

    toString(): string {
        return this.versionNumbers.join(".");
    }

    public static testhash() {
        let s = "1.0.0";
        let en = this.encrypt(s, Version.Key);
        let de = this.decrypt(en, Version.Key);
        Log.log("Hash Test: " + s + " -> " + en + " -> " + de, LogLevel.LowLevelDebug)
    }

    public static hash(version: string): string {
        let hash = this.encrypt(version, Version.Key);
        //Log.log("version: " + version + " hash: " + hash, LogLevel.LowLevelDebug);
        return hash;
    }

    //1: this is larger, -1 other is larger
    compare(other: Version): number {
        for (let i = 0; i < this.versionNumbers.length; i++) {
            if (i >= other.versionNumbers.length) return 1;
            if (this.versionNumbers[i] > other.versionNumbers[i]) return 1;
            if (this.versionNumbers[i] < other.versionNumbers[i]) return -1;
        }
        return this.versionNumbers.length < other.versionNumbers.length ? -1 : 0;
    }
}