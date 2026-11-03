import { createRoot } from 'react-dom/client'
import { App } from './App'
import { WhiteNeutral } from './whiteNeutral'
import './styles.css'
import './compact-in-room.css'

// held inside another app's page: it lies flat in that page rather than as a page of its own (only while compact)
if (window.parent !== window.top) document.documentElement.setAttribute('data-held-in-room', '')

const root = document.getElementById('root')
if (!root) throw new Error('Pure3D root element not found')
createRoot(root).render(
  <>
    <WhiteNeutral />
    <App />
  </>,
)
