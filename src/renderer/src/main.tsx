import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import MiniPlayer from './MiniPlayer'
import MiniSettings from './MiniSettings'
import './styles/global.css'

const hash = window.location.hash
const view = hash.startsWith('#/mini-settings') ? (
  <MiniSettings />
) : hash.startsWith('#/mini') ? (
  <MiniPlayer />
) : (
  <App />
)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{view}</React.StrictMode>
)
