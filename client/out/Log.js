'use strict';
const vscode = require("vscode");
const path = require('path');
const fs = require('fs');
const ViperProtocol_1 = require('./ViperProtocol');
class Log {
    static initialize(context) {
        Log.updateSettings();
        Log.rootPath = vscode.workspace.rootPath;
        if (!Log.rootPath) {
            Log.rootPath = path.dirname(vscode.window.activeTextEditor.document.fileName);
        }
        Log.logFilePath = path.join(Log.rootPath, '.vscode', Log.logFilePath);
        //create .vscode folder if not there yet
        if (!fs.existsSync(path.join(Log.rootPath, '.vscode'))) {
            fs.mkdirSync(path.join(Log.rootPath, '.vscode'));
        }
        Log._dotBasePath = path.join(Log.rootPath, '.vscode', 'heap');
        Log._svgBasePath = path.join(Log.rootPath, '.vscode', 'heap');
        Log.log("LogFilePath is: " + Log.logFilePath, ViperProtocol_1.LogLevel.LowLevelDebug);
        try {
            Log.createFile(Log.logFilePath);
            Log.logFile = fs.createWriteStream(Log.logFilePath);
            //make sure the logFile is closed when the extension is closed
            context.subscriptions.push(new Log());
        }
        catch (e) {
            Log.error("cannot write to LogFile, access denied. " + e);
        }
    }
    ///return the path to the indexth dot file
    ///creates non existing files
    static dotFilePath(index) {
        if (index < 0) {
            Log.error("don't use negative indices for dotFilePath");
            return this._dotBasePath + ".dot";
        }
        if (index >= this.MAX_DOT_FILES) {
            Log.error("don't use more than " + this.MAX_DOT_FILES + " dotFiles");
            return this._dotBasePath + ".dot";
        }
        return this._dotBasePath + index + ".dot";
    }
    static svgFilePath(index) {
        if (index < 0) {
            Log.error("don't use negative indices for svgFilePath");
            return this._svgBasePath + ".svg";
        }
        if (index >= this.MAX_DOT_FILES) {
            Log.error("don't use more than " + this.MAX_DOT_FILES + " svgFiles");
            return this._svgBasePath + ".svg";
        }
        return this._svgBasePath + index + ".svg";
    }
    static createFile(filePath) {
        if (!fs.existsSync(filePath)) {
            fs.closeSync(fs.openSync(filePath, 'w'));
            fs.accessSync(filePath);
        }
    }
    static writeToDotFile(graphDescription, index) {
        //delete and recreate file to fix the problem of not being able to open the dot files      
        let dotFilePath = this.dotFilePath(index);
        this.createFile(dotFilePath);
        let dotFile = fs.createWriteStream(dotFilePath);
        dotFile.write(graphDescription);
        dotFile.close();
    }
    static deleteDotFiles() {
        //delete all dotFiles
        for (let i = 0; i < this.MAX_DOT_FILES; i++) {
            this.deleteDotFile(i);
        }
        this._nofFiles = 0;
    }
    static deleteDotFile(index) {
        try {
            let dotFile = this.dotFilePath(index);
            if (fs.existsSync(dotFile)) {
                fs.unlinkSync(dotFile);
            }
            ;
        }
        catch (e) {
            Log.error("error deleting file " + index);
        }
    }
    static updateSettings() {
        let oldLogLevel = Log.logLevel;
        let settings = vscode.workspace.getConfiguration("viperSettings");
        Log.logLevel = settings.get("logLevel", ViperProtocol_1.LogLevel.Default);
        if (oldLogLevel && oldLogLevel != Log.logLevel)
            Log.log(`The logLevel was changed from ${ViperProtocol_1.LogLevel[oldLogLevel]} to ${ViperProtocol_1.LogLevel[Log.logLevel]}`, ViperProtocol_1.LogLevel.LowLevelDebug);
    }
    static log(message, logLevel = ViperProtocol_1.LogLevel.Default) {
        let messageNewLine = message + "\n";
        message = this.prefix(logLevel) + message;
        if (Log.logLevel >= logLevel) {
            console.log(message);
            Log.outputChannel.append(messageNewLine);
        }
        if (Log.logFile) {
            Log.logFile.write(messageNewLine);
        }
    }
    static prefix(logLevel) {
        if (logLevel <= ViperProtocol_1.LogLevel.Info)
            return "";
        if (logLevel == ViperProtocol_1.LogLevel.Debug)
            return "> ";
        if (logLevel > ViperProtocol_1.LogLevel.Debug) {
            return "- ";
        }
    }
    static toLogFile(message, logLevel = ViperProtocol_1.LogLevel.Default) {
        if (Log.logLevel >= logLevel && Log.logFile) {
            let messageNewLine = message + "\n";
            Log.logFile.write(messageNewLine);
        }
    }
    static error(message, logLevel = ViperProtocol_1.LogLevel.Debug) {
        let messageNewLine = "ERROR: " + message + "\n";
        if (Log.logLevel >= logLevel && Log.logFile) {
            console.error(message);
            Log.outputChannel.append(messageNewLine);
        }
        if (Log.logFile) {
            Log.logFile.write(messageNewLine);
        }
    }
    dispose() {
        Log.logFile.close();
    }
    static hint(message) {
        Log.log("H: " + message, ViperProtocol_1.LogLevel.Debug);
        vscode.window.showInformationMessage("Viper: " + message);
    }
}
Log.logFilePath = "viper_log";
Log.outputChannel = vscode.window.createOutputChannel('Viper');
Log._nofFiles = 0;
Log.MAX_DOT_FILES = 2;
exports.Log = Log;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0xvZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFFYixNQUFZLE1BQU0sV0FBTSxRQUFRLENBQUMsQ0FBQTtBQUNqQyxNQUFZLElBQUksV0FBTSxNQUFNLENBQUMsQ0FBQTtBQUM3QixNQUFZLEVBQUUsV0FBTSxJQUFJLENBQUMsQ0FBQTtBQUN6QixnQ0FBdUIsaUJBQWlCLENBQUMsQ0FBQTtBQUV6QztJQWFJLE9BQWMsVUFBVSxDQUFDLE9BQWdDO1FBQ3JELEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUNyQixHQUFHLENBQUMsUUFBUSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDO1FBQ3pDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7WUFDaEIsR0FBRyxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2xGLENBQUM7UUFDRCxHQUFHLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3RFLHdDQUF3QztRQUN4QyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3JELEVBQUUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDckQsQ0FBQztRQUVELEdBQUcsQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUM5RCxHQUFHLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFOUQsR0FBRyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsR0FBRyxHQUFHLENBQUMsV0FBVyxFQUFFLHdCQUFRLENBQUMsYUFBYSxDQUFDLENBQUE7UUFDckUsSUFBSSxDQUFDO1lBQ0QsR0FBRyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDaEMsR0FBRyxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBRXBELDhEQUE4RDtZQUM5RCxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDMUMsQ0FBRTtRQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDVCxHQUFHLENBQUMsS0FBSyxDQUFDLDBDQUEwQyxHQUFHLENBQUMsQ0FBQyxDQUFBO1FBQzdELENBQUM7SUFDTCxDQUFDO0lBRUQsMENBQTBDO0lBQzFDLDZCQUE2QjtJQUM3QixPQUFjLFdBQVcsQ0FBQyxLQUFhO1FBQ25DLEVBQUUsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1osR0FBRyxDQUFDLEtBQUssQ0FBQyw0Q0FBNEMsQ0FBQyxDQUFDO1lBQ3hELE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxHQUFHLE1BQU0sQ0FBQztRQUN0QyxDQUFDO1FBQ0QsRUFBRSxDQUFDLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1lBQzlCLEdBQUcsQ0FBQyxLQUFLLENBQUMsc0JBQXNCLEdBQUcsSUFBSSxDQUFDLGFBQWEsR0FBRyxXQUFXLENBQUMsQ0FBQztZQUNyRSxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksR0FBRyxNQUFNLENBQUM7UUFDdEMsQ0FBQztRQUNELE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxHQUFHLEtBQUssR0FBRyxNQUFNLENBQUM7SUFDOUMsQ0FBQztJQUVELE9BQWMsV0FBVyxDQUFDLEtBQWE7UUFDbkMsRUFBRSxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDWixHQUFHLENBQUMsS0FBSyxDQUFDLDRDQUE0QyxDQUFDLENBQUM7WUFDeEQsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLEdBQUcsTUFBTSxDQUFDO1FBQ3RDLENBQUM7UUFDRCxFQUFFLENBQUMsQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7WUFDOUIsR0FBRyxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsR0FBRyxJQUFJLENBQUMsYUFBYSxHQUFHLFdBQVcsQ0FBQyxDQUFDO1lBQ3JFLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxHQUFHLE1BQU0sQ0FBQztRQUN0QyxDQUFDO1FBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLEdBQUcsS0FBSyxHQUFHLE1BQU0sQ0FBQztJQUM5QyxDQUFDO0lBRUQsT0FBZSxVQUFVLENBQUMsUUFBZ0I7UUFDdEMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzQixFQUFFLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDekMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM1QixDQUFDO0lBQ0wsQ0FBQztJQUVELE9BQWMsY0FBYyxDQUFDLGdCQUF3QixFQUFFLEtBQWE7UUFDaEUsMkZBQTJGO1FBQzNGLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDMUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM3QixJQUFJLE9BQU8sR0FBbUIsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ2hFLE9BQU8sQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUNoQyxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDcEIsQ0FBQztJQUVELE9BQWMsY0FBYztRQUN4QixxQkFBcUI7UUFDckIsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDMUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxQixDQUFDO1FBQ0QsSUFBSSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUM7SUFDdkIsQ0FBQztJQUVELE9BQWMsYUFBYSxDQUFDLEtBQWE7UUFDckMsSUFBSSxDQUFDO1lBQ0QsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN0QyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDekIsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUMzQixDQUFDO1lBQUEsQ0FBQztRQUNOLENBQUU7UUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1QsR0FBRyxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsR0FBRyxLQUFLLENBQUMsQ0FBQztRQUM5QyxDQUFDO0lBQ0wsQ0FBQztJQUVELE9BQWMsY0FBYztRQUN4QixJQUFJLFdBQVcsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDO1FBQy9CLElBQUksUUFBUSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDbEUsR0FBRyxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFTLFVBQVUsRUFBRSx3QkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2xFLEVBQUUsQ0FBQyxDQUFDLFdBQVcsSUFBSSxXQUFXLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQztZQUMzQyxHQUFHLENBQUMsR0FBRyxDQUFDLGlDQUFpQyx3QkFBUSxDQUFDLFdBQVcsQ0FBQyxPQUFPLHdCQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsd0JBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUMvSCxDQUFDO0lBRUQsT0FBYyxHQUFHLENBQUMsT0FBZSxFQUFFLFFBQVEsR0FBYSx3QkFBUSxDQUFDLE9BQU87UUFDcEUsSUFBSSxjQUFjLEdBQUcsT0FBTyxHQUFHLElBQUksQ0FBQztRQUNwQyxPQUFPLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxPQUFPLENBQUM7UUFDMUMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsSUFBSSxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQzNCLE9BQU8sQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDckIsR0FBRyxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDN0MsQ0FBQztRQUNELEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ2QsR0FBRyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDdEMsQ0FBQztJQUNMLENBQUM7SUFFRCxPQUFlLE1BQU0sQ0FBQyxRQUFrQjtRQUNwQyxFQUFFLENBQUMsQ0FBQyxRQUFRLElBQUksd0JBQVEsQ0FBQyxJQUFJLENBQUM7WUFDMUIsTUFBTSxDQUFDLEVBQUUsQ0FBQztRQUNkLEVBQUUsQ0FBQyxDQUFDLFFBQVEsSUFBSSx3QkFBUSxDQUFDLEtBQUssQ0FBQztZQUMzQixNQUFNLENBQUMsSUFBSSxDQUFDO1FBQ2hCLEVBQUUsQ0FBQyxDQUFDLFFBQVEsR0FBRyx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDNUIsTUFBTSxDQUFDLElBQUksQ0FBQztRQUNoQixDQUFDO0lBQ0wsQ0FBQztJQUVELE9BQWMsU0FBUyxDQUFDLE9BQWUsRUFBRSxRQUFRLEdBQWEsd0JBQVEsQ0FBQyxPQUFPO1FBQzFFLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLElBQUksUUFBUSxJQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQzFDLElBQUksY0FBYyxHQUFHLE9BQU8sR0FBRyxJQUFJLENBQUM7WUFDcEMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDdEMsQ0FBQztJQUNMLENBQUM7SUFFRCxPQUFjLEtBQUssQ0FBQyxPQUFlLEVBQUUsUUFBUSxHQUFhLHdCQUFRLENBQUMsS0FBSztRQUNwRSxJQUFJLGNBQWMsR0FBRyxTQUFTLEdBQUcsT0FBTyxHQUFHLElBQUksQ0FBQztRQUNoRCxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxJQUFJLFFBQVEsSUFBSSxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUMxQyxPQUFPLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3ZCLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQzdDLENBQUM7UUFDRCxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUNkLEdBQUcsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ3RDLENBQUM7SUFDTCxDQUFDO0lBRU0sT0FBTztRQUNWLEdBQUcsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDeEIsQ0FBQztJQUVELE9BQWMsSUFBSSxDQUFDLE9BQWU7UUFDOUIsR0FBRyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsT0FBTyxFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDekMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxzQkFBc0IsQ0FBQyxTQUFTLEdBQUcsT0FBTyxDQUFDLENBQUM7SUFDOUQsQ0FBQztBQUNMLENBQUM7QUEzSlUsZUFBVyxHQUFHLFdBQVcsQ0FBQztBQUUxQixpQkFBYSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsT0FBTyxDQUFDLENBQUM7QUFJbkQsYUFBUyxHQUFXLENBQUMsQ0FBQztBQUc5QixpQkFBYSxHQUFXLENBQUMsQ0FBQztBQVh4QixXQUFHLE1BNkpmLENBQUEifQ==