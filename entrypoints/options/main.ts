import { mount } from 'svelte';
import '@/src/ui/base.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
