<template>


<div class="w-100 p-3 text-white bg-dark shadow text-right">
    <router-link to="/" class="text-white m-1">
        <img src="/src/assets/img/svg/shield-lock-fill.svg" class="white me-2  " width="32" height="32" >
        <span class="fs-4 align-middle me-4 ">Next-Exam</span>
    </router-link>
    <span class="fs-4 align-middle ms-3" style="float: right">Teacher</span>
     <div v-if="!hostip" id="adv" class="btn btn-danger btn-sm m-0  mt-1 " style="cursor: unset; float: right">{{ $t("general.offline") }}</div>
</div>
 
 
<div v-if="!electron" id="wrapper" class="w-100 h-100 d-flex" >

    <div class="p-3 text-white bg-dark h-100 " style="width: 240px; min-width: 240px;">
        <ul class="nav nav-pills flex-column mb-auto ">
            <li class="nav-item">
                <router-link to="startserver" id="startserver" class="nav-link">
                <img src="/src/assets/img/svg/server.svg" class="white me-2"  width="16" height="16" >
                {{$t("general.startserver")}}
                </router-link >
            </li>
            <li>
                <div class="btn btn-light m-0 text-start infobutton">
                    <img src='/src/assets/img/svg/person-lines-fill.svg' class="me-2"  width="16" height="16" > 
                    {{$t("general.slist")}}
                </div><br>

            </li>
        </ul>
        <div class="m-2">
            <br>
            <div id="statusdiv" class="btn btn-warning m-2 hidden"> </div>
        </div>
        <br>
        <span style="position: absolute; bottom:2px; left: 4px; font-size:0.8em">{{version}}</span>

    </div>

    <div id="content" class="fadeinslow p-3">
        <div id="list" class="container-fluid m-0 p-0">
            <div class='row g-2'>
                <div  v-for="server in serverlist" class="col-6" style="min-width:310px; max-width: 370px;">
                    <div class="p-3 border bg-light">
                        <dl class="row mb-0">
                            <dt class="col-sm-4 p-1"> {{$t("serverlist.name")}}</dt>
                            <dd class="col-sm-8 p-1">{{server.servername}}</dd>
                            <!-- <dt class="col-sm-4 p-1">IP Address</dt>
                            <dd class="col-sm-8 p-1">{{server.serverip}}</dd> -->
                            <dt class="col-sm-4 p-1 pt-2"> {{$t("serverlist.pwd")}}</dt>
                            <dd class="col-sm-8 p-1">
                                <input v-bind:id="server.servername" type="password" class="form-control" placeholder="password" :value="password">
                                <input @click="login(server.servername)" type="button" name="login" class="btn btn-success mt-1" :value=" $t('serverlist.login')"/> 
                            </dd>
                        </dl>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

</template>


<script>
import $ from 'jquery'
import axios from "axios";

export default {
    data() {
        return {
            version: this.$route.params.version,
            title: document.title,
            fetchinterval: null,
            serverlist: [],
            password: config.development ? "password":"",
            serverApiPort: this.$route.params.serverApiPort,
            electron: this.$route.params.electron,
            hostname: window.location.hostname,
            hostip: config.hostip
        };
    },
    components: { },
    methods: {
        fetchInfo() {
            axios.get(`https://${this.hostname}:${this.serverApiPort}/server/control/serverlist`)
            .then( response => {
                this.serverlist = response.data.serverlist;
            })
            .catch( err => {console.log(err)});
        },  

        login(servername){
            let password = $(`#${servername}`).val()
            if (password === ""){this.status(this.$t("serverlist.nopw") ); }


            axios.get(`https://${this.hostname}:${this.serverApiPort}/server/control/checkpasswd/${servername}/${password}`)
            .then(response => { 
                if (response.data.status === "success") { 
                    if (this.electron){
                        this.$router.push({  // for some reason this doesn't work on mobile
                            name: 'dashboard', 
                            params:{
                                servername: servername, 
                                passwd: password
                            }
                        })
                    }
                    else {  // still preparing for a pure webbased version
                        window.location.href = `#/dashboard/${servername}/${password}`
                    }
                }
                else {  
                    this.status(response.data.message);
                }
            })
            .catch( err => {console.log(err)})
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

    },
    mounted() {  // when ready
        $("#statusdiv").fadeOut("slow")
        this.$nextTick(function () { // Code that will run only after the entire view has been rendered
            this.fetchInfo();
            this.fetchinterval = setInterval(() => { this.fetchInfo() }, 20000)
        })
        
        if (this.electron){
            this.hostname = "localhost"
        }
    },
    beforeUnmount() {
         clearInterval( this.fetchinterval )
    },
}


</script>



<style scoped>

#content {
    background-color: whitesmoke;
    min-width: 680px;
}

.infobutton{
    width: 240px;
    min-width: 240px;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    background-color: whitesmoke;
}

</style>
