/**
 * @license GPL LICENSE
 * Copyright (c) 2021-2022 Thomas Michael Weissel
 * 
 * This program is free software: you can redistribute it and/or modify it 
 * under the terms of the GNU General Public License as published by the Free Software Foundation,
 * either version 3 of the License, or any later version.
 * 
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 * 
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <http://www.gnu.org/licenses/>
 */


/**
 * most of the keyboard restrictions could be handled by "iohook" for all platforms
 * unfortunalety it's not yet released for node v16.x and electron v16.x  (also it's "big sur" intel only on macs)
 * https://wilix-team.github.io/iohook/installation.html
 * 
 * "node-global-key-listener" would be another solution for windows and macos (although it requires "accessability" permissions on mac)
 * but for now it seems the module can not run in a final electron build
 * https://github.com/LaunchMenu/node-global-key-listener/issues/18
 * 
 * hardcoding the keyboardshortcuts we want to capture into iohook(or n-g-k-l) and manually compiling it for mac and windows could be done - (but not until i get paid for this amount of work ;-) 
 */


/**
 * the next best solution i came up with is to kill all of the shells - starting with explorer.exe because its absolutely impossible to 
 * deactivate this nasty "windows" button or 3FingerSlideUp Gesture in windows 11 - you could edit the registry and reboot but thats obviously not what we want
 */

import { join } from 'path'
import childProcess from 'child_process'   //needed to run bash commands on linux 
import { TouchBar } from 'electron'
import config from '../config.js';

// unfortunately there is no convenient way for gnome-shell to un-set ALL shortcuts at once
const gnomeKeybindings = [  
    'activate-window-menu','maximize-horizontally','move-to-side-n','move-to-workspace-8','switch-applications','switch-to-workspace-3','switch-windows-backward',
    'always-on-top','maximize-vertically','move-to-side-s','move-to-workspace-9','switch-applications-backward','  switch-to-workspace-4','toggle-above',
    'begin-move','minimize','move-to-side-w','move-to-workspace-down','switch-group','switch-to-workspace-5','toggle-fullscreen',
    'begin-resize','move-to-center','move-to-workspace-1','move-to-workspace-last','switch-group-backward','switch-to-workspace-6','toggle-maximized',
    'close','move-to-corner-ne','move-to-workspace-10','move-to-workspace-left','switch-input-source','switch-to-workspace-7','toggle-on-all-workspaces',
    'cycle-group','move-to-corner-nw','move-to-workspace-11','move-to-workspace-right','switch-input-source-backward  switch-to-workspace-8','toggle-shaded',
    'cycle-group-backward','move-to-corner-se','move-to-workspace-12','move-to-workspace-up','switch-panels','switch-to-workspace-9','unmaximize',
    'cycle-panels','move-to-corner-sw','move-to-workspace-2','panel-main-menu','switch-panels-backward','switch-to-workspace-down',      
    'cycle-panels-backward','move-to-monitor-down','move-to-workspace-3','panel-run-dialog','switch-to-workspace-1','switch-to-workspace-last',              
    'cycle-windows','move-to-monitor-left','move-to-workspace-4','raise','switch-to-workspace-10','switch-to-workspace-left',    
    'cycle-windows-backward','move-to-monitor-right','move-to-workspace-5','raise-or-lower','switch-to-workspace-11','switch-to-workspace-right',   
    'lower','move-to-monitor-up','move-to-workspace-6','set-spew-mark','switch-to-workspace-12','switch-to-workspace-up',     
    'maximize','move-to-side-e','move-to-workspace-7','show-desktop','switch-to-workspace-2','switch-windows'  
]
const gnomeShellKeybindings = ['focus-active-notification','open-application-menu','screenshot','screenshot-window','shift-overview-down',
    'shift-overview-up','switch-to-application-1','switch-to-application-2','switch-to-application-3','switch-to-application-4','switch-to-application-5',
    'switch-to-application-6','switch-to-application-7','switch-to-application-8','switch-to-application-9','show-screenshot-ui','show-screen-recording-ui',
    'toggle-application-view','toggle-message-tray','toggle-overview'  ]

const gnomeMutterKeybindings = ['rotate-monitor','switch-monitor','tab-popup-cancel','tab-popup-select','toggle-tiled-left','toggle-tiled-right']

