
import { createApp } from 'vue'
import App from './App.vue'
import { createRouter } from './router'


const router = createRouter()
const vApp = createApp(App)

vApp.use(router)
vApp.config.unwrapInjectedRef = true  // should not be neccecary in future versions (suppress specific warning)



// wait until router is ready before mounting to ensure hydration match
router.isReady().then(() => {
    vApp.mount('#app')
})