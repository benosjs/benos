import { mount } from 'svelte'
import Main from './SvelteApp.svelte'
import './styles.css'

mount(Main, { target: document.querySelector('#main') })
window.__jfbReady = true