const gnomeDashToDockKeybindings = ['app-ctrl-hotkey-1','app-ctrl-hotkey-10','app-ctrl-hotkey-2','app-ctrl-hotkey-3','app-ctrl-hotkey-4','app-ctrl-hotkey-5',
    'app-ctrl-hotkey-6','app-ctrl-hotkey-7','app-ctrl-hotkey-8','app-ctrl-hotkey-9',
    'app-hotkey-1','app-hotkey-10','app-hotkey-2','app-hotkey-3','app-hotkey-4','app-hotkey-5','app-hotkey-6','app-hotkey-7','app-hotkey-8','app-hotkey-9',
    'app-shift-hotkey-1','app-shift-hotkey-10','app-shift-hotkey-2','app-shift-hotkey-3','app-shift-hotkey-4','app-shift-hotkey-5',
    'app-shift-hotkey-6','app-shift-hotkey-7','app-shift-hotkey-8','app-shift-hotkey-9','shortcut']




function enableRestrictions(win){

    /**
     * L I N U X
     */
    if (process.platform === 'linux') {
        
        //////////////
        // PLASMASHELL
        //////////////

        console.log("enabling platform restrictions")
        
        //disable META Key for Launchermenu
        //childProcess.execFile('sed', ['-i', '-e', 's/global=Alt+F1/global=/g', `${config.homedirectory}/.config/plasma-org.kde.plasma.desktop-appletsrc` ])   // alt+f1 or f2 is translated by "kickoff" to meta/win/cmd shortcut (wtf)
        //childProcess.execFile('qdbus', ['org.kde.plasmashell','/PlasmaShell','refreshCurrentShell'])    // i really dont like that but this is the fastest way i found to disable the windows/meta key
        childProcess.execFile('kwriteconfig5', ['--file',`${config.homedirectory}/.config/kwinrc`,'--group','ModifierOnlyShortcuts','--key','Meta','""']) 
        childProcess.execFile('qdbus', ['org.kde.KWin','/KWin','reconfigure'])


        // Temporarily deactivate ALL global keyboardshortcuts 
        childProcess.execFile('qdbus', ['org.kde.kglobalaccel' ,'/kglobalaccel', 'blockGlobalShortcuts', 'true'])
        // Temporarily deactivate ALL 3d Effects (present window, change desktop, etc.) 
        childProcess.execFile('qdbus', ['org.kde.KWin' ,'/Compositor', 'org.kde.kwin.Compositing.suspend'])
        // Clear Clipboard history 
        childProcess.execFile('qdbus', ['org.kde.klipper' ,'/klipper', 'org.kde.klipper.klipper.clearClipboardHistory'])
        // wayland
        childProcess.execFile('wl-copy', ['-c'])

    


        //////////
        // GNOME
        ///////////

        //we probably should do it the "windows - way" and just kill gnomeshell for as long as the exam-mode is active
        

        // for gnome3 we need to set every key individually => reset will obviously set defaults (so we may mess up customized shortcuts here)
        // possible fix: instead of set > reset we could use get - set - set.. first get the current bindings and store them - then set to nothing - then set to previous setting
        for (let binding of gnomeKeybindings){
            childProcess.execFile('gsettings', ['set' ,'org.gnome.desktop.wm.keybindings', `${binding}`, `['']`])
        }

        for (let binding of gnomeShellKeybindings){
            childProcess.execFile('gsettings', ['set' ,'org.gnome.shell.keybindings', `${binding}`, `['']`])
        }

        for (let binding of gnomeMutterKeybindings){
            childProcess.execFile('gsettings', ['set' ,'org.gnome.mutter.keybindings', `${binding}`, `['']`])
        }

        for (let binding of gnomeDashToDockKeybindings){  // we could use gsettings reset-recursively org.gnome.shell to reset everything
            childProcess.execFile('gsettings', ['set' ,'org.gnome.shell.extensions.dash-to-dock', `${binding}`, `['']`])
        }

        childProcess.execFile('gsettings', ['set' ,'org.gnome.mutter', `overlay-key`, `''`])


        // clier clipboard gnome and x11  (this will fail unless xclip or xsell are installed)
        childProcess.exec('xclip -i /dev/null')
        childProcess.exec('xclip -selection clipboard')
        childProcess.exec('xsel -bc')
    }




    /**
     *  W I N D O W S
     */
    if (process.platform === 'win32') {
        //block important keyboard shortcuts (disable-shortcuts.exe is a selfmade C application - shortcuts are hardcoded there - need to rebuild if adding shortcuts)
        let executable1 = join(__dirname, '../../public/disable-shortcuts.exe')
        childProcess.execFile(executable1, [], { detached: true, shell: false, windowsHide: true}, (error, stdout, stderr) => {
            if (stderr) {  console.log(stderr)  }
            if (error)  {  console.log(error)   }
        })

        //clear clipboard - stop copy before and paste after examstart
        let executable0 = join(__dirname, '../../public/clear-clipboard.bat')
        childProcess.execFile(executable0, [], (error, stdout, stderr) => {
            if (stderr) { console.log(stderr) }
            if (error) { console.log(error) }
        })


        // kill windowsbutton and swipe gestures - kill everything else
        childProcess.exec('taskkill /f /im explorer.exe', (error, stdout, stderr) => {
            if (error) {
              console.error(`exec error: ${error}`);
              return;
            }
            console.log(`stdout: ${stdout}`);
            console.error(`stderr: ${stderr}`);
          });


    }





    /**
     * M A C O S  
     */
    if (process.platform === 'darwin') {
        const { TouchBarLabel, TouchBarButton, TouchBarSpacer } = TouchBar
        const textlabel = new TouchBarLabel({label: "Next-Exam"})
        const touchBar = new TouchBar({
            items: [
            new TouchBarSpacer({ size: 'flexible' }),
            textlabel,
            new TouchBarSpacer({ size: 'flexible' }),
            ]
        })
        win?.setTouchBar(touchBar)

        // clear clipboard
        childProcess.exec('pbcopy < /dev/null')
    }
}




