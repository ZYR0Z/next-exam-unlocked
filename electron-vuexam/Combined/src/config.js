const config = {
  workdirectory : "/home/student/SHARE",
  tempdirectory : "/tmp",
  publicdirectory: "public/files/",
  port: 3000,
  httpPort: 8000,
  multicastClientPort: 6024,
  hostip: "0.0.0.0",
  development: true,  // disable kiosk mode on exam mode and other stuff (autofill input fields)
  examServerList: {},
  clientinfo: {}
}


module.exports =  config 