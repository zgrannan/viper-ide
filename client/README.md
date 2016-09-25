Visual Sutio Code is a powerful GUI text editor which is a base for implementing features of an integrated verification environment for the Silver language.

This repository contains the source files of the VS Code Extension, installation instructions, and the needed files for installing it on OsX, Debian, and Windows.

# Installation

## 1. Install VS Code

You can download the installer for VS Code from here: https://code.visualstudio.com/download

## 2. Setup the Viper Toolchain

You can either use the prepackaged ViperTools directory or assemble the necessary tools on your own as described in 2.1 and 2.2.

The prepackaged ViperTools directory can be downloaded from: ...,
Put its extracted content into the following location and continue with 3.  
Windows: ```%ProgramFiles%\Viper``` which defaults to ```C:\Program Files (x86)\Viper```  
Mac/Linux: ```/usr/local/Viper```  

### 2.1. Create jar-files for verification backends

Assemble (or otherwise obtain) a fat jar for each Viper backend (Silicon, Carbon, ...) you want to use from the IDE.

To assemble a fat jar, cd into the backend's checkout directory and run
```bash
$ sbt assembly
```
If successful, the assembled fat jar should be at `./target/scala-2.11/<backend>.jar`.

Put all the jars in your user's default java extentions directory. For example, if
you have a assembled `silicon.jar`, you should do the following:

```bash
$ mkdir -p ~/Library/Java/Extensions
$ cp ~/viper/silicon/target/scala-2.11/silicon.jar ~/Library/Java/Extensions
```

### 2.2. Install nailgun

Optionally, if you don't want to wait for a few seconds for each verification procedure
(known as the JVM startup overhead), install [nailgun](http://martiansoftware.com/nailgun):

```bash
$ mkdir -p ~/viper/tools/nailgun
$ cd ~/viper/tools/nailgun
$ git clone https://github.com/martylamb/nailgun.git .
$ make && sudo make install
```

This will install the nailgun client, which could be used through the ```ng``` command.

In order to install the server, one should get Apache Maven. Download the archive with
Maven binaries from here: http://maven.apache.org/download.cgi
(the current version is 3.3.3).

```bash
$ mkdir ~/viper/tools/maven
$ unzip ~/Downloads/apache-maven-3.3.3-bin.zip -d ~/viper/tools/maven
$ ../maven/bin.mvn dependency::tree
$ cp nailgun-server-0.9.2-SNAPSHOT.jar ~/Library/Java/Extensions
```

## 3. Install the Extension

Install the viper IDE extension using the command pallete (```F1``` or ```ctrl+shift+p```/```cmd+shift+p```) ```ext install viper advanced```
VS Code informs you that the extension is only ready after the next restart of VS Code. 

More information on how to install an extension can be found at: [Managing Extensions in VS Code](https://code.visualstudio.com/docs/editor/extension-gallery?pub=felixfbecker&ext=php-debug)

## 4. Run the IDE

Start VS Code and open the folder in which you would like to work on your viper source code files.  
As soon as a ```.sil``` or ```.vpr``` source file is opened the extension is activated.
When the file is saved the verification is triggered.  

## 5. Customize the Settings

You might want to change the default behaviour of the Viper IDE. This can be achieved by customizing the settings.


The extension expects the ViperTools directory to be at:  
Windows: ```%ProgramFiles%\Viper``` which defaults to ```C:\Program Files (x86)\Viper```  
Mac/Linux: ```/usr/local/Viper```  

If the ViperTools directory is at another location you need to change the viperSettings.viperToolsPath accordingly.

You can open the settings in VS Code through the menu or using the command palette (```F1``` or ```ctrl+shift+p```/```cmd+shift+p```) ```settings```    

You cannot change the default setting, but have to copy the default viperSettings to your own settings.
For all settings you don't include in your settings, VS Code is the default settings.
The default settings open up together with your settings. 
Open the command palette (```F1```), type ```settings```, and select ```open user settings``` or ```open workspace settings``` from the dropdown menu to open the default settings next to your own settings.
The user settings are valid for the current user whereas the workspace settings only affect the currently open folder.

More Information on the Settings in VSCode can be found here: [User and Workspace Settings in VS Code](https://code.visualstudio.com/docs/customization/userandworkspace)

## 5.1 List of all viperSettings

* **viperToolsPath:** Path to the folder containing all the ViperTools
* **nailgunSettings:** All nailgun related settings
  * **serverJar:** The path to the nailgun server jar.
  * **clientExecutable:** The path to the nailgun client executable 
  * **port:** The port used for the communication between nailgun client and server
  * **timeout:** After timeout ms the startup of the nailgun server is expected to have failed and thus aborted
* **verificationBackends:** Description of backends
  * **name:** The unique name of this backend
  * **paths:** List of paths locating all used jar files, the files can be addressed directly or via folder, in which case all jar files in the folder are included
  * **useNailgun:** Enable to run the backend through nailgun, speeding up the process by reusing the same Java Virtual Machine
  * **timeout:** After timeout ms the verification is expected to be non terminating and is thus aborted.
  * **stages:** A list of verification stages
    * **name:** The per backend unique name of this stage
    * **isVerification:** Enable if this stage is describing a verification
    * **mainMethod:** The method to invoke when staring the stage
    * **customArguments:** the commandline arguments for the nailgun client (or java, when useNailgun is disabled)
    * **onParsingError:** The name of the stage to start in case of a parsing error
    * **onTypeCheckingError:** The name of the stage to start in case of a type checking error
    * **onVerificationError:** The name of the stage to start in case of a verification error
    * **onSuccess:** The name of the stage to start in case of a success
* **z3Executable:** The path to the z3 executable
* **boogieExecutable:** The path to the boogie executable
* **autoSave:** Enable automatically saving modified viper files
* **logLevel:** Verbosity of the output, all output is written to the logFile, regardless of the logLevel
* **autoVerifyAfterBackendChange:** Reverify the open viper file upon backend change.
* **showProgress:** Display the verification progress in the status bar. Only useful if the backend supports progress reporting.
* **advancedFeatures:** Enable heap visualization, stepwise debugging and execution path visualization
* **dotExecutable:** The path to the dot executable.
* **showSymbolicState:** Show the symbolic values in the heap visualization. If disabled, the symbolic values are only shown in the error states.
* **darkGraphs:** To get the best visual heap representation, this setting should match with the active theme.
* **simpleMode:** Useful for verifying programs. Disable when developing the backend
* **verificationBufferSize:** Maximal buffer size for verification in KB