function disableRestrictions(){
    // disable global keyboardshortcuts on PLASMA/KDE
    if (process.platform === 'linux') {
        // reset all shortcuts KDE
        childProcess.execFile('qdbus', ['org.kde.kglobalaccel' ,'/kglobalaccel', 'blockGlobalShortcuts', 'false'])
        // activate ALL 3d Effects (present window, change desktop, etc.) 
        childProcess.execFile('qdbus', ['org.kde.KWin' ,'/Compositor', 'org.kde.kwin.Compositing.resume'])
        
        //enable META Key for Launchermenu
        //childProcess.execFile('sed', ['-i', '-e', 's/global=.*/global=Alt+F1/g', `${config.homedirectory}/.config/plasma-org.kde.plasma.desktop-appletsrc` ])
        childProcess.execFile('kwriteconfig5', ['--file',`${config.homedirectory}/.config/kwinrc`,'--group','ModifierOnlyShortcuts','--key','Meta','--delete']) 
        childProcess.execFile('qdbus', ['org.kde.KWin','/KWin','reconfigure'])


        // reset specific shortcuts GNOME
        for (let binding of gnomeKeybindings){
            childProcess.execFile('gsettings', ['reset' ,'org.gnome.desktop.wm.keybindings', `${binding}`])
        }
        for (let binding of gnomeShellKeybindings){
            childProcess.execFile('gsettings', ['reset' ,'org.gnome.shell.keybindings', `${binding}`])
        }
        for (let binding of gnomeMutterKeybindings){
            childProcess.execFile('gsettings', ['reset' ,'org.gnome.mutter.keybindings', `${binding}`])
        }
        for (let binding of gnomeDashToDockKeybindings){
            childProcess.execFile('gsettings', ['reset' ,'org.gnome.shell.extensions.dash-to-dock', `${binding}`])
        }

        childProcess.execFile('gsettings', ['reset' ,'org.gnome.mutter', `overlay-key`])
    }


    /**
     *  W I N D O W S
     */
    if (process.platform === 'win32') {
        //unblock important keyboard shortcuts (disable-shortcuts.exe)
 
        childProcess.exec('taskkill /f /im disable-shortcuts.exe', (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                return;
            }
            console.log(`stdout: ${stdout}`);
            console.error(`stderr: ${stderr}`);
          });


        // start explorer.exe windowsshell again
        childProcess.exec('start explorer.exe', (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                return;
            }
            console.log(`stdout: ${stdout}`);
            console.error(`stderr: ${stderr}`);
        });
    }


    // TODO: undo restrictions mac (currently only touchbar which should be reset once we close next-exam)
}

export {enableRestrictions, disableRestrictions}