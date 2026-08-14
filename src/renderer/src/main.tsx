import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import MiniPlayer from './MiniPlayer'
import './styles/global.css'

const isMini = window.location.hash.startsWith('#/mini')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{isMini ? <MiniPlayer /> : <App />}</React.StrictMode>
)
