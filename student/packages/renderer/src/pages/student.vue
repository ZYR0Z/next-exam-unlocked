<template>


<div  id="apphead" class="w-100 p-3 text-white bg-dark shadow text-right ">
    <img src='/src/assets/img/svg/speedometer.svg' class="white me-2  " width="32" height="32" >
    <span class="fs-4 align-middle me-4 ">Next-Exam</span>
    <span class="fs-4 align-middle  ms-3" style="float: right">Student</span>
    <div v-if="token" id="adv" class="btn btn-success btn-sm m-0  mt-1 " style="cursor: unset; float: right">{{ $t("student.connected") }}</div>
    <div v-if="!hostip" id="adv" class="btn btn-danger btn-sm m-0  mt-1 " style="cursor: unset; float: right">{{ $t("student.offline") }}</div>
    <div v-if="networkerror" id="adv" class="btn btn-danger btn-sm m-0  mt-1 " style="cursor: unset; float: right">{{ $t("student.noapi") }}</div>
</div>
 

<div id="wrapper" class="w-100 h-100 d-flex" >

    <!-- SIDEBAR -->
    <div class="p-3 text-white bg-dark h-100" style="width: 240px; min-width: 240px;">
        <div class="btn btn-light m-0 text-start infobutton">
            <img src='/src/assets/img/svg/server.svg' class="me-2"  width="16" height="16" > {{$t('student.exams')}} 
        </div><br>
        <div v-if="!advanced" id="adv"  class="btn btn-sm btn-outline-secondary mt-2" @click="toggleAdvanced();"> {{ $t("student.advanced") }}</div>
        <div v-if="advanced" id="adv"  class="btn btn-sm btn-outline-secondary mt-2" @click="toggleAdvanced();"> {{ $t("student.simple") }}</div>
        
        <div v-if="config.bipIntegration" @click="clearUser()" class="form-check form-switch  m-1 mb-2 mt-4" style="font-size:0.9em">
            <!-- Checkbox mit dem Label "BiP Login" -->
            <input class="form-check-input" type="checkbox" id="bipLogin" v-model="biplogin"> 
            <label class="form-check-label" for="bipLogin"> BiP Login</label>
        </div>


        
        <div  id="biploginbutton" v-if="biplogin" @click="loginBiP" class="btn btn-info mb-1 me-0" style="padding:0;">
            <img v-if="biplogin" style="width:100%; border-top-left-radius:3px;border-top-right-radius:3px; margin:0; " src="/src/assets/img/login_students.jpg">
             <span id="biploginbuttonlabel">Bildungsportal - Login</span>
        </div> 
        


        <div class="m-2">
            <br><div id="statusdiv" class="btn btn-warning m-1"></div>
        </div>
        <br>

        <span @click="showCopyleft()" style="position: absolute; bottom:2px; left: 6px; font-size:0.8em;cursor: pointer;">
            <span style=" display:inline-block; transform: scaleX(-1);font-size:1.2em; ">&copy; </span> 
            <span style="vertical-align: text-bottom;">&nbsp;{{version}}</span>
        </span>

    </div>

    <!-- CONTENT -->
    <div id="content" class="fadeinslow p-3">



        <div class="col-8 mb-2">
            <div v-if="!biplogin" class="input-group  mb-1">
                <span class="input-group-text col-3" style="width:100px;" id="inputGroup-sizing-lg">{{ $t("student.name") }}</span>
                <input v-model="username" type="text" required="required" maxlength="25" class="form-control" id="user" placeholder="" style="width:200px;max-width:200px;min-width:135px;">
            </div> 

            <div v-if="biplogin" class="input-group  mb-1">
                <span class="input-group-text col-3" style="width:100px;" id="inputGroup-sizing-lg">{{ $t("student.name") }}</span>
               
                <span v-if="username" class="input-group-text col-3" style="width:200px;" id="inputGroup-sizing-lg"> {{ username  }} </span>
                <span v-else class="input-group-text col-3 " style="width:200px;" id="inputGroup-sizing-lg">  </span>
               
            </div> 
      
            <div class="input-group  mb-1"> 
                <span class="input-group-text col-3" style="width:100px;" id="inputGroup-sizing-lg">{{ $t("student.pin") }}</span>
                <input  v-model="pincode" type="number" min="0" oninput="validity.valid||(value='')" class="form-control" id="pin" placeholder="" style="width:135px;max-width:135px;min-width:135px;">
            </div>
            <div v-if="advanced" class="input-group  mb-1"> 
                <span class="input-group-text col-3" style="width:100px;" id="inputGroup-sizing-lg">{{ $t("student.ip") }}</span>
                <input  v-model="serverip" class="form-control" id="serverip" placeholder="" style="width:135px;max-width:135px;min-width:135px;">
            </div>
        </div>
  
  
       
   
        <h4 class="mt-4">{{ $t("student.exams") }}</h4>
        <div id="list" class="" style="overflow-y:auto; height: 369px; display:flex; flex-wrap: wrap; flex-direction: row;">
            <div v-for="server in serverlist" class="row p-3 m-0 mb-2 border bg-light" style="border-radius: 4px; margin-right: 10px !important; min-height:100px; max-height:100px;  min-width:234px; max-width: 234px;">
                <strong style="padding:0px;">{{server.servername}}
                <img v-if="!server.reachable" src="/src/assets/img/svg/emblem-warning.svg" :title="$t('student.unreachable')"  style="width:20px;float:right;vertical-align:top;cursor: help;" ></strong>  
                <input v-if="!token" :id="server.servername" type="button" name="register" class="btn btn-sm btn-info" :value="$t('student.register')" @click="registerClient(server.serverip,server.servername)"/>
                <input v-if="token && clientinfo.servername !== server.servername" :id="server.servername" disabled type="button" name="register" class="btn btn-secondary" :value="$t('student.register')" />
                <input v-if="token && clientinfo.servername === server.servername" :id="server.servername" disabled type="button" name="register" class="btn btn-success" :value="$t('student.registered')" />
            </div>
            <div v-if="serverlist.length === 0"><h5>0</h5> </div>
        </div>
    </div>
</div>


</template>


<script>
import axios from "axios"
import validator from 'validator'
import $ from 'jquery'
import log from 'electron-log/renderer'

// Erfassen von unhandled promise rejections
window.addEventListener('unhandledrejection', event => {
  log.error('Unhandled promise rejection:', event.reason); // Loggen des Fehlers
});

Object.assign(console, log.functions);  //alle console logs durch logger ersetzen



export default {
    data() {
        return {
            version: this.$route.params.version,
            info: config.info,
            token: "",
            username: config.development ? "Thomas":"",
            pincode: config.development ? "1337":"",
            clientinfo: {},
            serverlist: [],
            fetchinterval: null,
            serverApiPort: this.$route.params.serverApiPort,
            clientApiPort: this.$route.params.clientApiPort,
            electron: this.$route.params.electron,
            config: this.$route.params.config,
            startExamEvent: null,
            advanced: false,
            serverip: "",
            servername: "",
            hostip: config.hostip,
            biplogin: false,
            networkerror: false
        };
    },
    methods: {
        loginBiP(){
            let IPCresponse = ipcRenderer.sendSync('loginBiP')
            console.log(IPCresponse)
        },
        clearUser(){
            this.username = ""
        },  

        // Überprüfen, ob der String Base64-codiert ist
        isBase64(str) {
            try {
                return btoa(atob(str)) === str;
            } catch (err) {
                return false;
            }
        },

        // Base64-String dekodieren und mögliche Tokens extrahieren
        decodeBase64AndExtractTokens(base64Str) {
            if (!this.isBase64(base64Str)) {
                return null;
            }
            const decodedStr = atob(base64Str);
            const tokens = decodedStr.split(/[:\s,]+/); // Trennzeichen anpassen, falls nötig
            return tokens;
        },








        async fetchInfo() {
            let getinfo = await ipcRenderer.invoke('getinfoasync')  // gets serverlist and clientinfo from multicastclient
            
            this.clientinfo = getinfo.clientinfo;
            this.token = this.clientinfo.token;

            if (getinfo.serverlist.length  === 0) {
                if (validator.isIP(this.serverip) || validator.isFQDN(this.serverip)){
                        //console.log("student.vue: fetching exams from server")
                        //give some userfeedback here
                        if (this.serverlist.length == 0){
                            this.status("Suche Prüfungen...")
                        }
                    
                        axios.get(`https://${this.serverip}:${this.serverApiPort}/server/control/serverlist`)
                        .then( response => { if (response.data && response.data.status == "success") {  this.serverlist = response.data.serverlist} }) 
                        .catch(err => { 
                            log.error(`student.vue: ${err.message}`); 
                            this.networkerror = true
                        }) 
                }
                else { this.serverlist = getinfo.serverlist;  }
            }
            else { this.serverlist = getinfo.serverlist;   }

            // check im networkconnection is still alive - otherwise exit here
            this.hostip = ipcRenderer.sendSync('checkhostip')
            if (!this.hostip) return;  
            for (let server of this.serverlist){ 
                    axios({method:'get',url:`https://${server.serverip}:${this.serverApiPort}/server/control/pong`, timeout:2000})
                    .then( response => { server.reachable=true }) 
                    .catch(err => { console.log(err.message);server.reachable=false  }) 
            }
        },  
        
        toggleAdvanced(){
            if (this.advanced) {this.advanced = false} else {this.advanced = true}
            this.serverip = ""
        },
        
        //show status message
        async status(text){  
            $("#statusdiv").text(text)
            $("#statusdiv").fadeIn("slow")
            await this.sleep(2000);
            $("#statusdiv").fadeOut("slow")
        },
         // implementing a sleep (wait) function
         sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },


        /** register client on the server **/
        registerClient(serverip, servername){
           if (this.username === ""){
               this.$swal.fire({
                    title: "Error",
                    text: this.$t("student.nouser"),
                    icon: 'error',
                    showCancelButton: false,
                })
            }
            else if(this.pincode ===""){
                this.$swal.fire({
                    title: "Error",
                    text: this.$t("student.nopin"),
                    icon: 'error',
                    showCancelButton: false,
                })
            }
            else {
                //check username - remove leading and trailing spaces
                this.username = this.username.replace(/^\s+|\s+$/g, '');

                let IPCresponse = ipcRenderer.sendSync('register', {clientname:this.username, servername:servername, serverip, serverip, pin:this.pincode })
                console.log(IPCresponse.message)
                if (IPCresponse && IPCresponse.token){
                    this.token = IPCresponse.token  // set token (used to determine server connection status)
                }

                if (IPCresponse.status === "success") {
                        this.$swal.fire({
                            title: "OK",
                            text: this.$t("student.registeredinfo"),
                            icon: 'success',
                            timer: 3000,
                            showCancelButton: false,
                            didOpen: () => { this.$swal.showLoading(); },
                        })

               
                    }
                if (IPCresponse.status === "error") {
                    this.$swal.fire({
                        title: "Error",
                        text: IPCresponse.message,
                        icon: 'error',
                        showCancelButton: false,
                    })
                }
            }
        },
        showCopyleft(){
            this.$swal.fire({
                title: "<span style='display:inline-block; transform: scaleX(-1); vertical-align: middle; cursor: pointer;'>&copy;</span>",
                icon: 'info',
                html: `
                Thomas Michael Weissel <br>
                <span style="font-size:0.8em">
                  <a href="https://next-exam.at/#kontakt" target="_blank">next-exam.at</a>
                </span><br><br>
                <span style="font-size:0.8em">Version: ${this.version} ${this.info}</span>
                `,
            })
        },
        fetchBiPData(base64String){

            const tokens = this.decodeBase64AndExtractTokens(base64String);
            console.log(tokens); // Zeigt die extrahierten Tokens, falls vorhanden
            let token = tokens[1]

            const url = `https://www.bildung.gv.at/webservice/rest/server.php?wstoken=${token}&wsfunction=core_webservice_get_site_info&moodlewsrestformat=json`
                                                                             
            console.log(url)

            fetch(url, { method: 'POST'})
            .then( res => res.json() )
            .then( response => {
                console.log(response)
                this.$swal.fire({
                        title: "BiP Response",
                        text: "Verbindung hergestellt",
                        icon: 'info',
                        showCancelButton: false,
                })
                if (response.fullname){
                    this.username = response.fullname
                    $("#biploginbuttonlabel").text("verbunden")
                    $("#biploginbutton").prop("disabled", true);
                }
            })
            .catch(err => { console.warn(err) })
        }
    },
    mounted() {  
        $("#statusdiv").hide()
        this.fetchInfo();
        this.fetchinterval = setInterval(() => { this.fetchInfo() }, 4000)

        // add event listener to user input field to supress all special chars 
        document.getElementById("user").addEventListener("keypress", function(e) {
            var lettersOnly = /^[a-zA-Z ]+$/;
            var key = e.key || String.fromCharCode(e.which);
            if (!lettersOnly.test(key)) { e.preventDefault(); }
        });

        ipcRenderer.on('bipToken', (event, token) => {  
            console.log("token received: ",token)
            this.fetchBiPData(token)
        });


    },
    beforeUnmount() {
        clearInterval( this.fetchinterval )
    }
}
</script>

<style scoped>
    
#content {
    background-color: whitesmoke;
    min-width: 680px;
}

.infobutton{
    width: 224px;
    min-width: 224px;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    background-color: whitesmoke;
}

</style>
